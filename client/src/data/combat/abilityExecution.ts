import type { Ability, Effect, PassiveTrigger, Trigger, TriggerOutcome } from './abilities';
import { MIN_THREAT_MULTIPLIER, stackCap, stackKey, tickStack, type ActiveBuff, type ActiveDot, type ActiveHot, type BuffableStat, type Stats } from '../units/stats';
import type { AttackCategory, DamageElement, WeaponItem } from '../gear';
import { WEAPON_TYPE_DATA } from '../gear/weapons';
import { COMBAT_TEXT_COLOR, DAMAGE_ELEMENT_COLOR } from '../constants';
import { applyDR, CRIT_MULTIPLIER, getOffense, rollCrit, rollDamage, rollHit, type HitOutcome, type Offense } from './attackResolution';
import { randInt, rollScaled } from '../random';
import { bodyCenter, bodyDistance, bodySight, type Pos } from '../world/grid';
import { basicAttack, bodySize, isAlly, type EnemyInstance } from '../units/enemies';
import type { SummonRequest } from '../units/summons';

// ─── Shared resolution for every ability used by a party member OR an enemy ──────
//
// executeAction is pure: it rolls everything and returns an ActionOutcome describing what
// happened. The caller (hooks/useActionOutcomes: landOutcome) writes it into party/enemy state.

type BuffEffect = Extract<Effect, { type: 'buff' | 'debuff' }>;

export type UnitRef = { side: 'party'; idx: number } | { side: 'enemy'; id: string };

export interface CombatUnit {
  ref: UnitRef;
  name: string;
  stats: Stats;
  pos: Pos;
  /** Its body's side in tiles (a large creature's 2; default 1): `pos` is then its top-left tile (world/grid.ts). */
  size?: number;
  /** A creature summoned by the party (ref side 'enemy', fighting on the party's side): it builds threat. */
  allied?: boolean;
  /** Its HP now (none: taken as alive): a unit this action has brought down sets off no triggers. */
  hp?: number;
  /** Its active buffs: the triggers on it (ActiveBuff.trigger). */
  buffs?: ActiveBuff[];
  /** Its basic attack, for a trigger's weaponAttack: a party member's held weapon, a creature's basicAttack. */
  weaponAttack?: Ability;
}

/**
 * The key a unit's threat is kept under (CombatState.threat): party members and summoned allies have one;
 * hostile enemies don't (they hold no threat).
 */
export const threatKey = (u: Pick<CombatUnit, 'ref' | 'allied'>): string | undefined =>
  u.ref.side === 'party' || u.allied ? unitKey(u.ref) : undefined;

/**
 * Party member `idx` as a combat unit (`name` blank falls back to 'Party[idx]'). `live`: its HP, buffs, held
 * weapon and its class's passive triggers now, for triggers (none: it sets off none of its own).
 */
export const memberUnit = (idx: number, name: string | undefined, stats: Stats, pos: Pos,
  live?: { hp: number; buffs: ActiveBuff[]; weapon: WeaponItem | null; passiveTriggers?: readonly PassiveTrigger[] }): CombatUnit => {
  const weaponAttack = live?.weapon ? toAction('weapon-attack', live.weapon) : null;
  const ref: UnitRef = { side: 'party', idx };
  return {
    ref, name: name || `Party[${idx}]`, stats, pos,
    ...(live ? { hp: live.hp, buffs: [...live.buffs, ...passiveTriggerBuffs(live.passiveTriggers, unitKey(ref))] } : {}),
    ...(weaponAttack ? { weaponAttack } : {}),
  };
};

/** A creature (an enemy or a summoned ally) as a combat unit, as it is now. */
export const creatureUnit = (e: EnemyInstance): CombatUnit => {
  const weaponAttack = basicAttack(e.classData);
  return {
    ref: { side: 'enemy', id: e.id },
    name: `${e.classData.name} (lv${e.level})`,
    stats: e.stats,
    pos: e.pos,
    ...(e.classData.large ? { size: bodySize(e.classData) } : {}),
    hp: e.currentHp,
    // Its buffs, and its kind's passive triggers (always on)
    buffs: [...e.buffs, ...passiveTriggerBuffs(e.classData.passiveTriggers, e.id)],
    ...(weaponAttack ? { weaponAttack } : {}),
    ...(isAlly(e) ? { allied: true } : {}),
  };
};

/** Accumulated changes to one unit from a single action. */
export interface UnitChange {
  ref: UnitRef;
  damage: number;
  heal: number;
  mpSpent: number;
  /** MP it regains (heals that restoresMP), up to its max. */
  mpRestored: number;
  buffs: ActiveBuff[];
  hots: ActiveHot[];
  dots: ActiveDot[];
  /** Dies now, whatever its HP: the caster of a selfDestruct ability. */
  slain?: boolean;
}

export interface FloatEvent { pos: Pos; text: string; color: string }

export interface ActionOutcome {
  changes: UnitChange[];
  floats: FloatEvent[];
  /**
   * Threat changes, the caster's first, then any trigger bearer's that acted (applied by applyThreatChange, for
   * party-side units only: threatKey).
   */
  threat: UnitThreat[];
  /** Creatures the caster summons (a 'summon' effect): placed and added to the fight where the outcome lands. */
  summons?: ActionSummon[];
}

/** A summon of the outcome; `by`: its summoner, when not the action's caster (a trigger's bearer). */
export type ActionSummon = SummonRequest & { by?: CombatUnit };

export interface UnitThreat { unit: CombatUnit; change: ThreatChange }

/** A change to one party-side unit's threat (a member's or a summoned ally's), before its threatMultiplier. */
export interface ThreatChange {
  gain: number;     // flat threat gained (damage, heals, buffs, positive threat effects)
  loss?: number;    // flat threat lost (negative threat effects)
  percent?: number; // % of their threat (after the gain): positive raises it, negative lowers it
}

export const unitKey = (ref: UnitRef) => ref.side === 'party' ? `party-${ref.idx}` : ref.id;

// ─── Effect helpers ───────────────────────────────────────────────────────────

/** Decrement every entry's duration and drop the expired ones (buffs, HoTs, DoTs). */
export function tickDurations<T extends { roundsRemaining: number }>(list: T[]): T[] {
  return list.map(x => ({ ...x, roundsRemaining: x.roundsRemaining - 1 })).filter(x => x.roundsRemaining > 0);
}

/** The last stack id handed out (effectToBuffs): each application of a buff or debuff effect gets its own. */
let stackSeq = 0;

/**
 * Build ActiveBuff entries from a buff/debuff Effect: one per stat changed, and one for its trigger. Debuff amounts
 * are always negative. `sourceKey`: the unitKey of who puts it on (a trigger's 'source'). The entries are one stack
 * (ActiveBuff.stack), capped when they land (addBuffs).
 */
export function effectToBuffs(eff: BuffEffect, idPrefix: string, source: string, sourceKey: string): ActiveBuff[] {
  const signed = (v: number) => eff.type === 'debuff' ? -Math.abs(v) : v;
  const stack = { key: stackKey(source, eff), id: ++stackSeq, max: stackCap(eff) };
  return ([
    ...(Object.entries(eff.stats ?? {}) as [BuffableStat, number][]).map(([stat, amount]) => ({
      id: `${idPrefix}-${stat}`, source, damageElement: eff.damageElement,
      stat, amount: signed(amount), roundsRemaining: eff.rounds,
    })),
    ...(Object.entries(eff.statsPercent ?? {}) as [BuffableStat, number][]).map(([stat, pct]) => ({
      id: `${idPrefix}-${stat}-pct`, source, damageElement: eff.damageElement,
      stat, amount: 0, percent: signed(pct), roundsRemaining: eff.rounds,
    })),
    // A trigger changes no stat (like a root)
    ...(eff.trigger ? [{
      id: `${idPrefix}-trigger`, source, damageElement: eff.damageElement,
      stat: 'movement' as const, amount: 0, roundsRemaining: eff.rounds,
      trigger: { def: eff.trigger, sourceKey, debuff: eff.type === 'debuff' },
    }] : []),
  ] as ActiveBuff[]).map(b => ({ ...b, stack }));
}

/**
 * A unit's passive triggers (PassiveTrigger: its class's or creature's, always on) as trigger entries like a
 * trigger buff's, for its combat unit only (never stored on it, so they never run out or show as markers). Each is
 * its own bearer's (`ownerKey`): its effects on 'source' land on itself, and its own bonuses count.
 */
export const passiveTriggerBuffs = (passives: readonly PassiveTrigger[] | undefined, ownerKey: string): ActiveBuff[] =>
  (passives ?? []).map(p => ({
    id: `passive-${p.name}-trigger`, source: p.name, damageElement: p.damageElement,
    stat: 'movement', amount: 0, roundsRemaining: Infinity,
    trigger: { def: p.trigger, sourceKey: ownerKey, debuff: false },
  }));

/** A root (Effect 'root') as an ActiveBuff: no stat change, it just holds the unit in place (isRooted). */
export const rootToBuff = (eff: Extract<Effect, { type: 'root' }>, idPrefix: string, source: string): ActiveBuff => ({
  id: `${idPrefix}-root`, source, damageElement: eff.damageElement,
  stat: 'movement', amount: 0, roots: true, roundsRemaining: eff.rounds,
});

/** Threat a root or a trigger generates when it lands (like a debuff's, which is its total stat change). */
const ROOT_THREAT = 5;
const TRIGGER_THREAT = 5;

/**
 * A DoT `actor` puts on someone with `eff`: half its damage bonus (`off`, as of the attack or scaled trigger result
 * that lands it; none: flat) added per round, its penetration kept for the ticks.
 */
const newDot = (name: string, eff: Extract<Effect, { type: 'dot' }>, actor: CombatUnit, off?: Offense): ActiveDot => ({
  name, damageElement: eff.damageElement, damagePerRound: Math.floor(eff.damagePerRound + (off?.damage ?? 0) / 2),
  roundsRemaining: eff.rounds, sourceKey: threatKey(actor),
  penetration: off?.penetration, elementPenetration: off?.elementPenetration, damagesMP: eff.damagesMP,
  ...tickStack(name, eff),
});

/** Total absolute stat change of a buff/debuff (and TRIGGER_THREAT for a trigger): used as its threat value. */
export function buffMagnitude(eff: BuffEffect): number {
  return [...Object.values(eff.stats ?? {}), ...Object.values(eff.statsPercent ?? {})]
    .reduce((sum: number, v) => sum + Math.abs(v ?? 0), eff.trigger ? TRIGGER_THREAT : 0);
}

/** One event a trigger can react to (Trigger.when), from the bearer's side; attacks carry how the roll went. */
interface TriggerEvent {
  when: Trigger['when'];
  outcome?: HitOutcome;
  category?: AttackCategory;
  /** The attack is a weapon attack (Trigger.weaponOnly). */
  weapon?: boolean;
}

/** Whether `t` reacts to event `ev` (its chance aside). */
function triggerMatches(t: Trigger, ev: TriggerEvent): boolean {
  if (t.when !== ev.when) return false;
  if (!ev.outcome) return true;
  const on: TriggerOutcome[] = Array.isArray(t.on) ? t.on : [t.on ?? 'hit'];
  if (!on.includes(ev.outcome) && !(ev.outcome !== 'hit' && on.includes('stopped'))) return false;
  if (t.categories && !(ev.category && t.categories.includes(ev.category))) return false;
  return !t.weaponOnly || !!ev.weapon;
}

/** Threat from damage dealt: HP damage counts in full, MP damage (damagesMP effects) counts half. */
export const damageThreat = (amount: number, toMp?: boolean) => (toMp ? amount / 2 : amount);

/** Threat from healing given (heals, HoT ticks): one and a half times the amount. */
export const healThreat = (amount: number) => amount * 1.5;

/**
 * A party-side unit's threat after a change: the gain (scaled by its threatMultiplier) is added, then the
 * percent change, then the flat loss. Gains, including a percent rise, are scaled by threatMultiplier;
 * reductions aren't. Never below 0.
 */
export function applyThreatChange(threat: number, change: ThreatChange, threatMultiplier: number): number {
  const mult = Math.max(MIN_THREAT_MULTIPLIER, threatMultiplier);
  let t = Math.max(0, threat) + Math.max(0, change.gain) * mult;
  const pct = change.percent ?? 0;
  t += t * (pct / 100) * (pct > 0 ? mult : 1);
  t -= Math.max(0, change.loss ?? 0);
  return Math.max(0, t);
}

/** Whether a threat change changes anything (so unchanged threat isn't written back). */
export const changesThreat = (change: ThreatChange) => change.gain > 0 || !!change.loss || !!change.percent;

/**
 * Sum one round of DoT damage against the target (after DR), split into HP and MP damage, with
 * per-source threat totals.
 */
export function tickDots(dots: ActiveDot[], target: Stats): { damage: number; mpDamage: number; threatBySource: Map<string, number> } {
  let damage = 0, mpDamage = 0;
  const threatBySource = new Map<string, number>();
  for (const dot of dots) {
    const dmg = applyDR(dot.damagePerRound, dot.damageElement, target, dot.penetration, dot.elementPenetration);
    if (dot.damagesMP) mpDamage += dmg;
    else damage += dmg;
    if (dot.sourceKey !== undefined) {
      threatBySource.set(dot.sourceKey, (threatBySource.get(dot.sourceKey) ?? 0) + damageThreat(dmg, dot.damagesMP));
    }
  }
  return { damage, mpDamage, threatBySource };
}

/**
 * HoT heal for one round on a unit. Caster healing is baked into healPerRound when the HoT is created; half the
 * unit's own healingReceived (rounded down, as it stands now) is added to each tick.
 */
export const tickHots = (hots: ActiveHot[], target: Stats) => hots.reduce((sum, h) => sum + h.healPerRound + Math.floor(target.healingReceived / 2), 0);

// ─── Action normalisation ─────────────────────────────────────────────────────

/**
 * Turn an action-bar slot into a plain Ability. The basic weapon attack and `useWeapon` abilities
 * get the weapon's damage prepended as their first damage effect and take its attackCategory.
 */
export const weaponDamageEffect = (weapon: WeaponItem): Extract<Effect, { type: 'damage' }> => ({
  type: 'damage', appliesTo: 'target',
  damageElement: weapon.damageElement, minDamage: weapon.minDamage, maxDamage: weapon.maxDamage,
});

export function toAction(content: Ability | 'weapon-attack', weapon: WeaponItem | null): Ability | null {
  if (content !== 'weapon-attack' && !content.useWeapon) return content;
  if (!weapon) return null;
  const weaponHit = weaponDamageEffect(weapon);
  if (content === 'weapon-attack') {
    return {
      name: 'Attack', mpCost: 0, apCost: WEAPON_TYPE_DATA[weapon.weaponType].attackAp, range: weapon.range, target: 'enemy',
      attackCategory: weapon.attackCategory, weaponHit: true, effects: [weaponHit],
    };
  }
  return { ...content, useWeapon: false, weaponHit: true, attackCategory: weapon.attackCategory, effects: [weaponHit, ...content.effects] };
}

// ─── Execution ────────────────────────────────────────────────────────────────

/** Log every combat roll to the console: dev builds only (`env` is missing outside Vite, e.g. in scripts). */
const COMBAT_LOG = !!import.meta.env?.DEV;

const STOPPED_TEXT: Record<Exclude<HitOutcome, 'hit'>, string> = {
  miss: 'Missed!', dodge: 'Dodged!', parry: 'Parried!', block: 'Blocked!',
};

/** What executeAction may need of the fight beyond the units it is given. */
export interface ActionWorld {
  /** The map's floor: a triggered weapon attack needs sight of its target (none: not checked). */
  floors?: ReadonlySet<string>;
  /** A living unit of the fight as it is now, by unitKey: a trigger's effects on 'source'. */
  unitByKey?: (key: string) => CombatUnit | undefined;
}

/**
 * Resolve an ability. `targets` are the units the ability lands on:
 * - target 'enemy': every hostile unit in the affected area (each rolls to hit separately)
 * - target 'ally':  the single ally clicked
 * - target 'self':  ignored; its 'target' effects land on the caster (like its 'caster' ones)
 * - target 'tile':  ignored; `aimAt` is the tile (a summon appears there)
 * `allies` are the units on the caster's side in the ability's area (the caster too, if it stands in it):
 * its 'allies' effects land on each of them (areas.ts unitsInArea finds them).
 * Triggers (abilities.ts Trigger) on the units involved fire as its hit rolls and heals happen, their results
 * landing in the same outcome.
 */
export function executeAction(caster: CombatUnit, action: Ability, targets: CombatUnit[], aimAt?: Pos, allies: CombatUnit[] = [], world: ActionWorld = {}): ActionOutcome {
  const changes = new Map<string, UnitChange>();
  const floats: FloatEvent[] = [];
  const summons: ActionSummon[] = [];
  const threats = new Map<string, UnitThreat>();

  const changeFor = (u: CombatUnit): UnitChange => {
    const key = unitKey(u.ref);
    let c = changes.get(key);
    if (!c) changes.set(key, c = { ref: u.ref, damage: 0, heal: 0, mpSpent: 0, mpRestored: 0, buffs: [], hots: [], dots: [] });
    return c;
  };
  /** The threat change of a unit acting in this action (the caster, or a trigger's bearer). */
  const threatOf = (u: CombatUnit): ThreatChange => {
    const key = unitKey(u.ref);
    let t = threats.get(key);
    if (!t) threats.set(key, t = { unit: u, change: { gain: 0, loss: 0, percent: 0 } });
    return t.change;
  };
  threatOf(caster);
  const float = (u: CombatUnit, text: string, color: string) => floats.push({ pos: bodyCenter(u), text, color });
  // Every roll, to the browser console, in dev builds only (for balancing; players never see it)
  const log = (by: CombatUnit, target: CombatUnit, msg: string) => { if (COMBAT_LOG) console.log(`[Combat] ${by.name} → ${target.name}: ${msg}`); };
  /** Still standing, after what this action has done to it so far. */
  const alive = (u: CombatUnit) => {
    const c = changes.get(unitKey(u.ref));
    return !c?.slain && (u.hp === undefined || u.hp - (c?.damage ?? 0) + (c?.heal ?? 0) > 0);
  };
  // An effect with no element of its own takes its ability's (displayElement): e.g. a buff on a holy ability
  // is holy, so its marker shows the holy color
  const effectsOf = (a: Ability) => a.effects.map((e): Effect => (e.damageElement || !a.displayElement ? e : { ...e, damageElement: a.displayElement }));

  /**
   * Heal / HoT / DoT / buff / debuff / damage / threat / summon / root from `actor` on a unit that gets it
   * without a hit roll: a friendly unit or the caster, or anyone, for a trigger's results (`flat`: damage reduced
   * by the recipient's defenses, no crit, and they set off no triggers; amounts flat, unless `scaleAs`: the actor's
   * own bonuses count, damage's as an attack of that category would have them, as on a buff it cast on itself).
   */
  const applySupport = (actor: CombatUnit, recipient: CombatUnit, eff: Effect, o: { ability: string; healMultiplier?: number; flat?: boolean; scaleAs?: AttackCategory }) => {
    const c = changeFor(recipient);
    const threat = threatOf(actor);
    const onOther = unitKey(recipient.ref) !== unitKey(actor.ref);
    const prefix = `${o.ability}-${unitKey(recipient.ref)}`;
    // Whether the actor's stats add to its amounts (they do, except on a flat trigger result)
    const bonuses = !o.flat || o.scaleAs !== undefined;
    // A scaled trigger result's offense: its damage bonus and penetration
    const off = o.flat && o.scaleAs && 'damageElement' in eff && eff.damageElement ? getOffense(actor.stats, o.scaleAs, eff.damageElement) : undefined;
    switch (eff.type) {
      case 'damage': {
        const rolled = rollScaled(eff.minDamage, eff.maxDamage, off?.damage ?? 0);
        const amount = o.flat ? applyDR(rolled, eff.damageElement, recipient.stats, off?.penetration, off?.elementPenetration) : rolled;
        if (eff.damagesMP) {
          c.mpSpent += amount;
          float(recipient, `-${amount} MP`, COMBAT_TEXT_COLOR.mpDamage);
        } else {
          c.damage += amount;
          float(recipient, `-${amount}`, o.flat ? DAMAGE_ELEMENT_COLOR[eff.damageElement] : COMBAT_TEXT_COLOR.damage);
        }
        if (o.flat) log(actor, recipient, `TRIGGERED ${amount}${eff.damagesMP ? ' MP' : ''} (${eff.damageElement})`);
        if (onOther) threat.gain += damageThreat(amount, eff.damagesMP);
        break;
      }
      case 'heal': {
        // Heals crit like magic damage of their element: magic crit% + that element's crit% (HoTs and flat
        // heals never crit). The recipient's healingReceived is added once, after the crit and multiplier.
        const crit = !o.flat && rollCrit(getOffense(actor.stats, 'magic', eff.damageElement));
        const base = rollScaled(eff.minHeal, eff.maxHeal, bonuses ? actor.stats.healing : 0);
        const amount = Math.max(0, base) * (crit ? CRIT_MULTIPLIER : 1) * (o.healMultiplier ?? 1) + recipient.stats.healingReceived;
        if (eff.restoresMP) c.mpRestored += amount;
        else c.heal += amount;
        log(actor, recipient, `HEAL${crit ? ' CRIT' : ''} ${amount}${eff.restoresMP ? ' MP' : ''} (${eff.damageElement})`);
        if (amount > 0) float(recipient, `+${amount}${eff.restoresMP ? ' MP' : ''}${crit ? ' CRIT!' : ''}`, eff.restoresMP ? COMBAT_TEXT_COLOR.mpRestore : COMBAT_TEXT_COLOR.heal);
        threat.gain += healThreat(amount);
        if (!o.flat) {
          fireTriggers(actor, recipient, { when: 'healing' }, true);
          fireTriggers(recipient, actor, { when: 'healed' }, true);
        }
        break;
      }
      case 'hot':
        c.hots.push({
          name: o.ability, damageElement: eff.damageElement,
          healPerRound: bonuses ? Math.floor(eff.healPerRound + actor.stats.healing / 2) : eff.healPerRound, roundsRemaining: eff.rounds,
          ...tickStack(o.ability, eff),
        });
        float(recipient, '+HoT', COMBAT_TEXT_COLOR.heal);
        break;
      case 'dot': {
        // Off an attack, a DoT scales with the attacker's offense (resolveAttack); here it is flat, unless a
        // scaled trigger result (the same way as off an attack)
        const dot = newDot(o.ability, eff, actor, off);
        c.dots.push(dot);
        float(recipient, `${o.ability}!`, COMBAT_TEXT_COLOR.dot);
        if (onOther) threat.gain += damageThreat(dot.damagePerRound, eff.damagesMP);
        break;
      }
      case 'buff':
      case 'debuff':
        c.buffs.push(...effectToBuffs(eff, prefix, o.ability, unitKey(actor.ref)));
        float(recipient, `${o.ability}!`, eff.type === 'debuff' && onOther ? COMBAT_TEXT_COLOR.dot : COMBAT_TEXT_COLOR.heal);
        threat.gain += buffMagnitude(eff);
        break;
      case 'threat': {
        const amount = eff.amount ?? 0;
        if (amount > 0) threat.gain += amount;
        else threat.loss = (threat.loss ?? 0) - amount;
        threat.percent = (threat.percent ?? 0) + (eff.percent ?? 0);
        break;
      }
      case 'summon':
        summons.push({
          creature: eff.creature, rounds: eff.rounds, max: eff.max ?? 1, ability: o.ability,
          ...(actor !== caster ? { by: actor } : action.target === 'tile' && aimAt ? { at: { ...aimAt } } : {}),
        });
        break;
      case 'root':
        c.buffs.push(rootToBuff(eff, prefix, o.ability));
        float(recipient, 'Rooted!', COMBAT_TEXT_COLOR.dot);
        threat.gain += ROOT_THREAT;
        break;
    }
  };

  /** The unit that put a trigger on (its effects on 'source'), if it is still in the fight. */
  const sourceUnit = (key: string): CombatUnit | undefined => {
    const known = [caster, ...targets, ...allies].find(u => unitKey(u.ref) === key);
    const u = world.unitByKey?.(key) ?? known;
    return u && alive(u) ? u : undefined;
  };

  /**
   * The triggers on `bearer` that react to `ev` (with `other` the other unit of it) fire: each at its chance,
   * while the bearer stands. `attacks`: their weapon attacks may happen (not inside a triggered attack).
   */
  function fireTriggers(bearer: CombatUnit, other: CombatUnit, ev: TriggerEvent, attacks: boolean) {
    for (const b of bearer.buffs ?? []) {
      const t = b.trigger;
      if (!t || !triggerMatches(t.def, ev) || !alive(bearer)) continue;
      if (t.def.chance !== undefined && randInt(1, 100) > t.def.chance) continue;
      const name = b.source ?? 'Trigger';
      log(bearer, other, `TRIGGER ${name} (${ev.when}${ev.outcome ? ` ${ev.outcome}` : ''})`);
      float(bearer, `${name}!`, t.debuff ? COMBAT_TEXT_COLOR.dot : COMBAT_TEXT_COLOR.heal);
      for (const eff of t.def.effects) {
        if (eff.type === 'weaponAttack') {
          if (attacks) triggeredAttack(bearer, other);
          continue;
        }
        const recipient = eff.appliesTo === 'target' ? other
          : eff.appliesTo === 'caster' ? bearer
          : eff.appliesTo === 'source' ? sourceUnit(t.sourceKey)
          : undefined;
        // On a buff the bearer cast on itself, its own bonuses count (damage's as of the attack that set it off)
        const own = t.sourceKey === unitKey(bearer.ref);
        if (recipient) applySupport(bearer, recipient, eff, { ability: name, flat: true, scaleAs: own ? ev.category ?? 'magic' : undefined });
      }
    }
  }

  /** A trigger's weaponAttack: the bearer's basic attack on `target`, if it is in range and sight. */
  const triggeredAttack = (bearer: CombatUnit, target: CombatUnit) => {
    const attack = bearer.weaponAttack;
    if (!attack || !alive(target) || bodyDistance(bearer, target) > attack.range) return;
    if (world.floors && !bodySight(bearer, target, world.floors)) return;
    resolveAttack(bearer, attack, target, true);
  };

  /**
   * One attack roll of an enemy-target ability against one target, and its effects there if it lands (damage,
   * DoTs, debuffs, roots), then the triggers it sets off. `triggered`: a trigger's weapon attack (it sets off no
   * more of those). Returns whether it damaged the target.
   */
  const resolveAttack = (attacker: CombatUnit, act: Ability, target: CombatUnit, triggered: boolean): boolean => {
    const targetEffects = effectsOf(act).filter(e => e.appliesTo === 'target');
    const damageEffects = targetEffects.filter((e): e is Extract<Effect, { type: 'damage' }> => e.type === 'damage');
    const dotEffects    = targetEffects.filter((e): e is Extract<Effect, { type: 'dot' }> => e.type === 'dot');
    const debuffEffects = targetEffects.filter((e): e is Extract<Effect, { type: 'debuff' }> => e.type === 'debuff');
    const rootEffects   = targetEffects.filter((e): e is Extract<Effect, { type: 'root' }> => e.type === 'root');
    const category = act.attackCategory ?? 'melee';
    // The primary element (first damage component, else the first DoT) drives the hit roll and DoT scaling.
    const primaryElement: DamageElement = damageEffects[0]?.damageElement ?? dotEffects[0]?.damageElement ?? 'physical';
    const offense = getOffense(attacker.stats, category, primaryElement);
    const offenseFor = (el: DamageElement): Offense => el === primaryElement ? offense : getOffense(attacker.stats, category, el);
    const threat = threatOf(attacker);

    const hit = rollHit(offense, category, target.stats);
    // A weapon attack (Trigger.weaponOnly): a party member's held weapon, or a creature's useWeapon ability
    const weapon = !!act.weaponHit || !!act.useWeapon;
    const fire = () => {
      const ev = { outcome: hit.outcome, category, weapon };
      fireTriggers(attacker, target, { when: 'attacking', ...ev }, !triggered);
      fireTriggers(target, attacker, { when: 'attacked', ...ev }, !triggered);
    };
    if (hit.outcome !== 'hit') {
      log(attacker, target, `${hit.outcome.toUpperCase()} (${primaryElement})`);
      float(target, STOPPED_TEXT[hit.outcome], COMBAT_TEXT_COLOR.stopped);
      fire();
      return false;
    }

    const c = changeFor(target);
    const suffix = (hit.crit ? ' CRIT!' : '') + (hit.glancing ? ' Glancing' : '');
    // Each damage component rolls and is reduced the same way; damagesMP ones land on MP instead of HP
    let dealt = 0, dealtMp = 0;
    for (const eff of damageEffects) {
      const off = offenseFor(eff.damageElement);
      const dmg = rollDamage(off, eff.damageElement, eff.minDamage, eff.maxDamage, target.stats, hit);
      if (eff.damagesMP) dealtMp += dmg.final;
      else dealt += dmg.final;
      log(attacker, target, `${hit.crit ? 'CRIT' : 'HIT'}${hit.glancing ? ' (glancing)' : ''} ${dmg.final}${eff.damagesMP ? ' MP' : ''} (${eff.damageElement}) | roll=${dmg.roll} (+dmg=${off.damage}) raw=${dmg.raw} -DR=${dmg.raw - dmg.final}`);
      float(target, `-${dmg.final}${eff.damagesMP ? ' MP' : ''}${suffix}`, eff.damagesMP ? COMBAT_TEXT_COLOR.mpDamage : DAMAGE_ELEMENT_COLOR[eff.damageElement]);
    }
    const damaged = dealt > 0 || dealtMp > 0;
    if (damaged) {
      c.damage += dealt;
      c.mpSpent += dealtMp;
      threat.gain += damageThreat(dealt) + damageThreat(dealtMp, true);
    }

    for (const dotEffect of dotEffects) {
      const dot = newDot(act.name, dotEffect, attacker, offense);
      c.dots.push(dot);
      // One tick's worth of threat on application; later ticks add threat via sourceKey
      threat.gain += damageThreat(dot.damagePerRound, dotEffect.damagesMP);
    }
    if (dotEffects.length > 0 && damageEffects.length === 0) float(target, 'Hit!', COMBAT_TEXT_COLOR.dot);
    for (const debuffEffect of debuffEffects) {
      c.buffs.push(...effectToBuffs(debuffEffect, `${act.name}-${unitKey(target.ref)}`, act.name, unitKey(attacker.ref)));
      threat.gain += buffMagnitude(debuffEffect);
    }
    for (const rootEffect of rootEffects) applySupport(attacker, target, rootEffect, { ability: act.name });
    fire();
    return damaged;
  };

  changeFor(caster).mpSpent = action.mpCost;
  const effects = effectsOf(action);
  const targetEffects = effects.filter(e => e.appliesTo === 'target');
  const casterEffects = effects.filter(e => e.appliesTo === 'caster');
  const allyEffects = effects.filter(e => e.appliesTo === 'allies');
  const support = { ability: action.name };

  let targetsDamaged = 0;
  if (action.target === 'enemy') {
    for (const target of targets) if (resolveAttack(caster, action, target, false)) targetsDamaged++;
  } else if (action.target === 'ally') {
    for (const target of targets) for (const eff of targetEffects) applySupport(caster, target, eff, support);
  } else if (action.target === 'self') {
    // A self ability's target is its caster (e.g. Rage's buff, written on 'target')
    for (const eff of targetEffects) applySupport(caster, caster, eff, support);
  }

  // Effects on the caster's side in the area: they always land (no hit roll), like any support effect
  for (const ally of allies) for (const eff of allyEffects) applySupport(caster, ally, eff, support);

  // Caster effects. Heals on an enemy-targeting ability scale with targets damaged (e.g. drain life).
  const healMultiplier = action.target === 'enemy' ? Math.max(1, targetsDamaged) : 1;
  for (const eff of casterEffects) applySupport(caster, caster, eff, { ...support, healMultiplier });

  if (action.selfDestruct) {
    changeFor(caster).slain = true;
    float(caster, '💀', COMBAT_TEXT_COLOR.damage);
  }

  return {
    changes: [...changes.values()], floats,
    threat: [...threats.values()],
    ...(summons.length ? { summons } : {}),
  };
}

import type { Ability, Effect, Trigger, TriggerOutcome } from './abilities';
import { atLevel, levelScale, mpCostAt } from './abilities';
import { MIN_THREAT_MULTIPLIER, auraToBuff, effectToBuffs, nextEffectSeq, pickDispelled, rootToBuff, tickStack, type ActiveBuff, type ActiveDot, type ActiveHot, type Stats } from '../units/stats';
import type { AttackCategory, DamageElement, WeaponItem } from '../gear';
import { WEAPON_TYPE_DATA } from '../gear/weapons';
import { COMBAT_TEXT_COLOR, DAMAGE_ELEMENT_COLOR } from '../constants';
import { applyDR, CRIT_MULTIPLIER, damageFactor, getOffense, rollCrit, rollDamage, rollHit, type HitOutcome, type Offense } from './attackResolution';
import { randInt, rollScaled } from '../random';
import { bodyCenter, bodyDistance, bodySight, type Pos } from '../world/grid';
import { basicAttack, bodySize, creatureName, isAlly, type EnemyInstance } from '../units/enemies';
import type { SummonRequest } from '../units/summons';
import { actionEvent, record } from '../../devtools/runRecorder'; // TEMP (testing only)

// ─── Shared resolution for every ability used by a party member OR an enemy ──────
//
// executeAction is pure: it rolls everything and returns an ActionOutcome describing what
// happened. The caller (hooks/useActionOutcomes: landOutcome) writes it into party/enemy state.

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
  /** A summoned creature's summoner (its unitKey): what a 'summonsOnly' ability checks. */
  owner?: string;
  /** Its HP now (none: taken as alive): a unit this action has brought down sets off no triggers. */
  hp?: number;
  /** Its MP now (none: not known; only the run recorder reads it: devtools/runRecorder.ts). */
  mp?: number;
  /** Its active buffs: the triggers on it (ActiveBuff.trigger), and what a dispel can take. */
  buffs?: ActiveBuff[];
  /** Its HoTs and DoTs now: what a dispel can take. */
  hots?: ActiveHot[];
  dots?: ActiveDot[];
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
 * Party member `idx` as a combat unit (`name` blank falls back to 'Party[idx]'). `live`: its HP, buffs (its passive
 * effects among them) and held weapon now, for triggers (none: it sets off none of its own).
 */
export const memberUnit = (idx: number, name: string | undefined, stats: Stats, pos: Pos,
  live?: { hp: number; mp?: number; buffs: ActiveBuff[]; hots?: ActiveHot[]; dots?: ActiveDot[]; weapon: WeaponItem | null }): CombatUnit => {
  const weaponAttack = live?.weapon ? toAction('weapon-attack', live.weapon) : null;
  const ref: UnitRef = { side: 'party', idx };
  return {
    ref, name: name || `Party[${idx}]`, stats, pos,
    ...(live ? { hp: live.hp, mp: live.mp, buffs: live.buffs, hots: live.hots ?? [], dots: live.dots ?? [] } : {}),
    ...(weaponAttack ? { weaponAttack } : {}),
  };
};

/** A creature (an enemy or a summoned ally) as a combat unit, as it is now. */
export const creatureUnit = (e: EnemyInstance): CombatUnit => {
  const weaponAttack = basicAttack(e.classData);
  return {
    ref: { side: 'enemy', id: e.id },
    name: `${creatureName(e)} (lv${e.level})`,
    stats: e.stats,
    pos: e.pos,
    ...(e.classData.large ? { size: bodySize(e.classData) } : {}),
    hp: e.currentHp,
    mp: e.currentMp,
    // Its buffs: its kind's passive triggers (always on) are among them
    buffs: e.buffs,
    hots: e.hots,
    dots: e.dots,
    ...(weaponAttack ? { weaponAttack } : {}),
    ...(isAlly(e) ? { allied: true } : {}),
    ...(e.summon ? { owner: e.summon.owner } : {}),
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
  /** Effects a dispel takes off it (their places: stats.ts pickDispelled), removed before the new ones above are added. */
  dispelled: number[];
  /** Dies now, whatever its HP: the caster of a selfDestruct ability. */
  slain?: boolean;
}

export interface FloatEvent {
  pos: Pos;
  text: string;
  color: string;
  /**
   * What its unit's model shows (unitKey: the unit hit, healed or affected): a white flash for damage that landed
   * (`hit`), a glow for a heal, buff or debuff (`glow`), in its effect's `element` color (its own, else its
   * ability's displayElement), else the float's. None for a miss, a dodge and the like.
   */
  fx?: { unit: string; kind: 'hit' | 'glow'; element?: DamageElement };
}

export interface ActionOutcome {
  changes: UnitChange[];
  floats: FloatEvent[];
  /**
   * Glows its models pulse with no floating text (unitKey, in the `element`'s color): a magic attack's debuff landing
   * on a party member (a melee or ranged one shows nothing).
   */
  glows?: { unit: string; element?: DamageElement }[];
  /**
   * Threat changes, the caster's first, then any trigger bearer's that acted (applied by applyThreatChange, for
   * party-side units only: threatKey).
   */
  threat: UnitThreat[];
  /** Creatures the caster summons (a 'summon' effect): placed and added to the fight where the outcome lands. */
  summons?: ActionSummon[];
  /**
   * A movement ability moved its caster (abilityMoves.ts executeMoveAction): to where, how many tiles it passed, and how
   * it is drawn, and the ability's element (the color a blink's glow shows in once it lands). The rest of the outcome is
   * already worked out from there; whoever lands it places the unit.
   */
  move?: { ref: UnitRef; to: Pos; tiles: number; style: 'dash' | 'blink'; element?: DamageElement };
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

/** Which side of the fight a unit is on: the party's (members and their summoned allies), else the enemies'. */
const onSide = (u: Pick<CombatUnit, 'ref' | 'allied'>): 'party' | 'enemy' => (u.ref.side === 'party' || u.allied ? 'party' : 'enemy');

// ─── Effect helpers ───────────────────────────────────────────────────────────

/**
 * The end of a unit's turn: its effects (buffs, HoTs, DoTs) count down a turn, and those run out drop off. One that
 * landed during this very turn (`fresh`: a buff the unit cast on itself) doesn't count it, so it lasts through the
 * others' turns until the end of its next.
 */
export function countDownTurns<T extends { turnsLeft: number; fresh?: boolean }>(list: T[]): T[] {
  return list.map(x => (x.fresh ? { ...x, fresh: undefined } : { ...x, turnsLeft: x.turnsLeft - 1 })).filter(x => x.turnsLeft > 0);
}

/**
 * Threat a buff, debuff, root or aura generates when it lands, and each effect a dispel removes, at level 1: a damage
 * hit's worth. It grows with the actor's level as damage does (effectThreat), so it keeps its weight against the
 * threat damage builds.
 */
const EFFECT_THREAT = 15;

/** The threat one buff, debuff, root, aura or dispelled effect generates, for an actor of `level`. */
export const effectThreat = (level: number) => atLevel(EFFECT_THREAT, level);

/**
 * A DoT `actor` puts on someone with `eff`: its damage per turn at the actor's level, with half the actor's damage %
 * (`off`, as of the attack that lands it; none: no bonus, as a trigger's or a support effect's), its penetration kept
 * for the ticks. Its ticks build threat for `actor` only when it is on a foe (`hostile`): damage to one's own side,
 * like a sacrifice, builds none.
 */
const newDot = (name: string, eff: Extract<Effect, { type: 'dot' }>, actor: CombatUnit, off?: Offense, hostile = true): ActiveDot => ({
  name, damageElement: eff.damageElement,
  damagePerTurn: Math.round(eff.damagePerTurn * damageFactor(actor.stats.level, off?.damage ?? 0, 0.5)),
  turnsLeft: eff.turns, sourceKey: hostile ? threatKey(actor) : undefined,
  penetration: off?.penetration, elementPenetration: off?.elementPenetration, damagesMP: eff.damagesMP,
  seq: nextEffectSeq(),
  ...tickStack(name, eff),
});

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
 * Sum one turn's DoT damage against the target (after DR), split into HP and MP damage, with
 * per-source threat totals.
 */
export function tickDots(dots: ActiveDot[], target: Stats): { damage: number; mpDamage: number; threatBySource: Map<string, number> } {
  let damage = 0, mpDamage = 0;
  const threatBySource = new Map<string, number>();
  for (const dot of dots) {
    const dmg = applyDR(dot.damagePerTurn, dot.damageElement, target, dot.penetration, dot.elementPenetration);
    if (dot.damagesMP) mpDamage += dmg;
    else damage += dmg;
    if (dot.sourceKey !== undefined) {
      threatBySource.set(dot.sourceKey, (threatBySource.get(dot.sourceKey) ?? 0) + damageThreat(dmg, dot.damagesMP));
    }
  }
  return { damage, mpDamage, threatBySource };
}

/**
 * HoT healing for one turn on a unit, split into HP and MP (the HoTs that restoresMP). The caster's level and healing %
 * are baked into healPerTurn when the HoT is created; half the unit's own healingReceived % (as it stands now) is
 * added to each tick.
 */
export function tickHots(hots: ActiveHot[], target: Stats): { heal: number; mpHeal: number } {
  let heal = 0, mpHeal = 0;
  for (const h of hots) {
    const amount = Math.round(h.healPerTurn * Math.max(0, 1 + target.healingReceived / 200));
    if (h.restoresMP) mpHeal += amount;
    else heal += amount;
  }
  return { heal, mpHeal };
}

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
  /** The tiles sight passes over on the map (ZoneData.sight): a triggered weapon attack needs sight of its target (none: not checked). */
  sight?: ReadonlySet<string>;
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
 * its 'allies' effects land on each of them (areas.ts unitsInArea finds them). An enemy-target ability's 'caster'
 * effects land only if at least one of its hit rolls hits.
 * Triggers (abilities.ts Trigger) on the units involved fire as its hit rolls and heals happen, their results
 * landing in the same outcome.
 */
export function executeAction(caster: CombatUnit, action: Ability, targets: CombatUnit[], aimAt?: Pos, allies: CombatUnit[] = [], world: ActionWorld = {}): ActionOutcome {
  const changes = new Map<string, UnitChange>();
  const floats: FloatEvent[] = [];
  const glows: NonNullable<ActionOutcome['glows']> = [];
  const summons: ActionSummon[] = [];
  const threats = new Map<string, UnitThreat>();

  const changeFor = (u: CombatUnit): UnitChange => {
    const key = unitKey(u.ref);
    let c = changes.get(key);
    if (!c) changes.set(key, c = { ref: u.ref, damage: 0, heal: 0, mpSpent: 0, mpRestored: 0, buffs: [], hots: [], dots: [], dispelled: [] });
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
  const float = (u: CombatUnit, text: string, color: string, fx?: 'hit' | 'glow', element?: DamageElement) =>
    floats.push({ pos: bodyCenter(u), text, color, ...(fx && { fx: { unit: unitKey(u.ref), kind: fx, ...(element && { element }) } }) });
  // Every roll, to the browser console, in dev builds only (for balancing; players never see it)
  const rolls: string[] = []; // for the run recorder (devtools/runRecorder.ts)
  const log = (by: CombatUnit, target: CombatUnit, msg: string) => {
    rolls.push(`${by.name} → ${target.name}: ${msg}`);
    if (COMBAT_LOG) console.log(`[Combat] ${by.name} → ${target.name}: ${msg}`);
  };
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
   * by the recipient's defenses, no crit, and they set off no triggers; amounts exactly as the data reads, whoever
   * the bearer is: none of the actor's bonuses count).
   */
  const applySupport = (actor: CombatUnit, recipient: CombatUnit, eff: Effect, o: { ability: string; healMultiplier?: number; flat?: boolean }) => {
    const c = changeFor(recipient);
    const threat = threatOf(actor);
    const onOther = unitKey(recipient.ref) !== unitKey(actor.ref);
    // Damage builds threat only against a foe: what hits the actor's own side (itself or an ally) builds none
    const hostile = onSide(actor) !== onSide(recipient);
    const prefix = `${o.ability}-${unitKey(recipient.ref)}`;
    // Whether the actor's stats add to its amounts (they do, except on a flat trigger result). Its level always does
    const bonuses = !o.flat;
    const level = actor.stats.level;
    switch (eff.type) {
      case 'damage': {
        const rolled = rollScaled(eff.minDamage, eff.maxDamage, levelScale(level));
        const amount = o.flat ? applyDR(rolled, eff.damageElement, recipient.stats) : rolled;
        if (eff.damagesMP) {
          c.mpSpent += amount;
          float(recipient, `-${amount} MP`, COMBAT_TEXT_COLOR.mpDamage, 'hit');
        } else {
          c.damage += amount;
          float(recipient, `-${amount}`, o.flat ? DAMAGE_ELEMENT_COLOR[eff.damageElement] : COMBAT_TEXT_COLOR.damage, 'hit');
        }
        if (o.flat) log(actor, recipient, `TRIGGERED ${amount}${eff.damagesMP ? ' MP' : ''} (${eff.damageElement})`);
        if (hostile) threat.gain += damageThreat(amount, eff.damagesMP);
        break;
      }
      case 'heal': {
        // Heals crit like magic damage of their element: magic crit% + that element's crit% (HoTs and flat
        // heals never crit). The recipient's healingReceived % applies once, after the crit and multiplier.
        const crit = !o.flat && rollCrit(getOffense(actor.stats, 'magic', eff.damageElement));
        const base = rollScaled(eff.minHeal, eff.maxHeal, damageFactor(level, bonuses ? actor.stats.healing : 0));
        const received = o.flat ? 1 : Math.max(0, 1 + recipient.stats.healingReceived / 100);
        const amount = Math.round(base * (crit ? CRIT_MULTIPLIER : 1) * (o.healMultiplier ?? 1) * received);
        if (eff.restoresMP) c.mpRestored += amount;
        else c.heal += amount;
        log(actor, recipient, `HEAL${crit ? ' CRIT' : ''} ${amount}${eff.restoresMP ? ' MP' : ''} (${eff.damageElement})`);
        if (amount > 0) float(recipient, `+${amount}${eff.restoresMP ? ' MP' : ''}${crit ? ' CRIT!' : ''}`, eff.restoresMP ? COMBAT_TEXT_COLOR.mpRestore : COMBAT_TEXT_COLOR.heal, 'glow', eff.damageElement);
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
          healPerTurn: Math.round(eff.healPerTurn * damageFactor(level, bonuses ? actor.stats.healing : 0, 0.5)), restoresMP: eff.restoresMP, turnsLeft: eff.turns,
          seq: nextEffectSeq(),
          ...tickStack(o.ability, eff),
        });
        float(recipient, '+HoT', COMBAT_TEXT_COLOR.heal, 'glow', eff.damageElement);
        break;
      case 'dot': {
        // Off an attack, a DoT scales with the attacker's offense (resolveAttack); here it is flat
        const dot = newDot(o.ability, eff, actor, undefined, hostile);
        c.dots.push(dot);
        float(recipient, `${o.ability}!`, COMBAT_TEXT_COLOR.dot, 'glow', eff.damageElement);
        if (hostile) threat.gain += damageThreat(dot.damagePerTurn, eff.damagesMP);
        break;
      }
      case 'buff':
      case 'debuff':
        c.buffs.push(...effectToBuffs(eff, prefix, o.ability, unitKey(actor.ref)));
        float(recipient, `${o.ability}!`, eff.type === 'debuff' && onOther ? COMBAT_TEXT_COLOR.dot : COMBAT_TEXT_COLOR.heal, 'glow', eff.damageElement);
        threat.gain += effectThreat(level);
        break;
      case 'threat': {
        const amount = Math.sign(eff.amount ?? 0) * atLevel(Math.abs(eff.amount ?? 0), level);
        if (amount > 0) threat.gain += amount;
        else threat.loss = (threat.loss ?? 0) - amount;
        threat.percent = (threat.percent ?? 0) + (eff.percent ?? 0);
        // One word for it, whatever its flat and percent parts: "+Threat" (or "-Threat", shedding it)
        if (amount || eff.percent) float(recipient, amount > 0 || (eff.percent ?? 0) > 0 ? '+Threat' : '-Threat', COMBAT_TEXT_COLOR.threat);
        break;
      }
      case 'summon':
        summons.push({
          creature: eff.creature, turns: eff.turns, max: eff.max ?? 1, ability: o.ability, ...(eff.damageElement && { element: eff.damageElement }),
          ...(actor !== caster ? { by: actor } : action.target === 'tile' && aimAt ? { at: { ...aimAt } } : {}),
        });
        break;
      case 'root':
        c.buffs.push(rootToBuff(eff, prefix, o.ability));
        float(recipient, 'Rooted!', COMBAT_TEXT_COLOR.dot, 'glow', eff.damageElement);
        threat.gain += effectThreat(level);
        break;
      case 'aura':
        c.buffs.push(auraToBuff(eff, prefix, o.ability));
        float(recipient, `${o.ability}!`, COMBAT_TEXT_COLOR.heal, 'glow', eff.damageElement);
        threat.gain += effectThreat(level);
        break;
      case 'dispel': {
        // On a friendly unit it takes what hurts it, on a hostile one what helps it. It reads the unit as it was when
        // the action began, skipping what an earlier dispel of this action took
        const friendly = onSide(actor) === onSide(recipient);
        const { seqs, names } = pickDispelled(
          { buffs: recipient.buffs ?? [], hots: recipient.hots ?? [], dots: recipient.dots ?? [] },
          friendly, eff.count ?? 1, new Set(c.dispelled));
        if (seqs.length === 0) break;
        c.dispelled.push(...seqs);
        float(recipient, seqs.length === 1 ? `Dispelled ${names[0]}!` : `Dispelled ×${seqs.length}!`,
          friendly ? COMBAT_TEXT_COLOR.heal : COMBAT_TEXT_COLOR.dot, 'glow', eff.damageElement);
        threat.gain += seqs.length * effectThreat(level);
        break;
      }
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
      float(bearer, `${name}!`, t.debuff ? COMBAT_TEXT_COLOR.dot : COMBAT_TEXT_COLOR.heal, 'glow', b.damageElement);
      for (const eff of t.def.effects) {
        if (eff.type === 'weaponAttack') {
          if (attacks) triggeredAttack(bearer, other);
          continue;
        }
        const recipient = eff.appliesTo === 'target' ? other
          : eff.appliesTo === 'caster' ? bearer
          : eff.appliesTo === 'source' ? sourceUnit(t.sourceKey)
          : undefined;
        if (recipient) applySupport(bearer, recipient, eff, { ability: name, flat: true });
      }
    }
  }

  /** A trigger's weaponAttack: the bearer's basic attack on `target`, if it is in range and sight. */
  const triggeredAttack = (bearer: CombatUnit, target: CombatUnit) => {
    const attack = bearer.weaponAttack;
    if (!attack || !alive(target) || bodyDistance(bearer, target) > attack.range) return;
    if (world.sight && !bodySight(bearer, target, world.sight)) return;
    resolveAttack(bearer, attack, target, true);
  };

  /**
   * One attack roll of an enemy-target ability against one target, and its effects there if it lands (damage,
   * DoTs, debuffs, roots), then the triggers it sets off. `triggered`: a trigger's weapon attack (it sets off no
   * more of those). Returns whether it hit the target, and whether it damaged it.
   */
  const resolveAttack = (attacker: CombatUnit, act: Ability, target: CombatUnit, triggered: boolean): { hit: boolean; damaged: boolean } => {
    const targetEffects = effectsOf(act).filter(e => e.appliesTo === 'target');
    const damageEffects = targetEffects.filter((e): e is Extract<Effect, { type: 'damage' }> => e.type === 'damage');
    const dotEffects    = targetEffects.filter((e): e is Extract<Effect, { type: 'dot' }> => e.type === 'dot');
    const debuffEffects = targetEffects.filter((e): e is Extract<Effect, { type: 'debuff' }> => e.type === 'debuff');
    const rootEffects   = targetEffects.filter((e): e is Extract<Effect, { type: 'root' }> => e.type === 'root');
    const dispelEffects = targetEffects.filter((e): e is Extract<Effect, { type: 'dispel' }> => e.type === 'dispel');
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
      return { hit: false, damaged: false };
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
      float(target, `-${dmg.final}${eff.damagesMP ? ' MP' : ''}${suffix}`, eff.damagesMP ? COMBAT_TEXT_COLOR.mpDamage : DAMAGE_ELEMENT_COLOR[eff.damageElement], 'hit');
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
      threat.gain += damageThreat(dot.damagePerTurn, dotEffect.damagesMP);
    }
    if (dotEffects.length > 0 && damageEffects.length === 0) float(target, 'Hit!', COMBAT_TEXT_COLOR.dot, 'hit');
    for (const debuffEffect of debuffEffects) {
      c.buffs.push(...effectToBuffs(debuffEffect, `${act.name}-${unitKey(target.ref)}`, act.name, unitKey(attacker.ref)));
      threat.gain += effectThreat(attacker.stats.level);
      // A foe's magic debuff on a party member pulses its model's glow, in the debuff's element
      if (category === 'magic' && onSide(attacker) === 'enemy' && target.ref.side === 'party') glows.push({ unit: unitKey(target.ref), element: debuffEffect.damageElement });
    }
    for (const rootEffect of rootEffects) applySupport(attacker, target, rootEffect, { ability: act.name });
    for (const dispelEffect of dispelEffects) applySupport(attacker, target, dispelEffect, { ability: act.name });
    fire();
    return { hit: true, damaged };
  };

  changeFor(caster).mpSpent = mpCostAt(action, caster.stats.level);
  const effects = effectsOf(action);
  const targetEffects = effects.filter(e => e.appliesTo === 'target');
  const casterEffects = effects.filter(e => e.appliesTo === 'caster');
  const allyEffects = effects.filter(e => e.appliesTo === 'allies');
  const support = { ability: action.name };

  let targetsHit = 0, targetsDamaged = 0;
  if (action.target === 'enemy') {
    for (const target of targets) {
      const r = resolveAttack(caster, action, target, false);
      if (r.hit) targetsHit++;
      if (r.damaged) targetsDamaged++;
    }
  } else if (action.target === 'ally') {
    for (const target of targets) for (const eff of targetEffects) applySupport(caster, target, eff, support);
  } else if (action.target === 'self') {
    // A self ability's target is its caster (e.g. Rage's buff, written on 'target')
    for (const eff of targetEffects) applySupport(caster, caster, eff, support);
  }

  // Effects on the caster's side in the area: they always land (no hit roll), like any support effect
  for (const ally of allies) for (const eff of allyEffects) applySupport(caster, ally, eff, support);

  // Caster effects. On an enemy-target ability they happen only once it hits at least one target (a drain that misses
  // heals nothing, a taunt that misses gains no threat); its heals scale with targets damaged (e.g. drain life).
  if (action.target !== 'enemy' || targetsHit > 0) {
    const healMultiplier = action.target === 'enemy' ? Math.max(1, targetsDamaged) : 1;
    for (const eff of casterEffects) applySupport(caster, caster, eff, { ...support, healMultiplier });
  }

  if (action.selfDestruct) {
    changeFor(caster).slain = true;
    float(caster, '💀', COMBAT_TEXT_COLOR.damage);
  }

  // What lands on the caster lands during its own turn: that turn doesn't count down (countDownTurns)
  const own = changes.get(unitKey(caster.ref));
  if (own) for (const list of [own.buffs, own.hots, own.dots]) for (const x of list) x.fresh = true;

  const outcome: ActionOutcome = {
    changes: [...changes.values()], floats,
    threat: [...threats.values()],
    ...(glows.length ? { glows } : {}),
    ...(summons.length ? { summons } : {}),
  };
  record('action', () => actionEvent(caster, action, targets, [caster, ...targets, ...allies], rolls, outcome));
  return outcome;
}

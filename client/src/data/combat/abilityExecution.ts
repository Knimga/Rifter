import type { Ability, Effect } from './abilities';
import { MIN_THREAT_MULTIPLIER, type ActiveBuff, type ActiveDot, type ActiveHot, type BuffableStat, type Stats } from '../units/stats';
import type { DamageElement, WeaponItem } from '../gear';
import { WEAPON_TYPE_DATA } from '../gear/weapons';
import { COMBAT_TEXT_COLOR, DAMAGE_ELEMENT_COLOR } from '../constants';
import { applyDR, CRIT_MULTIPLIER, getOffense, rollCrit, rollDamage, rollHit, type HitOutcome, type Offense } from './attackResolution';
import { randInt } from '../random';
import type { Pos } from '../world/grid';
import { isAlly, type EnemyInstance } from '../units/enemies';
import type { SummonRequest } from '../units/summons';

// ─── Shared resolution for every ability used by a party member OR an enemy ──────
//
// executeAction is pure: it rolls everything and returns an ActionOutcome describing what
// happened. The caller (GameScreen.applyActionOutcome) writes it into party/enemy state.

type BuffEffect = Extract<Effect, { type: 'buff' | 'debuff' }>;

export type UnitRef = { side: 'party'; idx: number } | { side: 'enemy'; id: string };

export interface CombatUnit {
  ref: UnitRef;
  name: string;
  stats: Stats;
  pos: Pos;
  /** A creature summoned by the party (ref side 'enemy', fighting on the party's side): it builds threat. */
  allied?: boolean;
}

/**
 * The key a unit's threat is kept under (CombatState.threat): party members and summoned allies have one;
 * hostile enemies don't (they hold no threat).
 */
export const threatKey = (u: Pick<CombatUnit, 'ref' | 'allied'>): string | undefined =>
  u.ref.side === 'party' || u.allied ? unitKey(u.ref) : undefined;

/** Party member `idx` as a combat unit (`name` blank falls back to 'Party[idx]'). */
export const memberUnit = (idx: number, name: string | undefined, stats: Stats, pos: Pos): CombatUnit => ({
  ref: { side: 'party', idx }, name: name || `Party[${idx}]`, stats, pos,
});

/** A creature (an enemy or a summoned ally) as a combat unit, as it is now. */
export const creatureUnit = (e: EnemyInstance): CombatUnit => ({
  ref: { side: 'enemy', id: e.id },
  name: `${e.classData.name} (lv${e.level})`,
  stats: e.stats,
  pos: e.pos,
  ...(isAlly(e) ? { allied: true } : {}),
});

/** Accumulated changes to one unit from a single action. */
export interface UnitChange {
  ref: UnitRef;
  damage: number;
  heal: number;
  mpSpent: number;
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
  threat: ThreatChange;  // the caster's threat change (party-side casters only: threatKey), applied by applyThreatChange
  /** Creatures the caster summons (a 'summon' effect): placed and added to the fight where the outcome lands. */
  summons?: SummonRequest[];
}

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

/** Build ActiveBuff entries from a buff/debuff Effect. Debuff amounts are always negative. */
export function effectToBuffs(eff: BuffEffect, idPrefix: string, source: string): ActiveBuff[] {
  const signed = (v: number) => eff.type === 'debuff' ? -Math.abs(v) : v;
  return [
    ...(Object.entries(eff.stats) as [BuffableStat, number][]).map(([stat, amount]) => ({
      id: `${idPrefix}-${stat}`, source, damageElement: eff.damageElement,
      stat, amount: signed(amount), roundsRemaining: eff.rounds,
    })),
    ...(Object.entries(eff.statsPercent ?? {}) as [BuffableStat, number][]).map(([stat, pct]) => ({
      id: `${idPrefix}-${stat}-pct`, source, damageElement: eff.damageElement,
      stat, amount: 0, percent: signed(pct), roundsRemaining: eff.rounds,
    })),
  ];
}

/** A root (Effect 'root') as an ActiveBuff: no stat change, it just holds the unit in place (isRooted). */
export const rootToBuff = (eff: Extract<Effect, { type: 'root' }>, idPrefix: string, source: string): ActiveBuff => ({
  id: `${idPrefix}-root`, source, damageElement: eff.damageElement,
  stat: 'movement', amount: 0, roots: true, roundsRemaining: eff.rounds,
});

/** Threat a root generates when it lands (like a debuff's, which is its total stat change). */
export const ROOT_THREAT = 5;

/** Total absolute stat change of a buff/debuff — used as its threat value. */
export function buffMagnitude(eff: BuffEffect): number {
  return [...Object.values(eff.stats), ...Object.values(eff.statsPercent ?? {})]
    .reduce((sum: number, v) => sum + Math.abs(v ?? 0), 0);
}

/** Threat from damage dealt: HP damage counts in full, MP damage (damagesMP effects) counts half. */
export const damageThreat = (amount: number, toMp?: boolean) => (toMp ? amount / 2 : amount);

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

/** HoT heal for one round. Caster healing is baked into healPerRound when the HoT is created. */
export const tickHots = (hots: ActiveHot[]) => hots.reduce((sum, h) => sum + h.healPerRound, 0);

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
      attackCategory: weapon.attackCategory, effects: [weaponHit],
    };
  }
  return { ...content, useWeapon: false, attackCategory: weapon.attackCategory, effects: [weaponHit, ...content.effects] };
}

// ─── Execution ────────────────────────────────────────────────────────────────

/** Log every combat roll to the console: dev builds only (`env` is missing outside Vite, e.g. in scripts). */
const COMBAT_LOG = !!import.meta.env?.DEV;

const STOPPED_TEXT: Record<Exclude<HitOutcome, 'hit'>, string> = {
  miss: 'Missed!', dodge: 'Dodged!', parry: 'Parried!', block: 'Blocked!',
};

/**
 * Resolve an ability. `targets` are the units the ability lands on:
 * - target 'enemy': every hostile unit in the affected area (each rolls to hit separately)
 * - target 'ally':  the single ally clicked
 * - target 'self':  ignored; its 'target' effects land on the caster (like its 'caster' ones)
 * - target 'tile':  ignored; `aimAt` is the tile (a summon appears there)
 * `allies` are the units on the caster's side in the ability's area (the caster too, if it stands in it):
 * its 'allies' effects land on each of them (areas.ts unitsInArea finds them).
 */
export function executeAction(caster: CombatUnit, action: Ability, targets: CombatUnit[], aimAt?: Pos, allies: CombatUnit[] = []): ActionOutcome {
  const changes = new Map<string, UnitChange>();
  const floats: FloatEvent[] = [];
  let threat = 0, threatLoss = 0, threatPercent = 0;
  const summons: SummonRequest[] = [];

  const changeFor = (u: CombatUnit): UnitChange => {
    const key = unitKey(u.ref);
    let c = changes.get(key);
    if (!c) changes.set(key, c = { ref: u.ref, damage: 0, heal: 0, mpSpent: 0, buffs: [], hots: [], dots: [] });
    return c;
  };
  const float = (u: CombatUnit, text: string, color: string) => floats.push({ pos: u.pos, text, color });
  // Every roll, to the browser console, in dev builds only (for balancing; players never see it)
  const log = (target: CombatUnit, msg: string) => { if (COMBAT_LOG) console.log(`[Combat] ${caster.name} → ${target.name}: ${msg}`); };

  changeFor(caster).mpSpent = action.mpCost;
  // An effect with no element of its own takes its ability's (displayElement): e.g. a buff on a holy ability
  // is holy, so its marker shows the holy color
  const effects = action.effects.map((e): Effect => (e.damageElement || !action.displayElement ? e : { ...e, damageElement: action.displayElement }));
  const targetEffects = effects.filter(e => e.appliesTo === 'target');
  const casterEffects = effects.filter(e => e.appliesTo === 'caster');
  const allyEffects = effects.filter(e => e.appliesTo === 'allies');

  /** Heal / HoT / buff / debuff / self-damage / threat on a friendly unit (or the caster). */
  const applySupport = (recipient: CombatUnit, eff: Effect, healMultiplier = 1) => {
    const c = changeFor(recipient);
    switch (eff.type) {
      case 'damage': {
        const amount = randInt(eff.minDamage, eff.maxDamage);
        if (eff.damagesMP) {
          c.mpSpent += amount;
          float(recipient, `-${amount} MP`, COMBAT_TEXT_COLOR.mpDamage);
        } else {
          c.damage += amount;
          float(recipient, `-${amount}`, COMBAT_TEXT_COLOR.damage);
        }
        break;
      }
      case 'heal': {
        // Heals crit like magic damage of their element: magic crit% + that element's crit% (HoTs never crit)
        const crit = rollCrit(getOffense(caster.stats, 'magic', eff.damageElement));
        const amount = Math.max(0, randInt(eff.minHeal, eff.maxHeal) + caster.stats.healing) * (crit ? CRIT_MULTIPLIER : 1) * healMultiplier;
        c.heal += amount;
        log(recipient, `HEAL${crit ? ' CRIT' : ''} ${amount} (${eff.damageElement})`);
        if (amount > 0) float(recipient, `+${amount}${crit ? ' CRIT!' : ''}`, COMBAT_TEXT_COLOR.heal);
        threat += amount * 1.5;
        break;
      }
      case 'hot':
        c.hots.push({
          name: action.name, damageElement: eff.damageElement,
          healPerRound: Math.floor(eff.healPerRound + caster.stats.healing / 2), roundsRemaining: eff.rounds,
        });
        float(recipient, '+HoT', COMBAT_TEXT_COLOR.heal);
        break;
      case 'buff':
      case 'debuff':
        c.buffs.push(...effectToBuffs(eff, `${action.name}-${unitKey(recipient.ref)}`, action.name));
        float(recipient, `${action.name}!`, COMBAT_TEXT_COLOR.heal);
        threat += buffMagnitude(eff);
        break;
      case 'threat': {
        const amount = eff.amount ?? 0;
        if (amount > 0) threat += amount;
        else threatLoss -= amount;
        threatPercent += eff.percent ?? 0;
        break;
      }
      case 'summon':
        summons.push({
          creature: eff.creature, rounds: eff.rounds, max: eff.max ?? 1, ability: action.name,
          ...(action.target === 'tile' && aimAt ? { at: { ...aimAt } } : {}),
        });
        break;
      case 'root':
        c.buffs.push(rootToBuff(eff, `${action.name}-${unitKey(recipient.ref)}`, action.name));
        float(recipient, 'Rooted!', COMBAT_TEXT_COLOR.dot);
        threat += ROOT_THREAT;
        break;
    }
  };

  let targetsDamaged = 0;

  if (action.target === 'enemy') {
    const damageEffects = targetEffects.filter((e): e is Extract<Effect, { type: 'damage' }> => e.type === 'damage');
    const dotEffects    = targetEffects.filter((e): e is Extract<Effect, { type: 'dot' }> => e.type === 'dot');
    const debuffEffects = targetEffects.filter((e): e is Extract<Effect, { type: 'debuff' }> => e.type === 'debuff');
    const rootEffects   = targetEffects.filter((e): e is Extract<Effect, { type: 'root' }> => e.type === 'root');
    const category = action.attackCategory ?? 'melee';
    // The primary element (first damage component, else the first DoT) drives the hit roll and DoT scaling.
    const primaryElement: DamageElement = damageEffects[0]?.damageElement ?? dotEffects[0]?.damageElement ?? 'physical';
    const offense = getOffense(caster.stats, category, primaryElement);
    const offenseFor = (el: DamageElement): Offense => el === primaryElement ? offense : getOffense(caster.stats, category, el);

    for (const target of targets) {
      const hit = rollHit(offense, category, target.stats);
      if (hit.outcome !== 'hit') {
        log(target, `${hit.outcome.toUpperCase()} (${primaryElement})`);
        float(target, STOPPED_TEXT[hit.outcome], COMBAT_TEXT_COLOR.stopped);
        continue;
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
        log(target, `${hit.crit ? 'CRIT' : 'HIT'}${hit.glancing ? ' (glancing)' : ''} ${dmg.final}${eff.damagesMP ? ' MP' : ''} (${eff.damageElement}) | roll=${dmg.roll} +dmg=${off.damage} raw=${dmg.raw} -DR=${dmg.raw - dmg.final}`);
        float(target, `-${dmg.final}${eff.damagesMP ? ' MP' : ''}${suffix}`, eff.damagesMP ? COMBAT_TEXT_COLOR.mpDamage : DAMAGE_ELEMENT_COLOR[eff.damageElement]);
      }
      if (dealt > 0 || dealtMp > 0) {
        c.damage += dealt;
        c.mpSpent += dealtMp;
        threat += damageThreat(dealt) + damageThreat(dealtMp, true);
        targetsDamaged++;
      }

      for (const dotEffect of dotEffects) {
        const damagePerRound = Math.floor(dotEffect.damagePerRound + offense.damage / 2);
        c.dots.push({
          name: action.name,
          damageElement: dotEffect.damageElement,
          damagePerRound,
          roundsRemaining: dotEffect.rounds,
          sourceKey: threatKey(caster),
          penetration: offense.penetration,
          elementPenetration: offense.elementPenetration,
          damagesMP: dotEffect.damagesMP,
        });
        // One tick's worth of threat on application; later ticks add threat via sourceKey
        threat += damageThreat(damagePerRound, dotEffect.damagesMP);
      }
      if (dotEffects.length > 0 && damageEffects.length === 0) float(target, 'Hit!', COMBAT_TEXT_COLOR.dot);
      for (const debuffEffect of debuffEffects) {
        c.buffs.push(...effectToBuffs(debuffEffect, `${action.name}-${unitKey(target.ref)}`, action.name));
        threat += buffMagnitude(debuffEffect);
      }
      for (const rootEffect of rootEffects) {
        c.buffs.push(rootToBuff(rootEffect, `${action.name}-${unitKey(target.ref)}`, action.name));
        float(target, 'Rooted!', COMBAT_TEXT_COLOR.dot);
        threat += ROOT_THREAT;
      }
    }
  } else if (action.target === 'ally') {
    for (const target of targets) {
      for (const eff of targetEffects) applySupport(target, eff);
    }
  } else if (action.target === 'self') {
    // A self ability's target is its caster (e.g. Rage's buff, written on 'target')
    for (const eff of targetEffects) applySupport(caster, eff);
  }

  // Effects on the caster's side in the area: they always land (no hit roll), like any support effect
  if (allyEffects.length) for (const ally of allies) for (const eff of allyEffects) applySupport(ally, eff);

  // Caster effects. Heals on an enemy-targeting ability scale with targets damaged (e.g. drain life).
  const healMultiplier = action.target === 'enemy' ? Math.max(1, targetsDamaged) : 1;
  for (const eff of casterEffects) applySupport(caster, eff, healMultiplier);

  if (action.selfDestruct) {
    changeFor(caster).slain = true;
    float(caster, '💀', COMBAT_TEXT_COLOR.damage);
  }

  return {
    changes: [...changes.values()], floats,
    threat: { gain: threat, loss: threatLoss, percent: threatPercent },
    ...(summons.length ? { summons } : {}),
  };
}

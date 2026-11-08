import { CLASSES, type ClassKey } from './classes';
import { EMPTY_GEAR, generateArmor, generateOffhand, generateShield, generateWeapon, getGearArmorBonus, getGearBuffs, heldWeapon, isWeaponItem, type GearSlots, type Item, type WeaponItem } from '../gear';
import { equipSlotFor, gearWith, isProficient, otherEquipSlot } from '../gear/inventory';
import type { PassiveEffect } from '../combat/abilities';
import { unitKey } from '../combat/abilityExecution';
import { ATTRIBUTE_KEYS, ATTRIBUTE_POINTS_PER_LEVEL, BUFFABLE_STATS, SKILL_KEYS, SKILL_POINTS_PER_LEVEL, isPassiveEntry, passiveEffectEntries, recomputeStats, type ActiveBuff, type BuffableStat, type ActiveDot, type ActiveHot, type AttributeKey, type PlayerStatInput, type SkillKey, type Stats } from './stats';
import { getOffense } from '../combat/attackResolution';
import { scaledRange } from '../random';

export interface PartyMemberConfig {
  characterName: string;
  selectedClass: ClassKey;
  gear: GearSlots;
  /** Points spent on attributes and skills (from level-ups), on top of the class's own. */
  pointsSpent: Record<AttributeKey, number>;
  skillPointsSpent: Record<SkillKey, number>;
  /** Points gained from level-ups and not yet spent. */
  unspentAttributePoints: number;
  unspentSkillPoints: number;
}

const zeros = <K extends string>(keys: readonly K[]) => Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

/** A new party member of `classKey` named `name`, wearing the class's starting gear, with no points spent. */
export function createMember(classKey: ClassKey, name: string): PartyMemberConfig {
  return {
    characterName: name,
    selectedClass: classKey,
    gear: startingGear(classKey),
    pointsSpent: zeros(ATTRIBUTE_KEYS),
    skillPointsSpent: zeros(SKILL_KEYS),
    unspentAttributePoints: 0,
    unspentSkillPoints: 0,
  };
}

/** What a member's stats are computed from (calculateStats / recomputeStats): class, the party's level, gear, spent points. */
export function memberStatInput(m: PartyMemberConfig, level: number): PlayerStatInput {
  return {
    mode: 'player',
    classKey: m.selectedClass,
    level,
    gearArmorBonus: getGearArmorBonus(m.gear),
    pointsSpent: m.pointsSpent,
    skillPointsSpent: m.skillPointsSpent,
  };
}

/** A member's effective stats at the party's level: class, gear and spent points, with active buffs and gear affixes applied. */
export const memberStats = (m: PartyMemberConfig, level: number, buffs: ActiveBuff[]): Stats =>
  recomputeStats(memberStatInput(m, level), [...buffs, ...getGearBuffs(m.gear)]);

/** A stat's change on the gear (EquipCompare). */
export interface StatDelta { stat: BuffableStat; delta: number }

/**
 * Comparing an item with what a member wears (item tooltips, Ctrl): the item in its slot now, and the stats the
 * swap adds and removes: the items' own (implicits, affixes, armor), not what they feed (an attribute's HP). For a
 * weapon, also the damage its wielder deals with it: the held weapon's range now and after, with the wielder's
 * damage bonus (each with the gear it would have: an affix on either weapon can change it), as its tooltip shows.
 */
export interface EquipCompare {
  equipped: Item | null;
  /** It goes in either of two slots (a ring): it can be compared against the other one too (Ctrl+Alt). */
  hasOther: boolean;
  deltas: StatDelta[];
  /** A weapon's: the held weapon's damage range now (null: none held) and with it equipped. */
  damage?: { before: [number, number] | null; after: [number, number] };
}

/** The gear's own stats, summed by stat: its implicits and affixes, and its armor. */
function gearStatTotals(gear: GearSlots): Map<BuffableStat, number> {
  const totals = new Map<BuffableStat, number>([['armor', getGearArmorBonus(gear)]]);
  // Both threat stats are one 'Threat' to the player: a reduction counts against an increase, so a swap shows the net
  for (const b of getGearBuffs(gear)) {
    const stat = b.stat === 'reducedThreat' ? 'increasedThreat' : b.stat;
    totals.set(stat, (totals.get(stat) ?? 0) + (stat === b.stat ? b.amount : -b.amount));
  }
  return totals;
}

/**
 * What comparing `item` shows for a member (gearWith: as equipping it would, the other hand's item pushed off
 * too), or null when they aren't proficient with it. Its stat changes in BUFFABLE_STATS order, unchanged ones left
 * out; for a weapon, its damage (EquipCompare.damage). `stats`: the member's now (its buffs count toward its damage).
 * `other`: against the slot equipping it wouldn't pick (a ring's other ring slot: otherEquipSlot), if it has one.
 */
export function equipCompare(m: PartyMemberConfig, item: Item, stats: Stats, other = false): EquipCompare | null {
  if (!isProficient(CLASSES[m.selectedClass], item)) return null;
  const otherSlot = otherEquipSlot(m.gear, item);
  const slot = equipSlotFor(m.gear, item, (other && otherSlot) || undefined);
  const gear = gearWith(m.gear, item, slot);
  const before = gearStatTotals(m.gear), after = gearStatTotals(gear);
  return {
    equipped: m.gear[slot],
    hasOther: !!otherSlot,
    deltas: BUFFABLE_STATS.map(stat => ({ stat, delta: (after.get(stat) ?? 0) - (before.get(stat) ?? 0) })).filter(d => d.delta !== 0),
    ...(isWeaponItem(item) ? { damage: weaponDamageCompare(m, gear, stats) } : {}),
  };
}

/**
 * The held weapon's damage range now and with `gear` on (EquipCompare.damage): its base range stretched by the
 * wielder's damage bonus for it (scaledRange, as an attack rolls it). Now: from `stats`, as they are. After: from
 * the stats `gear` gives, plus what the member's buffs add to that bonus now (they stay through a swap).
 */
function weaponDamageCompare(m: PartyMemberConfig, gear: GearSlots, stats: Stats): EquipCompare['damage'] {
  const bonus = (w: WeaponItem, s: Stats) => getOffense(s, w.attackCategory, w.damageElement).damage;
  const range = (w: WeaponItem, b: number) => scaledRange(w.minDamage, w.maxDamage, b);
  const gearOnly = memberStats(m, stats.level, []), withNew = memberStats({ ...m, gear }, stats.level, []);
  const now = heldWeapon(m.gear), next = heldWeapon(gear)!;
  const fromBuffs = bonus(next, stats) - bonus(next, gearOnly);
  return { before: now && range(now, bonus(now, stats)), after: range(next, bonus(next, withNew) + fromBuffs) };
}

/**
 * Whether a party member stands on the map: only while alive. One who fell (the leader too) is off the map
 * until revived: drawn nowhere, blocking no one (its tile is still where it gets back up: spreadOut).
 */
export const isOnMap = (hp: number) => hp > 0;

/** A party member's state in play (indexed like the party): HP, MP and the effects on them. */
export interface MemberState {
  hp: number;
  mp: number;
  buffs: ActiveBuff[];
  hots: ActiveHot[];
  dots: ActiveDot[];
}

/**
 * The passive effects a member has for good (PassiveEffect): its class's. The one place that decides them, so what else
 * gives a member passives (a subclass) is added here.
 */
export const memberPassiveEffects = (m: PartyMemberConfig): readonly PassiveEffect[] => CLASSES[m.selectedClass].passiveEffects ?? [];

/** The entries a member's passive effects make in its buffs, HoTs and DoTs (passiveEffectEntries); `idx`: its place in the party. */
export const memberPassiveEntries = (m: PartyMemberConfig, idx: number) =>
  passiveEffectEntries(memberPassiveEffects(m), unitKey({ side: 'party', idx }));

/** Which passive effects a member has, as a key: what the member's stored entries are kept in step with (usePartyMembers). */
export const memberPassivesKey = (m: PartyMemberConfig) => memberPassiveEffects(m).map(p => p.name).join('|');

/**
 * A member's lists with only the entries that last for good (isPassiveEntry: its passive effects) left: everything cast
 * on it ends (it died, or left the location). The same object when nothing goes.
 */
export function withoutCastEffects(s: MemberState): MemberState {
  const buffs = s.buffs.filter(isPassiveEntry), hots = s.hots.filter(isPassiveEntry), dots = s.dots.filter(isPassiveEntry);
  return buffs.length === s.buffs.length && hots.length === s.hots.length && dots.length === s.dots.length ? s : { ...s, buffs, hots, dots };
}

/** A member's state with its passive entries replaced by the ones its passive effects make now (they changed); `idx`: its place in the party. */
export function withCurrentPassives(s: MemberState, m: PartyMemberConfig, idx: number): MemberState {
  const entries = memberPassiveEntries(m, idx);
  const cast = withoutPassiveEntries(s);
  return { ...s, buffs: [...cast.buffs, ...entries.buffs], hots: [...cast.hots, ...entries.hots], dots: [...cast.dots, ...entries.dots] };
}

/** A member's lists without the entries that last for good (what is cast on them stays). */
const withoutPassiveEntries = (s: MemberState) => ({
  buffs: s.buffs.filter(x => !isPassiveEntry(x)), hots: s.hots.filter(x => !isPassiveEntry(x)), dots: s.dots.filter(x => !isPassiveEntry(x)),
});

/** A member at full HP and MP with only its passive effects on them (a new game; back in the Sanctum after a party wipe). `idx`: its place in the party. */
export function freshMember(m: PartyMemberConfig, level: number, idx: number): MemberState {
  const entries = memberPassiveEntries(m, idx);
  const s = memberStats(m, level, entries.buffs);
  return { hp: s.hp, mp: s.mp, ...entries };
}

/** The member after gaining `levels` levels: ATTRIBUTE_POINTS_PER_LEVEL and SKILL_POINTS_PER_LEVEL more to spend per level. */
export function withLevelUps(m: PartyMemberConfig, levels: number): PartyMemberConfig {
  return {
    ...m,
    unspentAttributePoints: m.unspentAttributePoints + ATTRIBUTE_POINTS_PER_LEVEL * levels,
    unspentSkillPoints: m.unspentSkillPoints + SKILL_POINTS_PER_LEVEL * levels,
  };
}

// ─── Spending level-up points ─────────────────────────────────────────────────
// Points are placed (pending) first, then confirmed: pending points can be taken back until Confirm; after it
// they're spent for good. Confirm needs every unspent point placed. 1 point = +1, no cap.

/** Points placed on a member's attributes and skills, not yet confirmed. */
export interface PendingPoints {
  attr: Record<AttributeKey, number>;
  skill: Record<SkillKey, number>;
}

export const noPendingPoints = (): PendingPoints => ({ attr: zeros(ATTRIBUTE_KEYS), skill: zeros(SKILL_KEYS) });

const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);

/** Points the member still has to place: unspent minus pending. */
export const pointsLeft = (m: PartyMemberConfig, p: PendingPoints) => ({
  attr: m.unspentAttributePoints - sum(p.attr),
  skill: m.unspentSkillPoints - sum(p.skill),
});

/** Whether the member has level-up points to spend. */
export const hasPointsToSpend = (m: PartyMemberConfig) => m.unspentAttributePoints > 0 || m.unspentSkillPoints > 0;

/** The member with their pending points spent (Confirm). */
export function spendPoints(m: PartyMemberConfig, p: PendingPoints): PartyMemberConfig {
  const add = <K extends string>(a: Record<K, number>, b: Record<K, number>) =>
    Object.fromEntries(Object.keys(a).map((k) => [k, a[k as K] + (b[k as K] ?? 0)])) as Record<K, number>;
  return {
    ...m,
    pointsSpent: add(m.pointsSpent, p.attr),
    skillPointsSpent: add(m.skillPointsSpent, p.skill),
    unspentAttributePoints: m.unspentAttributePoints - sum(p.attr),
    unspentSkillPoints: m.unspentSkillPoints - sum(p.skill),
  };
}

/** Level-1 class kit (CLASSES[classKey].startingGear): chest armor, boots, weapon, and an optional shield or other offhand (a quiver, a focus). No affixes. */
export function startingGear(classKey: ClassKey): GearSlots {
  const kit = CLASSES[classKey].startingGear;
  return {
    ...EMPTY_GEAR,
    chest:    generateArmor(1, 'chest', kit.chest, { starter: true, affixes: false }),
    boots:    generateArmor(1, 'boots', kit.boots, { starter: true, affixes: false }),
    mainhand: generateWeapon(1, kit.weapon, { element: kit.weaponElement, starter: true, affixes: false }),
    offhand:  kit.shield ? generateShield(1, kit.shield, { starter: true, affixes: false })
      : kit.offhand ? generateOffhand(kit.offhand, 1, { starter: true, affixes: false })
      : null,
  };
}

// Names the character select's dice button picks from (one not already in the party).
export const HERO_NAMES: readonly string[] = [
  'Aldric', 'Alaric', 'Bram', 'Cassian', 'Corwin', 'Darian', 'Dorian', 'Edric', 'Faelan', 'Gareth',
  'Garrick', 'Halvard', 'Ivor', 'Joren', 'Kael', 'Leoric', 'Lucan', 'Magnus', 'Niall', 'Orin',
  'Perrin', 'Roderick', 'Rowan', 'Soren', 'Theron', 'Tobias', 'Ulric', 'Valen', 'Wystan', 'Yorick',
];

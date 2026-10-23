import { CLASSES, type ClassKey } from './classes';
import { EMPTY_GEAR, generateArmor, generateShield, generateWeapon, getGearArmorBonus, getGearBuffs, type GearSlots } from '../gear';
import { ATTRIBUTE_KEYS, ATTRIBUTE_POINTS_PER_LEVEL, SKILL_KEYS, SKILL_POINTS_PER_LEVEL, recomputeStats, type ActiveBuff, type ActiveDot, type ActiveHot, type AttributeKey, type PlayerStatInput, type SkillKey, type Stats } from './stats';

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

/** A party member's state in play (indexed like the party): HP, MP and the effects on them. */
/**
 * Whether party member `idx` stands on the map: the leader always (the party's position), followers only
 * while alive. A follower who fell is off the map until revived: drawn nowhere, blocking no one.
 */
export const isOnMap = (idx: number, hp: number) => idx === 0 || hp > 0;

export interface MemberState {
  hp: number;
  mp: number;
  buffs: ActiveBuff[];
  hots: ActiveHot[];
  dots: ActiveDot[];
}

/** A member at full HP and MP with no effects on them (a new game; back in the Sanctum after a party wipe). */
export function freshMember(m: PartyMemberConfig, level: number): MemberState {
  const s = memberStats(m, level, []);
  return { hp: s.hp, mp: s.mp, buffs: [], hots: [], dots: [] };
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

/** Level-1 class kit (CLASSES[classKey].startingGear): chest armor, boots, weapon, and an optional shield. No affixes. */
export function startingGear(classKey: ClassKey): GearSlots {
  const kit = CLASSES[classKey].startingGear;
  return {
    ...EMPTY_GEAR,
    chest:    generateArmor(1, 'chest', kit.chest, { starter: true, affixes: false }),
    boots:    generateArmor(1, 'boots', kit.boots, { starter: true, affixes: false }),
    mainhand: generateWeapon(1, kit.weapon, { element: kit.weaponElement, starter: true, affixes: false }),
    offhand:  kit.shield ? generateShield(1, kit.shield, { starter: true, affixes: false }) : null,
  };
}

// Names the character select's dice button picks from (one not already in the party).
export const HERO_NAMES: readonly string[] = [
  'Aldric', 'Alaric', 'Bram', 'Cassian', 'Corwin', 'Darian', 'Dorian', 'Edric', 'Faelan', 'Gareth',
  'Garrick', 'Halvard', 'Ivor', 'Joren', 'Kael', 'Leoric', 'Lucan', 'Magnus', 'Niall', 'Orin',
  'Perrin', 'Roderick', 'Rowan', 'Soren', 'Theron', 'Tobias', 'Ulric', 'Valen', 'Wystan', 'Yorick',
];

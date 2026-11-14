import { CLASSES } from './classes';
import { subclass } from './subclasses';
import { capitalize } from '../detailStrings';
import type { ClassKey, ClassData, Passive, Passives, ScalingPassive } from './classes';
import type { Aura, Effect, PassiveEffect, Trigger } from '../combat/abilities';

export const ATTRIBUTE_KEYS = ['strength', 'toughness', 'finesse', 'mind', 'spirit', 'speed'] as const;
export const SKILL_KEYS = ['perception', 'subtlety', 'expertise', 'spellcraft', 'evasion', 'redoubt', 'devotion'] as const;
export const DAMAGE_ELEMENTS = ['physical', 'fire', 'ice', 'lightning', 'shadow', 'poison', 'holy', 'nature'] as const;
/** The stats every damage element has: e.g. fireHit, fireCrit, fireDamage, fireResistance, firePenetration. */
export const ELEMENT_STAT_SUFFIXES = ['Hit', 'Crit', 'Damage', 'Resistance', 'Penetration'] as const;
export type ElementStatSuffix = typeof ELEMENT_STAT_SUFFIXES[number];

export type AttributeKey = typeof ATTRIBUTE_KEYS[number];
export type SkillKey = typeof SKILL_KEYS[number];
export type DamageElement = typeof DAMAGE_ELEMENTS[number];
export type ElementStatKey = `${DamageElement}${typeof ELEMENT_STAT_SUFFIXES[number]}`;

const MISC_STATS = [
  'hp', 'mp', 'hpRegen', 'mpRegen', 'initiative', 'movement', 'apMax',
  'armor', 'dodge', 'parry', 'block', 'glancingBlow', 'magicResistance', 'healing', 'healingReceived',
  'meleeHit', 'meleeDamage', 'meleeCrit', 'meleePenetration',
  'rangedHit', 'rangedDamage', 'rangedCrit', 'rangedPenetration',
  'magicHit', 'magicDamage', 'magicCrit', 'magicPenetration',
  // Threat: points added to or taken from the threatMultiplier (THREAT_SHIFT_STATS), the one way anything changes it
  'increasedThreat', 'reducedThreat',
] as const;

/** Every stat that can be raised or lowered by a buff/debuff. */
export type BuffableStat =
  | AttributeKey | SkillKey
  | typeof MISC_STATS[number]
  | ElementStatKey;

/** Element-specific stat keys: e.g. 'fireResistance', 'iceHit', 'shadowDamage' */
const ELEMENT_STAT_KEYS: ElementStatKey[] = DAMAGE_ELEMENTS.flatMap(el =>
  ELEMENT_STAT_SUFFIXES.map(suffix => `${el}${suffix}` as ElementStatKey)
);

export const BUFFABLE_STATS: BuffableStat[] = [
  ...ATTRIBUTE_KEYS,
  ...SKILL_KEYS,
  ...MISC_STATS,
  ...ELEMENT_STAT_KEYS,
];

interface AttackCategoryStats {
  hit:         number;
  damage:      number;
  crit:        number;
  penetration: number;
}

interface ElementStats {
  hit:         number;
  crit:        number;
  damage:      number;
  resistance:  number;
  penetration: number;
}

export interface Stats {
  level:           number;
  attributes:      Record<AttributeKey, number>;
  skills:          Record<SkillKey, number>;
  hp:              number;
  mp:              number;
  /** % of max HP / MP regained at the start of each turn, at least MIN_REGEN (regenAmount). */
  hpRegen:         number;
  mpRegen:         number;
  initiative:      number;
  movement:        number;
  /** Action points each combat turn: moving (1 per movement's worth of tiles) and abilities spend them. */
  apMax:           number;
  armor:           number;
  dodge:           number;
  parry:           number;
  block:           number;
  glancingBlow:    number;
  magicResistance: number;
  /** % more on the heals and HoTs this unit casts (half of it on HoTs: executeAction). */
  healing:         number;
  /** % more on every heal this unit receives; half of it on each HoT tick (combat: executeAction, tickHots). */
  healingReceived: number;
  melee:           AttackCategoryStats;
  ranged:          AttackCategoryStats;
  magic:           AttackCategoryStats;
  threatMultiplier: number;
  elementalStats:  Partial<Record<DamageElement, ElementStats>>;
}

export interface ActiveBuff {
  id: string;              // its ability, recipient and stat (effectToBuffs)
  source?: string;         // ability name for grouping/tooltip
  damageElement?: DamageElement;
  stat: BuffableStat;
  amount: number;          // flat delta — positive = buff, negative = debuff (0 if percent-only)
  percent?: number;        // percentage delta applied after flats — e.g. 10 = +10%, -20 = -20%
  /** Its bearer's turns left (Infinity: gear's, for good). Counts down at the end of each of its turns (countDownTurns). */
  turnsLeft: number;
  /** It landed during its bearer's own turn: that turn doesn't count down (countDownTurns), so it lasts through the others'. */
  fresh?: boolean;
  /** A root (Effect 'root'): while it lasts the unit can't move (isRooted). Its stat change is none. */
  roots?: boolean;
  /**
   * A trigger (a buff or debuff effect's): while it lasts the unit reacts to attacks and heals. Its stat change is
   * none. `sourceKey`: the unitKey of who put it on (its effects on 'source'); `debuff`: it came from a debuff.
   */
  trigger?: { def: Trigger; sourceKey: string; debuff: boolean };
  /**
   * The aura itself, on its bearer (an 'aura' effect): while it lasts, its effects land on the units inside its area
   * (data/combat/auras.ts). Its stat change is none.
   */
  aura?: { def: Aura };
  /** It is the effect of an aura, on a unit inside it: it lasts as long as the unit does (turnsLeft Infinity, no stack). */
  fromAura?: AuraTag;
  /**
   * Its stack (a buff or debuff effect's): `id` is one application of the effect (all its entries share it), `key`
   * the effect it is of (stackKey), `max` how many stacks of it a unit can have at once (stackCap).
   */
  stack?: { key: string; id: number; max: number };
}

/**
 * What an effect that comes from an aura carries (ActiveBuff, ActiveHot and ActiveDot `fromAura`): `key` is the aura's
 * effect it is of (its name and the effect's place in it: what a unit inside several copies of the aura has once),
 * `bearer` the unitKey of the unit whose aura it comes from (syncAuraEffects).
 */
export interface AuraTag { key: string; bearer: string }

/**
 * Whether any effect in a list runs down (has turns left to count): an aura's effects (Infinity) don't, so a unit with
 * only those is as quiet as one with none (a tick leaves it the same object).
 */
export const runsDown = (list: readonly { turnsLeft: number }[]): boolean => list.some(x => Number.isFinite(x.turnsLeft));

/** Whether a root is on the unit (a condition, not a stat): in combat it can't move at all (moveBudget). */
export const isRooted = (buffs: ActiveBuff[]) => buffs.some(b => b.roots);

type BuffEffect = Extract<Effect, { type: 'buff' | 'debuff' }>;

/** What stacks of a buff or debuff effect have in common: its ability (`source`) and kind, whoever casts it. */
export const stackKey = (source: string, eff: BuffEffect) => `${source}:${eff.type}`;

/** How many stacks of an effect a unit can have: one if it has a trigger (triggers never stack), else maxStacks. */
export const stackCap = (eff: BuffEffect) => (eff.trigger ? 1 : eff.maxStacks ?? Infinity);

/** How many stacks of `key` are on a unit. */
export const stackCount = (buffs: readonly ActiveBuff[], key: string) =>
  new Set(buffs.filter(b => b.stack?.key === key).map(b => b.stack!.id)).size;

/**
 * Add new buff entries to a unit's (an outcome landing). A stack that would go past its effect's cap replaces the
 * oldest stack of it, so the count stays at the cap and the new one's full duration (and source) is what's left.
 */
export function addBuffs(buffs: ActiveBuff[], added: readonly ActiveBuff[]): ActiveBuff[] {
  if (added.length === 0) return buffs;
  let out = buffs;
  const seen = new Set<number>();
  for (const b of added) {
    if (b.stack && !seen.has(b.stack.id)) {
      seen.add(b.stack.id);
      const { key, max } = b.stack;
      while (stackCount(out, key) >= max) {
        const oldest = out.find(x => x.stack?.key === key)!.stack!.id;
        out = out.filter(x => x.stack?.id !== oldest);
      }
    }
    out = [...out, b];
  }
  return out;
}

/**
 * Build ActiveBuff entries from a buff/debuff Effect: one per stat changed, and one for its trigger. Debuff amounts
 * are always negative. `sourceKey`: the unitKey of who puts it on (a trigger's 'source'). The entries are one stack
 * (ActiveBuff.stack), capped when they land (addBuffs).
 */
export function effectToBuffs(eff: BuffEffect, idPrefix: string, source: string, sourceKey: string): ActiveBuff[] {
  const signed = (v: number) => eff.type === 'debuff' ? -Math.abs(v) : v;
  const stack = { key: stackKey(source, eff), id: nextEffectSeq(), max: stackCap(eff) };
  return ([
    ...(Object.entries(eff.stats ?? {}) as [BuffableStat, number][]).map(([stat, amount]) => ({
      id: `${idPrefix}-${stat}`, source, damageElement: eff.damageElement,
      stat, amount: signed(amount), turnsLeft: eff.turns,
    })),
    ...(Object.entries(eff.statsPercent ?? {}) as [BuffableStat, number][]).map(([stat, pct]) => ({
      id: `${idPrefix}-${stat}-pct`, source, damageElement: eff.damageElement,
      stat, amount: 0, percent: signed(pct), turnsLeft: eff.turns,
    })),
    // A trigger changes no stat (like a root)
    ...(eff.trigger ? [{
      id: `${idPrefix}-trigger`, source, damageElement: eff.damageElement,
      stat: 'movement' as const, amount: 0, turnsLeft: eff.turns,
      trigger: { def: eff.trigger, sourceKey, debuff: eff.type === 'debuff' },
    }] : []),
  ] as ActiveBuff[]).map(b => ({ ...b, stack }));
}

/** A root (Effect 'root') as an ActiveBuff: no stat change, it just holds the unit in place (isRooted). */
export const rootToBuff = (eff: Extract<Effect, { type: 'root' }>, idPrefix: string, source: string): ActiveBuff => ({
  id: `${idPrefix}-root`, source, damageElement: eff.damageElement,
  stat: 'movement', amount: 0, roots: true, turnsLeft: eff.turns,
  // Never capped, but a stack of its own so a dispel can take it
  stack: { key: `${source}:root`, id: nextEffectSeq(), max: Infinity },
});

/**
 * An aura (Effect 'aura') as an ActiveBuff on its bearer: no stat change, it just carries the aura (ActiveBuff.aura), whose
 * effects the units inside get (syncAuraEffects). One stack at a time: recast, it replaces the old one (addBuffs), so its
 * time is refreshed.
 */
export const auraToBuff = (eff: Extract<Effect, { type: 'aura' }>, idPrefix: string, source: string): ActiveBuff => ({
  id: `${idPrefix}-aura`, source, damageElement: eff.damageElement,
  stat: 'movement', amount: 0, aura: { def: eff.aura }, turnsLeft: eff.turns,
  stack: { key: `${source}:aura`, id: nextEffectSeq(), max: 1 },
});

/**
 * Whether a buff, HoT or DoT entry is a passive effect's (or gear's): one that lasts for good (turnsLeft Infinity) and is
 * no aura's. It shows no marker, a dispel leaves it, and a member keeps it through death and leaving a location.
 */
export const isPassiveEntry = (x: { turnsLeft: number; fromAura?: unknown }): boolean => !Number.isFinite(x.turnsLeft) && !x.fromAura;

/**
 * A unit's passive effects (PassiveEffect: a creature's, or a party member's from its class) as the buff entries it
 * starts with: the same entries a cast trigger buff or aura would make on it, but for good (turnsLeft Infinity, like
 * gear's bonuses: they never count down, show no marker and a dispel leaves them) and with no stack (nothing caps or
 * replaces them). `ownerKey`: the unit's key (a creature's id, a member's 'party-<idx>'), whose a trigger's 'source' is.
 */
export function passiveEffectEntries(passives: readonly PassiveEffect[] | undefined, ownerKey: string): ActiveBuff[] {
  return (passives ?? []).flatMap(p => {
    const prefix = `passive-${p.name}`;
    const { damageElement } = p;
    const entries = p.trigger
      ? effectToBuffs({ type: 'buff', appliesTo: 'target', damageElement, turns: Infinity, trigger: p.trigger }, prefix, p.name, ownerKey)
      : [auraToBuff({ type: 'aura', appliesTo: 'target', damageElement, turns: Infinity, aura: p.aura }, prefix, p.name)];
    return entries.map(b => ({ ...b, stack: undefined }));
  });
}

/** A HoT's or DoT's stacking: what its stacks share (its ability and element: tickStack) and how many fit (maxStacks). */
export interface TickStack { key: string; max: number }

/** The stacking of a HoT or DoT effect of ability `name`, when it sets maxStacks. */
export const tickStack = (name: string, eff: { damageElement: DamageElement; maxStacks?: number }): { stack?: TickStack } =>
  eff.maxStacks === undefined ? {} : { stack: { key: `${name}:${eff.damageElement}`, max: eff.maxStacks } };

/**
 * Add new HoTs or DoTs to a unit's (an outcome landing). One that would go past its effect's cap (TickStack)
 * replaces the oldest of it, so the count stays at the cap.
 */
export function addTicking<T extends { stack?: TickStack }>(list: T[], added: readonly T[]): T[] {
  if (added.length === 0) return list;
  let out = list;
  for (const t of added) {
    if (t.stack) {
      const { key, max } = t.stack;
      while (out.filter(x => x.stack?.key === key).length >= max) {
        const oldest = out.findIndex(x => x.stack?.key === key);
        out = out.filter((_, i) => i !== oldest);
      }
    }
    out = [...out, t];
  }
  return out;
}

export interface ActiveHot {
  name?: string;
  damageElement?: DamageElement;
  healPerTurn: number;
  restoresMP?: boolean;       // ticks restore MP instead of HP
  /** Its bearer's turns left: it heals at the start of each, counts down at the end (as ActiveBuff). */
  turnsLeft: number;
  fresh?: boolean;
  stack?: TickStack;
  /** It is an aura's effect (turnsLeft Infinity): it heals while its unit is inside the aura. */
  fromAura?: AuraTag;
  /** Its place in the order effects land (nextEffectSeq): a dispel takes the youngest first. None for an aura's effect. */
  seq?: number;
}

export interface ActiveDot {
  name?: string;
  damageElement: DamageElement;
  damagePerTurn: number;
  /** Its bearer's turns left: it deals damage at the start of each, counts down at the end (as ActiveBuff). */
  turnsLeft: number;
  fresh?: boolean;
  sourceKey?: string;         // threat key of the party-side unit that applied it to a foe (party member or summon: threatKey); none on its own side's
  penetration?: number;       // % points reducing armor/MR DR on each tick
  elementPenetration?: number; // % points reducing element resistance on each tick
  damagesMP?: boolean;        // ticks drain MP instead of HP
  stack?: TickStack;
  /** It is an aura's effect (turnsLeft Infinity): it hurts while its unit is inside the aura. */
  fromAura?: AuraTag;
  /** Its place in the order effects land (nextEffectSeq): a dispel takes the youngest first. None for an aura's effect. */
  seq?: number;
}

// ─── Dispelling ───────────────────────────────────────────────────────────────

/** The last place handed out in the order effects land (nextEffectSeq). */
let effectSeq = 0;

/** The next place in the order effects land: a buff or debuff application's stack id, a HoT's or DoT's `seq`. */
export const nextEffectSeq = () => ++effectSeq;

/** Whether a buff entry hurts its bearer (a debuff, a root, a debuff's trigger): what its marker shows as a debuff. */
export const isHarmful = (b: ActiveBuff) => b.amount < 0 || (b.percent ?? 0) < 0 || !!b.roots || !!b.trigger?.debuff;

/**
 * The effects a dispel takes (Effect 'dispel') from a unit's lists, youngest first: `harmful` ones (debuffs, roots,
 * DoTs) or else helpful ones (buffs, auras, HoTs). Each stack of a buff or debuff counts as one, as do a HoT and a DoT.
 * Never gear bonuses (turnsLeft Infinity) or an aura's effects on a unit inside it (they would come right back).
 * `skip`: places already taken (by another dispel of the same action). Returns the places taken and their names.
 */
export function pickDispelled(
  lists: { buffs: readonly ActiveBuff[]; hots: readonly ActiveHot[]; dots: readonly ActiveDot[] },
  harmful: boolean,
  count: number | 'all',
  skip: ReadonlySet<number>,
): { seqs: number[]; names: string[] } {
  const found = new Map<number, string>();
  const stacks = new Map<number, ActiveBuff[]>();
  for (const b of lists.buffs) {
    if (isPassiveEntry(b) || b.fromAura || b.stack === undefined) continue;
    stacks.set(b.stack.id, [...(stacks.get(b.stack.id) ?? []), b]);
  }
  for (const [id, entries] of stacks) {
    if (entries.some(isHarmful) === harmful) found.set(id, entries[0].source ?? entries[0].id);
  }
  for (const t of harmful ? lists.dots : lists.hots) {
    if (!isPassiveEntry(t) && !t.fromAura && t.seq !== undefined) found.set(t.seq, t.name ?? 'Effect');
  }
  const picked = [...found].filter(([seq]) => !skip.has(seq)).sort((a, b) => b[0] - a[0]).slice(0, count === 'all' ? undefined : Math.max(0, count));
  return { seqs: picked.map(([seq]) => seq), names: picked.map(([, name]) => name) };
}

/** A list of buffs, HoTs or DoTs without the effects at these places (a buff's is its stack id: pickDispelled). */
export function dropDispelled<T extends ActiveBuff | ActiveHot | ActiveDot>(list: T[], seqs: readonly number[]): T[] {
  if (seqs.length === 0) return list;
  const out = list.filter(x => !seqs.includes(('stat' in x ? x.stack?.id : x.seq) ?? -1));
  return out.length === list.length ? list : out;
}

// ─── Stat Display Helpers ─────────────────────────────────────────────────────

/**
 * Stat keys (BuffableStat with 'Bonus' stripped) whose values are percentages: what a buff, passive or affix on one
 * adds is percentage points. Damage (category and element) is a % bonus on every hit's damage, healing a % on heals
 * and HoTs cast, healingReceived a % on those received, and the regens a % of max HP / MP each turn (regenAmount).
 */
const PERCENT_STATS = new Set([
  'dodge', 'parry', 'block', 'glancingBlow',
  'meleeHit', 'meleeCrit', 'meleePenetration', 'meleeDamage',
  'rangedHit', 'rangedCrit', 'rangedPenetration', 'rangedDamage',
  'magicHit', 'magicCrit', 'magicPenetration', 'magicDamage',
  'increasedThreat', 'reducedThreat',
  'healing', 'healingReceived', 'hpRegen', 'mpRegen',
  ...DAMAGE_ELEMENTS.flatMap(el => ELEMENT_STAT_SUFFIXES.map(suffix => `${el}${suffix}`)),
]);

/**
 * Stats that are not a Stats field of their own but shift another: percentage points added to (increasedThreat) or
 * taken from (reducedThreat) the threatMultiplier, as a flat change (applyFlatPassives, applyStatBuffs). They are the
 * only way passives, buffs and gear change it (threatMultiplier is no BuffableStat), and only flat: never a percent of them.
 */
export const THREAT_SHIFT_STATS = { increasedThreat: 1, reducedThreat: -1 } as const;
export type ThreatShiftStat = keyof typeof THREAT_SHIFT_STATS;
const isThreatShift = (key: string): key is ThreatShiftStat => key in THREAT_SHIFT_STATS;

/** A stat's value as players read it: reducedThreat's is a reduction, so it shows negative ('−9% Threat'). */
export const shownStatValue = (key: string, value: number): number => (isThreatShift(key) ? value * THREAT_SHIFT_STATS[key] : value);

/** Returns '%' for percent-formatted stats, '' otherwise. */
export function statSuffix(key: string): string {
  return PERCENT_STATS.has(key) ? '%' : '';
}

/**
 * Percent stats shown as whole numbers. Healing (2 × spirit + devotion) is always whole; healing received is half
 * of spirit + devotion, so it can land on a .5, which the display rounds.
 */
const WHOLE_PERCENT_STATS = new Set(['healing', 'healingReceived']);

/** Formats a stat value for display: 1 decimal place for percent stats (whole for WHOLE_PERCENT_STATS), raw otherwise. */
function formatStatValue(key: string, value: number): string {
  if (!PERCENT_STATS.has(key)) return String(value);
  return value.toFixed(WHOLE_PERCENT_STATS.has(key) ? 0 : 1);
}

/** Formatted value plus its '%' suffix where applicable, e.g. formatStat('dodge', 7.25) → '7.3%', ('healing', 14) → '14%'. */
export const formatStat = (key: string, value: number) => `${formatStatValue(key, value)}${statSuffix(key)}`;

// ─── Internal Helpers ─────────────────────────────────────────────────────────

export const BASE_ATTRIBUTES = 5;
export const BASE_SKILLS = 0;
/** Attribute points gained per level above 1 (party members on each level-up; enemies auto-allocate theirs). */
export const ATTRIBUTE_POINTS_PER_LEVEL = 3;
/** Skill points a party member gains per level-up. */
export const SKILL_POINTS_PER_LEVEL = 3;

const fl = (n: number) => Math.floor(n);

/**
 * Attributes and skills: the base stats every other stat is derived from. Bonuses to them (buffs, gear,
 * class passives) go into the base calculation (calculateStats `baseBonuses`), so what derives from them
 * (HP from toughness, crit from expertise...) follows. Every other stat goes through STAT_ACCESSORS.
 */
export type BaseStatKey = AttributeKey | SkillKey;
const BASE_STAT_KEYS = new Set<string>([...ATTRIBUTE_KEYS, ...SKILL_KEYS]);
const isBaseStat = (key: string): key is BaseStatKey => BASE_STAT_KEYS.has(key);

/** Bonuses to base stats, flat and percent (applied after the flats): from buffs and gear. */
export type BaseStatBonuses = Partial<Record<BaseStatKey, { flat: number; percent: number }>>;

// ─── Stat Accessors ───────────────────────────────────────────────────────────
//
// Every numeric stat that passives, scaling passives, and buffs can modify, keyed by its
// passive / BuffableStat key. The modifier phases iterate this table instead of listing
// each stat by hand.

/** The least threatMultiplier can be (high subtlety, buffs): threat is always gained, never lost. */
export const MIN_THREAT_MULTIPLIER = 0.1;

type ScalarStatKey = 'hp' | 'mp' | 'hpRegen' | 'mpRegen' | 'initiative' | 'movement' | 'apMax' | 'armor' | 'dodge'
  | 'parry' | 'block' | 'glancingBlow' | 'magicResistance' | 'healing' | 'healingReceived' | 'threatMultiplier';

interface StatAccessor {
  key: string;
  get: (s: Stats) => number;
  set: (s: Stats, v: number) => void;
  noFloor?: boolean;  // real-valued stat — percent modifiers are not floored
  // Its floor. Buffs never take a stat below it (default 0); passives never take one that declares it below
  // it (applyStatMinimums), so e.g. movement is always at least 1.
  min?: number;
}

const EMPTY_ELEMENT_STATS: ElementStats = { hit: 0, crit: 0, damage: 0, resistance: 0, penetration: 0 };

/** Most an element resistance can reduce damage by (%), whatever stacks up (gear, passives, buffs). */
export const ELEMENT_RESISTANCE_CAP = 75;
/**
 * Lowest an element resistance can go (%): negative resistance is a weakness, adding that much damage taken
 * (-75 = 1.75x damage), whatever stacks up (debuffs, penetration).
 */
export const ELEMENT_RESISTANCE_FLOOR = -75;

const scalar = (key: ScalarStatKey, opts: Partial<StatAccessor> = {}): StatAccessor =>
  ({ key, get: s => s[key], set: (s, v) => { s[key] = v; }, ...opts });

// Percent stats (PERCENT_STATS: dodge, hit, crit...) come out of their formulas fractional and show one decimal, so a
// buff or affix on one adds to it as it is, never flooring the fraction away (a +3 Dodge affix adds exactly 3)
const STAT_ACCESSORS: StatAccessor[] = ([
  ...(['hp', 'mp', 'initiative', 'armor', 'dodge', 'parry', 'block', 'glancingBlow', 'magicResistance', 'healing', 'healingReceived'] as const)
    .map(k => scalar(k)),
  // Regeneration is never negative, whatever passives or debuffs do (a unit never loses HP or MP to it)
  scalar('hpRegen', { min: 0 }),
  scalar('mpRegen', { min: 0 }),
  scalar('movement', { min: 1 }),
  scalar('apMax'), // a stun can take it to 0: the unit skips its turn
  scalar('threatMultiplier', { noFloor: true, min: MIN_THREAT_MULTIPLIER }),
  ...(['melee', 'ranged', 'magic'] as const).flatMap(cat =>
    (['hit', 'damage', 'crit', 'penetration'] as const).map((f): StatAccessor => ({
      key: `${cat}${capitalize(f)}`,
      get: s => s[cat][f],
      set: (s, v) => { s[cat][f] = v; },
    }))),
  ...DAMAGE_ELEMENTS.flatMap(el =>
    (['hit', 'crit', 'damage', 'resistance', 'penetration'] as const).map((f): StatAccessor => ({
      key: `${el}${capitalize(f)}`,
      get: s => s.elementalStats[el]?.[f] ?? 0,
      set: (s, v) => { s.elementalStats[el] = { ...(s.elementalStats[el] ?? EMPTY_ELEMENT_STATS), [f]: v }; },
      // Resistance may go negative (a weakness), down to the floor
      ...(f === 'resistance' ? { min: ELEMENT_RESISTANCE_FLOOR } : {}),
    }))),
] as StatAccessor[]).map((a) => (PERCENT_STATS.has(a.key) ? { ...a, noFloor: true } : a));

/** Copy a Stats block deeply enough that STAT_ACCESSORS setters don't mutate the original. */
function cloneStats(stats: Stats): Stats {
  return { ...stats, melee: { ...stats.melee }, ranged: { ...stats.ranged }, magic: { ...stats.magic }, elementalStats: { ...stats.elementalStats } };
}

/**
 * Finish elemental stats: keep each resistance between ELEMENT_RESISTANCE_FLOOR and ELEMENT_RESISTANCE_CAP,
 * and drop all-zero entries so consumers only see elements with real modifiers.
 */
function pruneElementalStats(s: Stats): Stats {
  for (const el of DAMAGE_ELEMENTS) {
    const e = s.elementalStats[el];
    if (e && (e.resistance > ELEMENT_RESISTANCE_CAP || e.resistance < ELEMENT_RESISTANCE_FLOOR)) {
      s.elementalStats[el] = { ...e, resistance: Math.min(ELEMENT_RESISTANCE_CAP, Math.max(ELEMENT_RESISTANCE_FLOOR, e.resistance)) };
    }
    if (e && !e.hit && !e.crit && !e.damage && !e.resistance && !e.penetration) delete s.elementalStats[el];
  }
  return s;
}

// ─── Minimal Enemy Class Shape (for stat computation) ─────────────────────────
//
// EnemyClassData in enemies.ts satisfies this structurally — no circular import needed.
// stats.ts only needs these fields; display/AI fields live on EnemyClassData.

export interface EnemyClassStats {
  attributes: Partial<Record<AttributeKey, number>>;
  baseHp: number;
  skills?: Partial<Record<SkillKey, number>>;
  /** Armor per level: its armor bonus is baseArmor × its level (as gear armor grows with item level). */
  baseArmor: number;
  /** Inherent damage type resistances (%): flat, like a passive on `${element}Resistance`. */
  resistances?: Partial<Record<DamageElement, number>>;
  passives?: Passives;
  scalingPassives?: ScalingPassive[];
  /** It carries a shield (its model shows one): only then can it block (applyShieldRule), as a member needs one equipped. */
  shield?: boolean;
}

// ─── Stat Calculation Input Types ─────────────────────────────────────────────

export type PlayerStatInput = {
  mode: 'player';
  classKey: ClassKey;
  /** The member's subclass (SUBCLASSES id), once picked: its passives add to its class's. */
  subclass?: string;
  /** The party's level (default 1). */
  level?: number;
  gearArmorBonus?: number;
  /** A shield is equipped. Without one a member never blocks, whatever gives it block (applyShieldRule). */
  shield: boolean;
  /** A dagger is held: its melee damage draws on finesse first (buildRawStats). */
  dagger?: boolean;
  /** Attribute and skill points the member has spent (level-ups). */
  pointsSpent?: Partial<Record<AttributeKey, number>>;
  skillPointsSpent?: Partial<Record<SkillKey, number>>;
  /** Buffs and gear on attributes and skills (recomputeStats collects them). */
  baseBonuses?: BaseStatBonuses;
};

export type EnemyStatInput = {
  mode: 'enemy';
  classData: EnemyClassStats;
  /** Auto-allocated attribute points (generateEnemyAttributePoints). */
  pointsSpent: Record<AttributeKey, number>;
  level: number;
  /** Buffs on attributes and skills (recomputeStats collects them). */
  baseBonuses?: BaseStatBonuses;
};

// ─── Stat Calculation ─────────────────────────────────────────────────────────

/** Action points per combat turn (Stats.apMax): the party's and every enemy's. */
const PLAYER_AP_MAX = 3;
const ENEMY_AP_MAX = 3;
/** Tiles a move's worth of AP walks before speed (Stats.movement adds speed / 12): everyone's. */
export const BASE_MOVEMENT = 3;

/**
 * The least HP or MP a unit regenerates each turn, whatever its regen % and its max (regenAmount): every unit
 * recovers something.
 */
const MIN_REGEN = 1;

/** What a regen stat (hpRegen / mpRegen: a % of the max each turn) gives back in a turn: at least MIN_REGEN. */
export const regenAmount = (max: number, regenPercent: number): number => Math.max(MIN_REGEN, Math.round(max * regenPercent / 100));

/**
 * Phase 1 — pure attribute + skill formulas, no passives. HP and MP grow linearly with level (attributes and a level
 * term), so fights keep their length as levels rise; damage keeps up through levelScale (combat/abilities.ts).
 * Armor and magic resistance are measured against a divisor that grows with level (attackResolution.ts), so magic
 * resistance has a level term of its own, as gear armor grows with item level. `dagger`: melee damage draws on finesse
 * first (a dagger is held).
 */
function buildRawStats(
  attrs: Record<AttributeKey, number>,
  skills: Record<SkillKey, number>,
  level: number,
  armorBonus: number,
  movement: number,
  apMax: number,
  baseHp: number,
  dagger: boolean,
): Stats {
  const { strength: str, toughness: tou, finesse: fin, mind: mnd, spirit: spr, speed: spd } = attrs;
  const { perception, subtlety, expertise, spellcraft, evasion, redoubt, devotion } = skills;
  return {
    level,
    attributes: attrs,
    skills,
    hp:              fl(baseHp + (3 * str) + (6 * tou) + (6 * (level - 1))),
    mp:              fl(30 + (3 * spr) + (6 * mnd) + (6 * (level - 1))),
    // % of the max: a high base and gentle slopes, since the pool they are a share of grows with level too
    hpRegen:         4 + (spr / 10) + (tou / 20),
    mpRegen:         6 + (spr / 10) + (mnd / 20) + (devotion / 10),
    initiative:      fl((spd / 4) + (fin / 8) + (perception / 2) + (subtlety / 6)),
    movement:        movement + fl(spd / 12),
    apMax,
    armor:           fl(tou + (armorBonus * (1 + redoubt * 0.02))),
    dodge:           3 + (spd / 3) + (fin / 6) + (evasion / 3) + (perception / 5),
    parry:           (spd / 6) + (fin / 6) + (expertise / 6),
    block:           0 + (expertise / 5), // always 0 without a shield
    glancingBlow:    ((armorBonus / level) * (0.05 + redoubt * 0.01)) + (spd / 4) + (evasion / 4),
    magicResistance: fl(spr + (mnd / 3) + devotion + (4 * level)),
    healing:         (2 * spr) + devotion,
    healingReceived: (spr + devotion) / 2,
    melee: {
      hit:         (str / 5) + (fin / 4) + (expertise / 4),
      damage:      dagger ? (2 * fin) + str : (2 * str) + fin,
      crit:        5 + (fin / 4) + (str / 6) + (expertise / 3) + (subtlety / 5),
      penetration: expertise / 3,
    },
    ranged: {
      hit:         (fin / 3) + (expertise / 4),
      damage:      2 * fin,
      crit:        5 + (fin / 2) + (expertise / 3) + (subtlety / 5),
      penetration: expertise / 3,
    },
    magic: {
      hit:         (mnd / 3) + (spellcraft / 4),
      damage:      2 * mnd,
      crit:        5 + (mnd / 3) + (spellcraft / 3) + (subtlety / 5),
      penetration: spellcraft / 3,
    },
    threatMultiplier: 1 - (subtlety * 0.03), // floored at MIN_THREAT_MULTIPLIER (applyStatMinimums)
    elementalStats:  {},
  };
}

/** Phase 2 — add flat class passive bonuses. Block's flat passive is scaled by Redoubt (via stats.skills). */
function applyFlatPassives(stats: Stats, passives: Record<string, Passive>): Stats {
  const s = cloneStats(stats);
  const blockScale = 1 + stats.skills.redoubt * 0.02;
  for (const a of STAT_ACCESSORS) {
    const flat = passives[a.key]?.flat;
    if (flat) a.set(s, a.get(s) + (a.key === 'block' ? flat * blockScale : flat));
  }
  // increasedThreat / reducedThreat passives move the threatMultiplier (points of percent)
  for (const [key, sign] of Object.entries(THREAT_SHIFT_STATS)) s.threatMultiplier += (passives[key]?.flat ?? 0) * sign / 100;
  return s;
}

/** Phase 3 — add scaling passive outputs (computed from post-flat attributes), then apply percent passives. */
function applyScalingAndPctPassives(
  stats: Stats,
  passives: Record<string, Passive>,
  scalingPassives: ScalingPassive[],
): Stats {
  const s = cloneStats(stats);

  const attrSource: Record<string, number> = { ...stats.attributes, level: stats.level };
  const scalingBonus: Record<string, number> = {};
  for (const sp of scalingPassives) {
    scalingBonus[sp.targetKey] = (scalingBonus[sp.targetKey] ?? 0) + fl((attrSource[sp.source] ?? 0) * sp.factor);
  }

  for (const a of STAT_ACCESSORS) {
    const bonus = scalingBonus[a.key] ?? 0;
    const pct = passives[a.key]?.percent;
    if (!bonus && !pct) continue;
    let v = a.get(s) + bonus;
    if (pct) v = a.noFloor ? v * (1 + pct / 100) : fl(v * (1 + pct / 100));
    a.set(s, v);
  }
  return pruneElementalStats(s);
}

export function calculateStats(input: PlayerStatInput | EnemyStatInput): Stats {
  // Players: their class, the party's level, armor from gear, the points they've spent on level-ups.
  // Enemies: their class, level and level-scaled armor, plus their auto-allocated attribute points.
  const classData: EnemyClassStats | ClassData = input.mode === 'player' ? CLASSES[input.classKey] : input.classData;
  const level = input.mode === 'player' ? (input.level ?? 1) : input.level;
  const armorBonus = input.mode === 'player' ? (input.gearArmorBonus ?? 0) : input.classData.baseArmor * level;
  const movement = BASE_MOVEMENT;
  const apMax = input.mode === 'player' ? PLAYER_AP_MAX : ENEMY_AP_MAX;
  const skillPointsSpent = input.mode === 'player' ? input.skillPointsSpent : undefined;

  // The class's passives, and what adds to them: a creature's inherent resistances (flat, on its element
  // resistances), a member's subclass's. On a stat that has one already, the flat and percent bonuses sum
  const passives: Record<string, Passive> = { ...classData.passives };
  const addPassive = (key: string, p: Passive) => {
    const was = passives[key];
    passives[key] = was ? { name: was.name, flat: (was.flat ?? 0) + (p.flat ?? 0), percent: (was.percent ?? 0) + (p.percent ?? 0) } : p;
  };
  const resistances = input.mode === 'enemy' ? input.classData.resistances ?? {} : {};
  for (const [el, v] of Object.entries(resistances)) addPassive(`${el}Resistance`, { name: 'Inherent', flat: v ?? 0 });
  const sub = input.mode === 'player' && input.subclass ? subclass(input.subclass) : null;
  for (const [key, p] of Object.entries(sub?.passives ?? {})) addPassive(key, p);
  const scalingPassives = [...(classData.scalingPassives ?? []), ...(sub?.scalingPassives ?? [])];

  // A base stat: its innate value, plus the flat bonuses on it (class passives, buffs, gear), then the
  // percent ones; never below 0
  const base = (key: BaseStatKey, innate: number): number => {
    const bonus = input.baseBonuses?.[key];
    const flat = (passives[key]?.flat ?? 0) + (bonus?.flat ?? 0);
    const percent = (passives[key]?.percent ?? 0) + (bonus?.percent ?? 0);
    return Math.max(0, fl((innate + flat) * (1 + percent / 100)));
  };
  const attrs = Object.fromEntries(ATTRIBUTE_KEYS.map(key => [key,
    base(key, BASE_ATTRIBUTES + (classData.attributes[key] ?? 0) + (input.pointsSpent?.[key] ?? 0)),
  ])) as Record<AttributeKey, number>;
  const skills = Object.fromEntries(SKILL_KEYS.map(key => [key,
    base(key, BASE_SKILLS + (classData.skills?.[key] ?? 0) + (skillPointsSpent?.[key] ?? 0)),
  ])) as Record<SkillKey, number>;

  let stats = buildRawStats(attrs, skills, level, armorBonus, movement, apMax, classData.baseHp, input.mode === 'player' && !!input.dagger);
  stats = applyFlatPassives(stats, passives);
  stats = applyScalingAndPctPassives(stats, passives, scalingPassives);
  return applyShieldRule(applyStatMinimums(stats), input);
}

/**
 * Blocking takes a shield: a unit without one has 0 block, however it was earned (a class passive, an attribute or
 * skill formula, a buff, a gear affix). A member's shield is the one equipped; a creature's is its class's `shield`.
 * The last step of calculateStats and of recomputeStats (buffs come after the first), so a new source of block needs
 * nothing here: it applies once the unit has a shield.
 */
function applyShieldRule(stats: Stats, input: PlayerStatInput | EnemyStatInput): Stats {
  const shield = input.mode === 'player' ? input.shield : !!input.classData.shield;
  return !shield && stats.block !== 0 ? { ...stats, block: 0 } : stats;
}

/**
 * Hold every stat with a declared floor (StatAccessor.min: movement 1, hpRegen and mpRegen 0, threatMultiplier, element resistance)
 * at or above it, whatever passives did. Buffs keep to the same floors (applyStatBuffs). Stats without one
 * may go negative from passives (e.g. a Clumsy -10 melee hit).
 */
function applyStatMinimums(stats: Stats): Stats {
  const low = STAT_ACCESSORS.filter(a => a.min !== undefined && a.get(stats) < a.min);
  if (low.length === 0) return stats;
  const s = cloneStats(stats);
  for (const a of low) a.set(s, a.min!);
  return s;
}

/**
 * Apply buffs/debuffs on derived stats (everything but attributes and skills) to a Stats block.
 *
 * Order: flat bonuses applied first, then percentages applied to that total.
 * Formula per stat:  result = floor((base + ∑flats) × (1 + ∑percents / 100))
 *
 * Attribute and skill buffs are handled upstream (calculateStats `baseBonuses`, via recomputeStats) so
 * every value derived from them is recomputed correctly.
 */
export function applyStatBuffs(stats: Stats, buffs: ActiveBuff[]): Stats {
  const flatMap = new Map<string, number>();
  const pctMap  = new Map<string, number>();
  for (const buff of buffs) {
    if (isBaseStat(buff.stat)) continue;
    if (isThreatShift(buff.stat)) {
      // Points of percent on the threatMultiplier; a percent change of them means nothing
      if (buff.amount) flatMap.set('threatMultiplier', (flatMap.get('threatMultiplier') ?? 0) + buff.amount * THREAT_SHIFT_STATS[buff.stat] / 100);
      continue;
    }
    if (buff.amount)  flatMap.set(buff.stat, (flatMap.get(buff.stat) ?? 0) + buff.amount);
    if (buff.percent) pctMap.set(buff.stat,  (pctMap.get(buff.stat)  ?? 0) + buff.percent);
  }
  if (flatMap.size === 0 && pctMap.size === 0) return stats;

  const s = cloneStats(stats);
  for (const a of STAT_ACCESSORS) {
    const f = flatMap.get(a.key) ?? 0;
    const p = pctMap.get(a.key)  ?? 0;
    if (f === 0 && p === 0) continue;
    const result = (a.get(s) + f) * (1 + p / 100);
    a.set(s, Math.max(a.min ?? 0, a.noFloor ? result : fl(result)));
  }
  return pruneElementalStats(s);
}

/**
 * Recompute effective stats for any entity given a new buff list (buffs, debuffs and gear: getGearBuffs).
 * Attribute and skill buffs (flat and percent) are fed into calculateStats so every value derived from them
 * is re-derived; buffs on other stats are then applied on top (applyStatBuffs).
 */
export function recomputeStats(input: PlayerStatInput | EnemyStatInput, buffs: ActiveBuff[]): Stats {
  const baseBonuses: BaseStatBonuses = {};
  for (const buff of buffs) {
    if (!isBaseStat(buff.stat)) continue;
    const b = baseBonuses[buff.stat] ??= { flat: 0, percent: 0 };
    b.flat += buff.amount;
    b.percent += buff.percent ?? 0;
  }
  return applyShieldRule(applyStatBuffs(calculateStats({ ...input, baseBonuses }), buffs), input);
}

// Every buffable stat must have a way to apply: attributes and skills through the base calculation, the
// rest through STAT_ACCESSORS. A stat with neither would be silently ignored on gear, buffs and passives.
{
  const accessorKeys = new Set(STAT_ACCESSORS.map(a => a.key));
  const missing = BUFFABLE_STATS.filter(s => !isBaseStat(s) && !isThreatShift(s) && !accessorKeys.has(s));
  if (missing.length) throw new Error(`stats.ts: buffable stats with no way to apply: ${missing.join(', ')}`);
}

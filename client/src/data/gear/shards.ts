// Affix shards: what the party carries for enchanting (the enchanter: gear/enchanting.ts). A shard stands for one
// affix (AFFIX_STATS, gear/affixes.ts): it has no tier and no amount, only a count. There is a shard type for every
// affix, so the party's shards are a count per affix stat rather than inventory slots (the party window's Shards
// tab lists them by category). Enemies drop them (SHARD_DROP_CHANCE) and containers may hold them (`shardChance`,
// containers.ts), and the enchanter extracts them from items (disenchanting, shattering); she also buys and sells them.
import { AFFIX_STATS, type AffixStat } from './affixes';
import { ATTRIBUTE_KEYS, SKILL_KEYS, DAMAGE_ELEMENTS } from '../units/stats';
import { formatStatLabel } from '../detailStrings';
import { pick, randInt } from '../random';
import type { RGB } from '../../forge/core/vec';

/** How many shards of each type the party carries (a type it has none of is absent). */
export type ShardCounts = Partial<Record<AffixStat, number>>;

export type ShardCategoryId =
  | 'attributes' | 'skills' | 'vitals' | 'defense' | 'offense' | 'elemental' | 'resistance' | 'healing' | 'tempo';

export interface ShardCategory {
  id: ShardCategoryId;
  name: string;
  /** Its color in the shard list (the palette's --shard-* variable, index.css): the rail's selected row and the dot beside a shard. */
  color: string;
  /**
   * The color its shards' model is painted in (the Affix Shard is one tinted model: forge/core/tint.ts): muted, on
   * the darker end. Attributes and Healing are both green, told apart by a mossy and a sea green.
   */
  tint: RGB;
  /** Its shard types, in display order. */
  stats: AffixStat[];
}

/** A shard type's display name: the affix stat's label ('Fire Damage', 'HP Regen'). */
export const shardName = (stat: AffixStat): string => formatStatLabel(stat);

/** An element's stats for each of `suffixes` (fireDamage, iceDamage...), element by element. */
const elementStats = (suffixes: readonly string[]) =>
  DAMAGE_ELEMENTS.flatMap((el) => suffixes.map((s) => `${el}${s}` as AffixStat));

/** Sorted by display name, so related shards sit together (all the Melee ones, all the Fire ones). */
const byName = (stats: AffixStat[]) => [...stats].sort((a, b) => shardName(a).localeCompare(shardName(b)));

/** The shard categories, in the order the list and its rail show them. */
export const SHARD_CATEGORIES: readonly ShardCategory[] = [
  { id: 'attributes', name: 'Attributes', color: 'var(--shard-attributes)', tint: [88, 150, 76], stats: [...ATTRIBUTE_KEYS] },
  { id: 'skills', name: 'Skills', color: 'var(--shard-skills)', tint: [72, 104, 175], stats: [...SKILL_KEYS] },
  { id: 'vitals', name: 'Vitals', color: 'var(--shard-vitals)', tint: [175, 66, 62], stats: ['hp', 'mp', 'hpRegen', 'mpRegen'] },
  { id: 'defense', name: 'Defense', color: 'var(--shard-defense)', tint: [175, 102, 52], stats: ['armor', 'magicResistance', 'dodge', 'parry', 'block', 'glancingBlow'] },
  {
    id: 'offense', name: 'Offense', color: 'var(--shard-offense)', tint: [170, 150, 0],
    stats: byName((['melee', 'ranged', 'magic'] as const).flatMap((c) => (['Damage', 'Hit', 'Crit', 'Penetration'] as const).map((s) => `${c}${s}` as AffixStat))),
  },
  { id: 'elemental', name: 'Elemental', color: 'var(--shard-elemental)', tint: [116, 82, 156], stats: byName(elementStats(['Damage', 'Hit', 'Crit', 'Penetration'])) },
  { id: 'resistance', name: 'Resistance', color: 'var(--shard-resistance)', tint: [84, 87, 94], stats: elementStats(['Resistance']) },
  { id: 'healing', name: 'Healing', color: 'var(--shard-healing)', tint: [62, 156, 123], stats: ['healing', 'healingReceived'] },
  { id: 'tempo', name: 'Tempo', color: 'var(--shard-tempo)', tint: [176, 176, 172], stats: ['initiative'] },
];

/** Every shard type, in list order (category by category). */
export const SHARDS: readonly { stat: AffixStat; category: ShardCategoryId }[] =
  SHARD_CATEGORIES.flatMap((c) => c.stats.map((stat) => ({ stat, category: c.id })));

const CATEGORY_BY_ID = new Map(SHARD_CATEGORIES.map((c) => [c.id, c]));
/** A shard category, by id. */
export const shardCategory = (id: ShardCategoryId): ShardCategory => CATEGORY_BY_ID.get(id)!;
/** The category a shard type is in. */
export const categoryOfShard = (stat: AffixStat): ShardCategory => shardCategory(SHARDS.find((s) => s.stat === stat)!.category);

// Every affix has exactly one shard type: a new affix must be put in a category above (checked when this loads)
{
  const seen = new Set<string>();
  for (const { stat } of SHARDS) {
    if (seen.has(stat)) throw new Error(`shard '${stat}' is in two shard categories (shards.ts SHARD_CATEGORIES)`);
    seen.add(stat);
  }
  const missing = AFFIX_STATS.filter((s) => !seen.has(s));
  const extra = [...seen].filter((s) => !(AFFIX_STATS as readonly string[]).includes(s));
  if (missing.length || extra.length) {
    throw new Error(`shards.ts SHARD_CATEGORIES out of step with the affixes: missing ${missing.join(', ') || 'none'}; not affixes: ${extra.join(', ') || 'none'}`);
  }
}

/** The chance (0..1) that a dead enemy, any enemy, drops shards (a group of them: SHARD_DROP_COUNT). */
export const SHARD_DROP_CHANCE = 0.05;
/** How many shards one drop holds, an even pick from least to most, each of a random type. */
export const SHARD_DROP_COUNT: [min: number, max: number] = [5, 10];

/**
 * Shards dropped with a chance of `chance` (0..1; an enemy's SHARD_DROP_CHANCE, a container's `shardChance`): a group
 * of SHARD_DROP_COUNT shards of random types (the same type can come up more than once), or null for none.
 */
export function rollShardDrop(chance: number): ShardCounts | null {
  if (Math.random() >= chance) return null;
  let counts: ShardCounts = {};
  for (let i = 0, n = randInt(SHARD_DROP_COUNT[0], SHARD_DROP_COUNT[1]); i < n; i++) counts = addShards(counts, pick(SHARDS).stat);
  return counts;
}

/** How many shards of a type the party carries. */
export const shardCount = (counts: ShardCounts, stat: AffixStat): number => counts[stat] ?? 0;

/** The party's shards with `n` more of a type (`n` a whole number, 1 or more). */
export const addShards = (counts: ShardCounts, stat: AffixStat, n = 1): ShardCounts => ({ ...counts, [stat]: shardCount(counts, stat) + n });

/** Two sets of shards together (shards picked up joining the party's, two drops on one tile). */
export function mergeShards(a: ShardCounts, b: ShardCounts): ShardCounts {
  let out = a;
  for (const [stat, n] of Object.entries(b) as [AffixStat, number][]) out = addShards(out, stat, n);
  return out;
}

/** How many shards there are in all, of every type. */
export const totalShards = (counts: ShardCounts): number => Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);

/**
 * The party's shards with `n` of a type used up (a type at zero leaves the counts), or null when it carries fewer
 * than `n`: the enchanting check (nothing is taken from a party that can't pay).
 */
export function spendShards(counts: ShardCounts, stat: AffixStat, n = 1): ShardCounts | null {
  const left = shardCount(counts, stat) - n;
  if (left < 0) return null;
  const { [stat]: _spent, ...rest } = counts;
  return left > 0 ? { ...rest, [stat]: left } : rest;
}

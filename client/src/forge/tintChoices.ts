// The colors a tinted model can be shown in (the forge page's color menu, forge:sheet --tint): each dungeon's riftColor
// (the Rift and the Keystone) and each shard category's color (the Affix Shard). Reads game data only; no three.js.
import { DUNGEONS } from '../data/world/dungeons';
import { SHARD_CATEGORIES } from '../data/gear/shards';
import type { RGB } from './core/vec';

export interface TintChoice {
  /** What `--tint` and the page's URL name it by: a dungeon's key, or 'shard-<category>'. */
  key: string;
  name: string;
  color: RGB;
}

export const TINT_CHOICES: TintChoice[] = [
  ...Object.entries(DUNGEONS).map(([key, d]) => ({ key, name: d.name, color: d.riftColor })),
  ...SHARD_CATEGORIES.map((c) => ({ key: `shard-${c.id}`, name: `Shard: ${c.name}`, color: c.tint })),
];

/** A choice's color, by its key. */
export const tintChoice = (key: string): TintChoice | undefined => TINT_CHOICES.find((t) => t.key === key);

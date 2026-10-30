// Loot: things lying on the floor that the party picks up but that aren't items (they never go in the inventory).
// For now, gold: a dead enemy may drop a pile of coins on its tile (its class's `dropsGold`, rolled apart from its
// item drops), picked up into the party's gold. Each is drawn by its forge design (`model`, forge category "Loot").
import type { ModelLink } from '../../forge/core/types';
import { randInt, rollCount } from '../random';

export interface LootData {
  id: string;
  name: string;
  model: ModelLink;
}

export const LOOT: LootData[] = [
  // A scatter of gold coins on the floor
  { id: 'gold', name: 'Gold Coins', model: 'loot.gold-coins' },
];

/** A loot entry by id. */
export function loot(id: string): LootData {
  const l = LOOT.find((x) => x.id === id);
  if (!l) throw new Error(`no loot '${id}' (data/gear/loot.ts)`);
  return l;
}

/** The gold one roll gives at level 1: [least, most]. A level L enemy's roll is L times as much (5L to 10L). */
export const GOLD_PER_LEVEL: [number, number] = [5, 10];

/**
 * The gold a dead enemy of `level` drops, by its class's `dropsGold`, read like dropChance: its whole part is that
 * many guaranteed rolls, its fraction the chance of one more. The rolls are summed into one pile, raised by
 * `goldBonus` percent (50: half as much again). 0: nothing dropped.
 */
export function rollGold(level: number, dropsGold: number, goldBonus = 0): number {
  let sum = 0;
  for (let i = 0, rolls = rollCount(dropsGold); i < rolls; i++) sum += randInt(GOLD_PER_LEVEL[0] * level, GOLD_PER_LEVEL[1] * level);
  return Math.round(sum * (1 + goldBonus / 100));
}

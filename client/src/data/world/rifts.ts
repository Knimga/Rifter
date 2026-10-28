// Rifts and keystones. Every rift has the same shape, and so does every keystone: one model each (forge section
// "Rifts & Keys"), painted when drawn in the color of where it leads: a rift into a dungeon and that dungeon's
// keystone in its color (DungeonConfig.riftColor), a rift back to the Sanctum (where the party arrives in a
// dungeon, and past its boss) in SANCTUM_RIFT_COLOR. A new dungeon needs only its color.
//
// Rift keys (keystones, one per dungeon: DungeonConfig.keyName): the party keeps them on its keyring, apart from
// the inventory, and never loses them (using one to open a rift doesn't use it up). It starts with the Crypt's;
// every boss drops one the party doesn't have yet (none once it has them all).
import type { ModelLink } from '../../forge/core/types';
import type { RGB } from '../../forge/core/vec';
import { DUNGEONS, type DungeonKey } from './dungeons';
import { pick } from '../random';

export interface RiftModelData {
  id: string;
  name: string;
  model: ModelLink;
}

/** The two tinted models: a rift (a way between the Sanctum and a dungeon) and a keystone (what opens one). */
export const RIFT_MODELS = {
  // A way between the Sanctum and a dungeon: each dungeon's ways out (DungeonMap: where the party arrives, and past
  // the boss), and the Rifter's open rift (built into the active Rifter's model). Where one leads is set by the map that places it
  rift: { id: 'rift', name: 'Rift', model: 'rift.rift' },
  // A rift key: opens a rift to its dungeon when set in the Sanctum's Rifter. Drawn in its dungeon's color, on the
  // floor where a boss dropped it and as its icon on the keyring
  keystone: { id: 'keystone', name: 'Keystone', model: 'rift.keystone' },
} as const satisfies Record<string, RiftModelData>;

/** The color of every rift back to the Sanctum: a deep royal blue. */
export const SANCTUM_RIFT_COLOR: RGB = [40, 65, 175];

/** The keys the party starts the game with. */
export const STARTING_KEYS: readonly DungeonKey[] = ['crypt'];

/**
 * The key a boss drops: one of a dungeon the party has no key to yet (`owned`), and that isn't already lying
 * somewhere waiting to be picked up (`lying`), chosen at random; null when there is none left.
 */
export function bossKeyDrop(owned: readonly DungeonKey[], lying: readonly DungeonKey[] = []): DungeonKey | null {
  const left = Object.keys(DUNGEONS).filter((k) => !owned.includes(k) && !lying.includes(k));
  return left.length ? pick(left) : null;
}

/** A rift color as CSS (a usable rift's tile glow). */
export const riftGlowCss = ([r, g, b]: RGB): string => `rgb(${r} ${g} ${b})`;

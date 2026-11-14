// Rifts and keystones. Every rift has the same shape, and so does every keystone: one model each (forge section
// "Rifts & Keys"), painted when drawn in the color of where it leads: a rift into a dungeon and that dungeon's
// keystone in its color (DungeonConfig.riftColor), a rift back to the Sanctum (where the party arrives in a
// dungeon, and past its boss, opening once the boss falls: riftShut) in SANCTUM_RIFT_COLOR. A new dungeon needs only its color.
//
// Rift keys (keystones, one per dungeon: DungeonConfig.keyName): the party keeps them on its keyring, apart from
// the inventory, and never loses them (using one to open a rift doesn't use it up). It starts with none (the Crypt's
// is found in the Dark Tunnel: STARTING_KEYS); a boss drops the next key the party doesn't have yet, tier by tier
// (bossKeyDrop: DungeonConfig.tier and stronghold).
import type { ModelLink } from '../../forge/core/types';
import type { RGB } from '../../forge/core/vec';
import { DUNGEONS, type DungeonKey } from './dungeons';
import { quest, type QuestCondition, type QuestLog } from './quests';
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

/**
 * The keys the party starts the game with: none (it finds the Crypt's in the Dark Tunnel, PASSAGES' foundKey, not
 * knowing what it is; Ardas names it and it goes on the keyring).
 */
export const STARTING_KEYS: readonly DungeonKey[] = [];

/** The color of the portals the party arrives through at the game's opening (OpeningArrival): a dark void purple. */
export const ARRIVAL_PORTAL_COLOR: RGB = [104, 44, 200];

/**
 * When the party can use the Rifter: once Ileena has told it how (the "Use the Rifter" quest moved on past speaking
 * with her, or done). Until then its receptacle doesn't respond.
 */
export const RIFTER_UNLOCK: QuestCondition = { reached: 'use-the-rifter', step: 'enter-rift' };

/**
 * TEMP (testing only): the party as it stands once Ileena has shown it the Rifter: its quests at "Use the Rifter",
 * "Enter the Rift", and Ardas's Crypt key on its keyring (CharacterSelectScreen's "Skip to Sanctum").
 */
export const RIFTER_READY_START: { quests: QuestLog; keys: readonly DungeonKey[] } = {
  quests: {
    active: ['use-the-rifter'],
    completed: ['escape-dark-tunnel', 'seek-ardas'],
    steps: { 'use-the-rifter': (quest('use-the-rifter').steps ?? []).findIndex((s) => s.id === 'enter-rift') },
  },
  keys: ['crypt'],
};

/**
 * The key the boss of dungeon `from` drops, from the keys the party has no key to yet (`owned`) and that aren't already
 * lying somewhere waiting to be picked up (`lying`). A boss drops a key of its own tier (a stronghold's boss, of the
 * next tier): one of the tier's other dungeons, at random; once the party has all of those (owned, not just dropped),
 * the tier's stronghold. Null when there is none left in that tier (a boss of an earlier tier never drops a later
 * tier's key: the stronghold's boss opens the next tier).
 */
export function bossKeyDrop(from: DungeonKey, owned: readonly DungeonKey[], lying: readonly DungeonKey[] = []): DungeonKey | null {
  const tier = DUNGEONS[from].tier + (DUNGEONS[from].stronghold ? 1 : 0);
  const inTier = Object.keys(DUNGEONS).filter((k) => DUNGEONS[k].tier === tier);
  const others = inTier.filter((k) => !DUNGEONS[k].stronghold);
  const left = others.filter((k) => !owned.includes(k) && !lying.includes(k));
  if (left.length) return pick(left);
  if (!others.every((k) => owned.includes(k))) return null;
  return inTier.find((k) => DUNGEONS[k].stronghold && !owned.includes(k) && !lying.includes(k)) ?? null;
}

// A tier has one stronghold at most (bossKeyDrop drops the first): warned at load
for (const tier of new Set(Object.values(DUNGEONS).map((d) => d.tier))) {
  const holds = Object.keys(DUNGEONS).filter((k) => DUNGEONS[k].tier === tier && DUNGEONS[k].stronghold);
  if (holds.length > 1) console.warn(`dungeons › tier ${tier}: more than one stronghold (${holds.join(', ')}); only the first drops`);
}

/** A rift color as CSS (a usable rift's tile glow). */
export const riftGlowCss = ([r, g, b]: RGB): string => `rgb(${r} ${g} ${b})`;

/** What announces a rift key put on the keyring ("Necrotic Key Received"), in its rift's color. */
export const keyReceived = (key: DungeonKey): { text: string; color: string } =>
  ({ text: `${DUNGEONS[key].keyName} Received`, color: riftGlowCss(DUNGEONS[key].riftColor) });

// Where approved designs live: designs/<folder>/<stem>.ts, one folder per category (shared helpers, `_x.ts`, stay
// in designs/ itself). Drafts stay flat in drafts/. Pure TS: the forge's Vite plugin uses it too (approving).
import type { Category } from './types';

/** Each category's folder under designs/. */
export const CATEGORY_FOLDER: Record<Category, string> = {
  creature: 'creatures',
  summon: 'summons',
  character: 'classes',
  weapon: 'weapons',
  armor: 'armor',
  offhand: 'offhands',
  jewelry: 'jewelry',
  interactive: 'interactive',
  decor: 'decor',
  loot: 'loot',
  rift: 'rifts',
  npc: 'npcs',
};

/**
 * A draft's source as its approved file (drafts/<stem>.ts -> designs/<folder>/<stem>.ts, one folder deeper): its
 * shared helpers ('../designs/_x') are '../_x' from there, and every other relative import ('../core', '../../data')
 * reaches one level further up.
 */
export const approvedSource = (draft: string): string =>
  draft.replace(/(from\s+|import\(\s*)'(\.\.\/[^']*)'/g, (_, lead: string, path: string) =>
    `${lead}'${path.startsWith('../designs/') ? `../${path.slice('../designs/'.length)}` : `../${path}`}'`);

// DEV ONLY. Import this only from the lazily-loaded /dev/forge route so drafts never ship in the game bundle.
import type { Design } from '../core/types';

const mods = import.meta.glob<{ default: Design }>('../drafts/[!_]*.ts', { eager: true });
export const drafts: Record<string, Design> = {};
for (const m of Object.values(mods)) drafts[m.default.id] = m.default;

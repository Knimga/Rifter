// Browser-side registry of APPROVED designs: designs/<category folder>/<stem>.ts (core/folders.ts). Files starting
// with "_" are helpers, not designs.
// No three.js here, so game UI can import it without pulling the renderer into the main bundle.
import type { Design } from './core/types';

const mods = import.meta.glob<{ default: Design }>('./designs/*/[!_]*.ts', { eager: true });
export const designs: Record<string, Design> = {};
for (const m of Object.values(mods)) designs[m.default.id] = m.default;

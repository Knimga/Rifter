// Browser-side registry of APPROVED designs. Files starting with "_" are helpers, not designs.
// No three.js here, so game UI can import it without pulling the renderer into the main bundle.
import type { Design, ModelLink } from './core/types';
import { linkedDesign } from './core/link';

const mods = import.meta.glob<{ default: Design }>('./designs/[!_]*.ts', { eager: true });
export const designs: Record<string, Design> = {};
for (const m of Object.values(mods)) designs[m.default.id] = m.default;
export const designList = Object.values(designs);

/** True if a game object with this link renders as a model (the link points at an approved design). */
export const isRenderable = (link: ModelLink | undefined) => linkedDesign(designs, link) !== null;

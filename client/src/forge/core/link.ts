import { buildModel } from './build';
import { hashSeed } from './rng';
import type { Design, Model, ModelLink } from './types';

/** The one seed every item builds with: all items of one name (one design) look exactly the same. */
export const ITEM_SEED = 1;

/** True if every instance of the design looks the same (items); otherwise each instance has its own look. */
export const oneLook = (design: Design): boolean => design.fit.kind === 'item';

/**
 * The seed a game thing renders with. Items: always ITEM_SEED. Creatures and characters seed from the
 * instance's own stable id (e.g. an enemy instance's id), so they vary between instances but each one
 * keeps its look. The game renderer and the forge page both use this.
 */
export const instanceSeed = (design: Design, instanceId: string): number => (oneLook(design) ? ITEM_SEED : hashSeed(instanceId));

/** The approved design a link points at, or null if it isn't approved (yet). */
export const linkedDesign = (designs: Record<string, Design>, link: ModelLink): Design | null => designs[link] ?? null;

/** Build the model for one instance of a game thing (a unit, an item, an object), exactly as the game renders it. */
export function buildInstance(design: Design, instanceId: string): Model {
  return buildModel(design, instanceSeed(design, instanceId));
}

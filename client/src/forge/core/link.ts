import { buildModel } from './build';
import { hashSeed } from './rng';
import type { Design, Model, ModelLink } from './types';

/**
 * The seed a linked game object renders with. A link without a fixed seed seeds each instance from its
 * own stable id (e.g. an enemy instance's id), so unfixed params vary between instances but each
 * instance keeps its look. The game renderer and the forge's in-game sample cells both use this.
 */
export const instanceSeed = (link: ModelLink, instanceId: string): number => link.seed ?? hashSeed(instanceId);

/** The approved design a link points at, or null if it isn't (or is no longer) approved. */
export const linkedDesign = (designs: Record<string, Design>, link: ModelLink | undefined): Design | null =>
  (link && designs[link.design]) || null;

/** Build the model for one instance of a linked game object, exactly as the game renders it. */
export function buildLinkedModel(design: Design, link: ModelLink, instanceId: string): Model {
  return buildModel(design, instanceSeed(link, instanceId), link.params);
}

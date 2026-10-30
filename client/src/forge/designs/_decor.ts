// Shared by decorative object designs (DECOR_OBJECTS in data/world/decorObjects.ts; forge section "Decorative Objects"):
// their identity, the dark wood and iron the Sanctum's merchant things are made of, and a barrel.
// Files starting with "_" are NOT registered as designs.
import type { DataRef } from '../core/types';
import type { Mesh } from '../core/mesh';
import { slug } from '../core/slug';
import { frustum, loft, ringPts } from '../core/primitives';
import { add, type RGB, type Vec3 } from '../core/vec';
import { DECOR_OBJECTS } from '../../data/world/decorObjects';

/** The dark wood of the merchant's things (the Merchant's Cart, its barrels), and its darker boards. */
export const DARK_WOOD: RGB = [40, 28, 21];
export const DARK_WOOD_SHADE: RGB = [29, 21, 16];
/** Their iron fittings: hoops, axles, hinges. */
export const DECOR_IRON: RGB = [56, 58, 64];

/**
 * Identity of a decorative object design, from its exact data entry (DECOR_OBJECTS[id]): label = the object's
 * name ('Wooden Crate'), id = 'decor.' + slug(name), source = the entry.
 */
export function decorEntry(objectId: string): { id: string; label: string; source: DataRef } {
  const o = DECOR_OBJECTS.find((x) => x.id === objectId);
  if (!o) throw new Error(`no decorative object '${objectId}' (data/world/decorObjects.ts)`);
  return { id: `decor.${slug(o.name)}`, label: o.name, source: { table: 'decorObjects', key: objectId } };
}

/**
 * A wooden barrel standing on `base` (its bottom's center), `h` tall, `r` round at its belly (its ends 0.8 of that),
 * in `col`, with two iron hoops a fifth of the way in from each end. `lid`: a darker disc set into its top.
 */
export function barrel(m: Mesh, base: Vec3, h: number, r: number, col: RGB, o: { lid?: RGB } = {}): void {
  loft(m, [[0, 0.8], [0.5, 1], [1, 0.8]].map(([t, k]) => ringPts(add(base, [0, t * h, 0]), [0, 1, 0], k * r, 8)), col, { j: 0.14 });
  // The hoops follow the belly: wider toward the middle
  for (const [t, r0, r1] of [[0.2, 0.96, 0.984], [0.8, 0.976, 0.944]])
    frustum(m, add(base, [0, (t - 0.05) * h, 0]), add(base, [0, (t + 0.05) * h, 0]), r0 * r, r1 * r, 8, DECOR_IRON, { j: 0.08 });
  if (o.lid) frustum(m, add(base, [0, h - 0.004, 0]), add(base, [0, h + 0.006, 0]), 0.68 * r, 0.66 * r, 8, o.lid, { j: 0.1 });
}

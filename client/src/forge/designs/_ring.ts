// Rings and amulets (JEWELRY in data/gear/jewelry.ts; forge section "Rings & Amulets"): their identity, and the plain
// band (the Iron, Tungsten and Bronze Bands are one shape in three metals). Files starting with "_" are NOT
// registered as designs.
import type { DataRef, Design } from '../core/types';
import { slug } from '../core/slug';
import { mixC, type RGB, type Vec3 } from '../core/vec';
import { JEWELRY } from '../../data/gear/jewelry';
import { JEWELRY_KINDS } from '../../data/gear/types';

/**
 * Identity of a ring or amulet design, from its exact data entry (RINGS / AMULETS, by its id): label = its name,
 * id = 'jewelry.' + slug(name), source = the entry.
 */
export function jewelryEntry(typeId: string): { id: string; label: string; source: DataRef } {
  const t = JEWELRY_KINDS.flatMap((k) => JEWELRY[k]).find((x) => x.id === typeId);
  if (!t) throw new Error(`no ring or amulet '${typeId}' (data/gear/jewelry.ts)`);
  return { id: `jewelry.${slug(t.name)}`, label: t.name, source: { table: 'jewelry', key: typeId } };
}

/** Jewelry's bronze: the Bronze Band, and the Carnelian Amulet's setting and chain. */
export const BRONZE: RGB = [168, 114, 60];
/** Jewelry's silver: the Malachite and Lazurite Amulets' settings and chains. */
export const SILVER: RGB = [184, 188, 196];

/** A band's size (model units; the fit scales it): its inner radius, its thickness outward, and its width. */
const RI = 0.5, T = 0.13, W = 0.24;
/** Around the band, and points on the dome of its cross-section. */
const SEGMENTS = 20, DOME = 6;

/**
 * A plain band: flat inside (where it sits on the finger) and domed outside, in `metal`. Built facing +z: the band
 * lies in the x-y plane around the z axis (its icon looks through it; as loot it lies flat on the floor). Its `top`
 * anchor marks the top of the band (+y), where a ring with a gem or other detail puts it.
 */
export function bandDesign(typeId: string, metal: RGB): Design {
  const entry = jewelryEntry(typeId);
  return {
    ...entry,
    category: 'jewelry',
    fit: { kind: 'item', size: 0.3 },
    budget: 400,
    build(c) {
      const m = c.mesh;
      // The cross-section (radius, z), closed: the flat inside from back to front, then the dome back over the top
      const profile: [number, number][] = [[RI, -W / 2], [RI, W / 2]];
      for (let k = DOME; k >= 0; k--) {
        const phi = (k / DOME - 0.5) * Math.PI * 0.86; // short of the edges: a narrow flat where dome meets inside
        profile.push([RI + 0.018 + T * Math.cos(phi), (W / 2) * Math.sin(phi)]);
      }
      // The dome's crown catches the light, its flanks and the inside a little darker
      const shade = (_: Vec3, n: Vec3): RGB => mixC(metal, [24, 24, 28], 0.28 - 0.28 * Math.max(0, n[1] * 0.4 + n[2] * 0.6));
      const at = (i: number, [r, z]: [number, number]): Vec3 => {
        const a = (i / SEGMENTS) * Math.PI * 2;
        return [Math.cos(a) * r, Math.sin(a) * r, z];
      };
      for (let i = 0; i < SEGMENTS; i++) {
        // Each piece of the band is oriented away from its own cross-section's middle (the band isn't convex)
        const a = ((i + 0.5) / SEGMENTS) * Math.PI * 2, mid = RI + T / 2;
        const ctr: Vec3 = [Math.cos(a) * mid, Math.sin(a) * mid, 0];
        for (let k = 0; k < profile.length; k++) {
          const p = profile[k], q = profile[(k + 1) % profile.length];
          m.quad(at(i, p), at(i + 1, p), at(i + 1, q), at(i, q), shade, ctr, { j: 0.08 });
        }
      }
      // Its top: the crown of the dome at +y, where a ring's gem or other detail sits (its icon turns it to the
      // upper right: JEWELRY_ICON_CAMERA)
      m.anchor('top', [0, RI + 0.018 + T, 0]);
      return entry.label;
    },
  };
}

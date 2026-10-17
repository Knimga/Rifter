// Shared by weapon designs. Files starting with "_" are NOT registered as designs.
import type { BuildCtx } from '../core/ctx';
import { type RGB, mulC } from '../core/vec';

export const MATERIALS = {
  iron: [122, 128, 138],
  steel: [168, 180, 198],
  bronze: [178, 120, 62],
  mythril: [92, 196, 210],
  obsidian: [64, 54, 92],
} as const satisfies Record<string, RGB>;

export interface WeaponPalette {
  metal: RGB;
  edge: RGB;
  trim: RGB;
  leather: RGB;
  wood: RGB;
  materialName: string;
}

const title = (s: string) => s[0].toUpperCase() + s.slice(1);

/**
 * Draws the `material` param (call this FIRST in build, so draw order is stable).
 * In the game, the item's series tier maps onto it (Plain -> iron). Rarity glow is applied by the
 * renderer, never baked into the mesh, so there is no affix/element param.
 */
export function weaponPalette(c: BuildCtx): WeaponPalette {
  const material = c.choice('material', Object.keys(MATERIALS) as (keyof typeof MATERIALS)[]);
  const metal: RGB = [...MATERIALS[material]];
  return {
    metal,
    edge: mulC(metal, 1.3),
    trim: [196, 158, 72],
    leather: [92, 62, 44],
    wood: [112, 80, 50],
    materialName: title(material),
  };
}

/** Tilt the finished weapon so it reads diagonally in icons and on the ground. */
export const WEAPON_ROLL = -0.45;

// Shared by weapon designs. Files starting with "_" are NOT registered as designs.
import type { DataRef } from '../core/types';
import { slug } from '../core/slug';
import { type RGB, mulC } from '../core/vec';
import { WEAPON_SERIES, weaponName } from '../../data/gear/weapons';
import type { WeaponType } from '../../data/gear/types';

export const MATERIALS = {
  iron: [122, 128, 138],
  steel: [168, 180, 198],
  bronze: [178, 120, 62],
  mythril: [92, 196, 210],
  obsidian: [64, 54, 92],
} as const satisfies Record<string, RGB>;

/** What each weapon series (WEAPON_SERIES in data/gear/weapons.ts) is made of. Add an entry with each new series. */
export const SERIES_MATERIAL: Record<string, keyof typeof MATERIALS> = {
  plain: 'iron',
};

export interface WeaponPalette {
  metal: RGB;
  edge: RGB;
  trim: RGB;
  leather: RGB;
  wood: RGB;
  /** Bowstrings (bows, crossbows). */
  string: RGB;
}

/**
 * Identity of a weapon design, all derived from its exact data entry (WEAPON_SERIES[series].weapons[type]):
 * label = the entry's display name ('Plain Gladius'), id = 'weapon.' + slug(name), source = the entry.
 * The series also sets the material. Rarity glow is the renderer's job, never part of the mesh.
 */
export function weaponEntry(seriesId: string, weaponType: WeaponType): { id: string; label: string; source: DataRef; palette: WeaponPalette } {
  const series = WEAPON_SERIES.find((s) => s.id === seriesId);
  if (!series?.weapons[weaponType]) throw new Error(`no weapon '${weaponType}' in series '${seriesId}' (data/gear/weapons.ts)`);
  const label = weaponName(series, weaponType);
  const metal: RGB = [...MATERIALS[SERIES_MATERIAL[seriesId] ?? 'iron']];
  return {
    id: `weapon.${slug(label)}`,
    label,
    source: { table: 'weapons', key: `${seriesId}/${weaponType}` },
    palette: { metal, edge: mulC(metal, 1.3), trim: [196, 158, 72], leather: [92, 62, 44], wood: [112, 80, 50], string: [214, 204, 180] },
  };
}

/**
 * Crystal tints for staves and wands. Plain weapons use pale, washed-out tints: still clearly crystal,
 * but nothing brilliant. (A later series can bring its own, more saturated set.)
 */
export const PALE_CRYSTALS: readonly RGB[] = [
  [196, 214, 222], // pale ice
  [214, 202, 214], // pale rose quartz
  [204, 218, 200], // pale jade
  [212, 208, 222], // pale amethyst
];

/** Tilt the finished weapon so it reads diagonally: tip up and to the LEFT (the character sheet's weapon slot is on the left). */
export const WEAPON_ROLL = 0.45;

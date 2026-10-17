// Shared by armor designs (series identity and colors, plus shape helpers every armor family uses).
// Files starting with "_" are NOT registered as designs.
// Items are built standing upright, front facing +z: that face is what the icon shows and what lies face-up as loot.
import type { DataRef } from '../core/types';
import type { ColorFn, Mesh } from '../core/mesh';
import { slug } from '../core/slug';
import { blob, frustum, loft } from '../core/primitives';
import { add, mulC, rotZ, type RGB, type Vec3 } from '../core/vec';
import { ARMOR_SERIES, armorName } from '../../data/gear/armor';
import type { ArmorSlot } from '../../data/gear/types';

export interface ArmorPalette {
  /** Main material of the piece (cloth, leather...). */
  main: RGB;
  /** Folds, linings and the inside of openings. */
  shadow: RGB;
  /** Hems, cuffs, edging and straps. */
  trim: RGB;
  /** Sashes, ties, cords and laces. */
  cord: RGB;
  /** Bandage-like wraps (handwraps). */
  wrap: RGB;
  /** Shoe and boot soles. */
  sole: RGB;
  /** Buckles and rivets (bone toggles for hide). */
  metal: RGB;
  /** Fur trim (hide). */
  fur: RGB;
}

/** Colors of each armor series (ARMOR_SERIES in data/gear/armor.ts). Add an entry with each new series. */
export const SERIES_PALETTE: Record<string, ArmorPalette> = {
  // Apprentice (Cloth): plain, muted slate-blue wool with undyed linen edging; nothing rich or saturated.
  apprentice: (() => {
    const main: RGB = [88, 100, 134];
    return { main, shadow: mulC(main, 0.45), trim: [200, 188, 154], cord: [120, 86, 58], wrap: [204, 194, 168], sole: [128, 98, 70], metal: [140, 140, 136], fur: [96, 80, 64] };
  })(),
  // Leather (Light): mid-brown tanned leather, darker leather edging and straps, pale lacing, plain iron buckles.
  leather: (() => {
    const main: RGB = [128, 86, 54];
    return { main, shadow: mulC(main, 0.38), trim: [84, 56, 36], cord: [182, 150, 106], wrap: main, sole: [56, 42, 32], metal: [146, 144, 136], fur: [96, 80, 64] };
  })(),
  // Iron (Heavy): plain grey iron plate (the same iron as Plain weapons) with brighter rolled edges,
  // leather straps and iron rivets.
  iron: (() => {
    const main: RGB = [124, 130, 140];
    return { main, shadow: [26, 26, 30], trim: [158, 164, 174], cord: [96, 66, 44], wrap: main, sole: [62, 62, 66], metal: [172, 176, 184], fur: [84, 68, 54] };
  })(),
  // Hide (Medium): rough, pale grey-tan rawhide, darker hide strips, sinew lacing, bone toggles, dark shaggy fur.
  hide: (() => {
    const main: RGB = [150, 126, 96];
    return { main, shadow: mulC(main, 0.36), trim: [98, 76, 56], cord: [204, 186, 150], wrap: [112, 88, 64], sole: [60, 46, 36], metal: [224, 214, 190], fur: [84, 68, 54] };
  })(),
};

/**
 * Identity of an armor design, all derived from its exact data entry (ARMOR_SERIES[series].names[slot]):
 * label = the entry's display name ('Apprentice Hood'), id = 'armor.' + slug(name), source = the entry.
 * Rarity glow is the renderer's job, never part of the mesh.
 */
export function armorEntry(seriesId: string, slot: ArmorSlot): { id: string; label: string; source: DataRef; palette: ArmorPalette } {
  const series = ARMOR_SERIES.find((s) => s.id === seriesId);
  if (!series) throw new Error(`no armor series '${seriesId}' (data/gear/armor.ts)`);
  const palette = SERIES_PALETTE[seriesId];
  if (!palette) throw new Error(`no SERIES_PALETTE entry for '${seriesId}' (designs/_armor.ts)`);
  const label = armorName(series, slot);
  return { id: `armor.${slug(label)}`, label, source: { table: 'armor', key: `${seriesId}/${slot}` }, palette };
}

// ─── Shape helpers ────────────────────────────────────────────────────────────

/** Horizontal elliptical ring at height y (n points) around (cx, cz), for lofting garment bodies. */
export function ell(y: number, rx: number, rz: number, n = 8, cx = 0, cz = 0): Vec3[] {
  const p: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    p.push([cx + Math.cos(t) * rx, y, cz + Math.sin(t) * rz]);
  }
  return p;
}

/** A thin band (hem, cuff, sash, strap) hugging a lofted body between two ring sizes. */
export function band(m: Mesh, y0: number, y1: number, rx0: number, rz0: number, rx1: number, rz1: number, col: RGB): void {
  loft(m, [ell(y0, rx0, rz0), ell(y1, rx1, rz1)], col, { caps: false });
}

/** Close a ring with a fan of triangles around its center; `inside` is a point inside the body (orients the faces). */
export function fanCap(m: Mesh, ring: Vec3[], col: RGB, inside: Vec3): void {
  const ctr = ring.reduce((s, p) => add(s, p), [0, 0, 0] as Vec3).map((v) => v / ring.length) as Vec3;
  for (let i = 0; i < ring.length; i++) m.tri(ctr, ring[i], ring[(i + 1) % ring.length], col, inside);
}

/** Colors of a glove's parts, by segment index (palm band k, finger segment k, thumb segment k). */
export interface GloveLook {
  palm: (k: number) => RGB;
  finger: (k: number) => RGB;
  thumb: (k: number) => RGB;
}

/**
 * A pair of gloves side by side, backs facing the viewer, both thumbs pointing inward and the fingers
 * fanning slightly outward. Each is a flat hand widening to the knuckles, four full-length fingers
 * (middle longest) and a bent thumb, colored by `look`; `cuff(sx)` adds the wrist end of each glove,
 * built around the wrist at the origin before it is moved into place.
 * Draws c.ri once, then c.rf once per finger: keep that order (approved designs depend on it).
 */
export function glovePair(m: Mesh, c: { ri: (a: number, b: number) => number; rf: (a: number, b: number) => number }, look: GloveLook, cuff: (sx: number) => void): void {
  for (const sx of [-1, 1]) {
    m.part(sx < 0 ? 'right' : 'left');
    const s0 = m.faces.length;
    const top = 0.36; // knuckle line
    const tilt = 0.1 * sx; // knuckles slope down toward the little finger
    const slope = (p: Vec3): Vec3 => [p[0], p[1] + p[0] * tilt, p[2]];

    // Back of the hand: flat and wide, widening from the wrist to the knuckles, in bands
    const bands = c.ri(4, 5);
    for (let k = 0; k < bands; k++) {
      const y0 = (k / bands) * top, y1 = ((k + 1) / bands) * top;
      const w0 = 0.125 + (y0 / top) * 0.03, w1 = 0.125 + (y1 / top) * 0.03;
      loft(m, [ell(y0, w0, 0.055).map(slope), ell(y1, w1, 0.055).map(slope)], look.palm(k), { caps: k === bands - 1 });
    }

    // Fingers: full length, side by side, slightly fanned; index on the thumb's side, middle longest.
    // Three segments each, with a rounded tip.
    [0.27, 0.3, 0.28, 0.22].forEach((len, i) => {
      const x = sx * (0.108 - i * 0.072);
      const base = slope([x, top - 0.02, 0]);
      const l = len * c.rf(0.95, 1.04);
      const at = (t: number): Vec3 => [x * (1 + t * 0.18), base[1] + l * t, 0.004 * t];
      const pts = [at(0), at(0.36), at(0.7), at(1)];
      for (let k = 0; k < 3; k++) frustum(m, pts[k], pts[k + 1], 0.037 - k * 0.002, 0.035 - k * 0.002, 5, look.finger(k), { caps: k === 2 });
    });

    // Thumb: out from the side of the hand, then bending up
    const t0: Vec3 = [sx * 0.11, 0.1, 0.01], t1: Vec3 = [sx * 0.21, 0.2, 0.02], t2: Vec3 = [sx * 0.25, 0.33, 0.025];
    frustum(m, t0, t1, 0.05, 0.044, 5, look.thumb(0), { caps: false });
    frustum(m, t1, t2, 0.044, 0.036, 5, look.thumb(1));

    cuff(sx);
    // Each glove goes on the side opposite its thumb, so both thumbs point inward; fingers fan outward
    m.xf(s0, (p) => add(rotZ(p, sx * 0.1), [-sx * 0.3, 0, 0]));
  }
}

/**
 * A pair of footwear in side profile, toes to the left: `draw()` builds one (sole on y = 0, around the
 * origin); the second copy sits behind it, raised by `back` so both read in the straight-on icon.
 */
export function footwearPair(m: Mesh, back: Vec3, draw: () => void): void {
  const pair: [string, Vec3][] = [['front', [0, 0, 0]], ['back', back]];
  for (const [part, off] of pair) {
    m.part(part);
    const s0 = m.faces.length;
    draw();
    m.xf(s0, (p) => add(p, off));
  }
}

/** Stitched panels: faces alternate between two shades by their angle around the y axis (n panels). */
export const panels = (a: RGB, b: RGB, n: number): ColorFn => (ctr) => {
  const t = (Math.atan2(ctr[2], ctr[0]) + Math.PI * 2) % (Math.PI * 2);
  return Math.floor(t / ((Math.PI * 2) / n)) % 2 ? b : a;
};

/**
 * A low skullcap dome of radius r, its brim at y = 0 and its crown at about 0.47 (front slightly deeper
 * than the sides). `inside` colors the open underside, which faces the camera when the cap lies as loot.
 */
export function capDome(m: Mesh, r: number, col: RGB | ColorFn, crown: RGB, inside: RGB): void {
  const rings = [ell(0, r, r * 1.05), ell(0.17, r * 0.96, r), ell(0.32, r * 0.78, r * 0.82), ell(0.43, r * 0.46, r * 0.48), ell(0.47, r * 0.1, r * 0.1)];
  loft(m, rings, col, { caps: false });
  fanCap(m, rings[rings.length - 1], crown, [0, 0.2, 0]);
  fanCap(m, rings[0], inside, [0, 0.2, 0]);
}

/** Shaggy fur: a lumpy ellipsoid (heavily jittered), for collars, rims and cuff linings. */
export function fur(m: Mesh, c: Vec3, r: Vec3, col: RGB, level = 1): void {
  blob(m, c, r, level, 0.22, col);
}

/** The dark inside of an opening (cuff, boot top): a flat disc. */
export function opening(m: Mesh, c: Vec3, rx: number, rz: number, col: RGB): void {
  blob(m, c, [rx, 0.012, rz], 0, 0, col);
}

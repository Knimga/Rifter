// Carved arcane sigils (the Large Arcane Seal on the floor, the Faded Wall Sigils): worn grooves drawn in a motif's own
// 2D units and laid on a surface (`at`), in the manner of the enchanter's rune circle. Lines break off here and there
// and some pieces are gone, so they read as old.
// Files starting with "_" are NOT registered as designs.
import type { Mesh } from '../core/mesh';
import type { RGB, Vec3 } from '../core/vec';

/** A point of a motif, in its own units. */
export type P = [number, number];

export interface SigilSurface {
  /** A motif point on the surface. Affine (straight lines stay straight), so a groove can be clipped along it. */
  at: (p: P) => Vec3;
  /** How many tiles one motif unit is. */
  scale: number;
  /** A groove's width (tiles). */
  width: number;
  /** Each stroke's color, drawn fresh per stroke (a little lighter or darker from stroke to stroke). */
  shade: () => RGB;
  /** A point behind the surface: the grooves face away from it. */
  behind: Vec3;
  /** Only what lies between these heights (tiles) is drawn: a sigil cut off by the floor or a wall's top. */
  clipY?: [number, number];
}

/** An arc of a ring: its start and length (radians). */
type Arc = [start: number, length: number];

/** Whether angle `a` (radians) falls in one of the arcs. */
const inGaps = (a: number, gaps: Arc[]) =>
  gaps.some(([s, l]) => (((a - s) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) < l);

/** The seeded draws a sigil's wear uses (the build context's). */
interface Rolls {
  rf: (a: number, b: number) => number;
  ri: (a: number, b: number) => number;
  chance: (p: number) => boolean;
}

/** A pen carving worn grooves on `s`: lines, worn lines, rings, dashed rings and filled diamonds. */
export function sigilPen(m: Mesh, c: Rolls, s: SigilSurface) {
  const { rf, ri, chance } = c;
  const { at, scale: S, width: W, shade, behind, clipY } = s;

  /** A straight groove from a to b (motif units), `w` wide; clipped to clipY. */
  const groove = (a: P, b: P, w = W) => {
    if (clipY) {
      const ya = at(a)[1], yb = at(b)[1];
      const [lo, hi] = clipY;
      // The part of the segment between the heights: t0..t1 along it
      let t0 = 0, t1 = 1;
      for (const [y, keepAbove] of [[lo, true], [hi, false]] as const) {
        const da = keepAbove ? ya - y : y - ya, db = keepAbove ? yb - y : y - yb;
        if (da < 0 && db < 0) return;
        if (da < 0) t0 = Math.max(t0, da / (da - db));
        else if (db < 0) t1 = Math.min(t1, da / (da - db));
      }
      if (t1 - t0 < 1e-3) return;
      const lerp = (t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      [a, b] = [lerp(t0), lerp(t1)];
    }
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * (w / 2 / S), ny = (dx / l) * (w / 2 / S);
    m.quad(at([a[0] + nx, a[1] + ny]), at([b[0] + nx, b[1] + ny]), at([b[0] - nx, b[1] - ny]), at([a[0] - nx, a[1] - ny]), shade(), behind, { j: 0.06 });
  };
  /**
   * A worn line through `pts` (motif units): cut into pieces of a few steps, each piece sometimes gone (`gone`), the
   * rest a little short at their ends, so the line breaks off here and there.
   */
  const carve = (pts: P[], gone = 0.14, w = W) => {
    let i = 0;
    while (i < pts.length - 1) {
      const n = ri(2, 5), end = Math.min(pts.length - 1, i + n);
      if (!chance(gone)) for (let k = i; k < end; k++) groove(pts[k], pts[k + 1], w * rf(0.75, 1.1));
      i = end;
    }
  };
  /**
   * `n` whole arcs of a ring worn away, for `ring` and `dashed`: each [start, length] (radians), a sixth to a third
   * of the way round, spread around it.
   */
  const arcGaps = (n: number): Arc[] => {
    const start = rf(0, Math.PI * 2);
    return Array.from({ length: n }, (_, i) => [start + (i / n) * Math.PI * 2 + rf(-0.3, 0.3), rf(Math.PI / 3, (Math.PI * 2) / 3)]);
  };
  /**
   * A ring of radius r around `c` (motif units): `steps` segments, worn; `gaps`, whole arcs of it gone (arcGaps), the
   * rest carved as separate arcs.
   */
  const ring = (r: number, steps: number, gone?: number, w?: number, c: P = [0, 0], gaps?: Arc[]) => {
    const pt = (i: number): P => { const a = (i / steps) * Math.PI * 2; return [c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]; };
    if (!gaps) return carve(Array.from({ length: steps + 1 }, (_, i) => pt(i)), gone, w);
    // Runs of the segments outside every gap, each carved on its own
    let run: P[] = [];
    for (let i = 0; i <= steps; i++) {
      const kept = i < steps && !inGaps(((i + 0.5) / steps) * Math.PI * 2, gaps);
      if (kept) { if (!run.length) run.push(pt(i)); run.push(pt(i + 1)); }
      else if (run.length) { carve(run, gone, w); run = []; }
    }
  };
  /**
   * A dashed ring: `pattern` alternates dash and gap lengths along it (motif units, as an SVG dasharray); `gaps`,
   * whole arcs of it gone (arcGaps).
   */
  const dashed = (r: number, pattern: number[], gone = 0.12, gaps?: Arc[]) => {
    const len = Math.PI * 2 * r;
    for (let s = 0, k = 0; s < len; k++) {
      const d = pattern[k % pattern.length];
      if (k % 2 === 0 && !(gaps && inGaps((s + d / 2) / r, gaps)) && !chance(gone)) {
        const steps = Math.max(1, Math.round(d / 6)), pts: P[] = [];
        for (let j = 0; j <= steps; j++) { const a = ((s + (d * j) / steps) / r); pts.push([Math.cos(a) * r, Math.sin(a) * r]); }
        for (let j = 0; j < pts.length - 1; j++) groove(pts[j], pts[j + 1]);
      }
      s += d;
    }
  };
  /** A small filled diamond centered on c, `r` to its points (left out if any of it is clipped off). */
  const diamond = (c: P, r: number) => {
    const p = [[c[0], c[1] - r], [c[0] + r, c[1]], [c[0], c[1] + r], [c[0] - r, c[1]]].map((q) => at(q as P));
    if (clipY && p.some((q) => q[1] < clipY[0] || q[1] > clipY[1])) return;
    m.quad(p[0], p[1], p[2], p[3], shade(), behind, { j: 0.06 });
  };
  /** A polygon's outline through `corners` (closed), each side in `steps` pieces, worn. */
  const polygon = (corners: P[], steps: number, gone?: number) => {
    const ring = [...corners, corners[0]];
    carve(ring.flatMap((p, i) => (i ? Array.from({ length: steps }, (_, j): P => {
      const q = ring[i - 1], t = (j + 1) / steps;
      return [q[0] + (p[0] - q[0]) * t, q[1] + (p[1] - q[1]) * t];
    }) : [p])), gone);
  };
  /**
   * A ring of `n` rune glyphs at radius `r` around the center, each two or three short strokes (three kinds in turn),
   * `size` times the seal's (8 units tall); some worn away (`gone`).
   */
  const runeRing = (r: number, n: number, size = 1, gone = 0.2) => {
    for (let k = 0; k < n; k++) {
      if (chance(gone)) continue;
      const a = ((k + 0.5) / n) * Math.PI * 2, cx = Math.cos(a) * r, cy = Math.sin(a) * r;
      const up: P = [Math.cos(a), Math.sin(a)], side: P = [-up[1], up[0]];
      const p = (s: number, t: number): P => [cx + (side[0] * s + up[0] * t) * size, cy + (side[1] * s + up[1] * t) * size];
      const glyph = k % 3;
      if (glyph === 0) { groove(p(-3, -4), p(-3, 4)); groove(p(-3, 4), p(3, 0)); }
      else if (glyph === 1) { groove(p(-3, -4), p(3, 4)); groove(p(3, -4), p(-3, 4)); }
      else { groove(p(0, -4), p(0, 4)); groove(p(-3, -1), p(3, -1)); groove(p(-3, 3), p(3, 3)); }
    }
  };
  return { groove, carve, ring, dashed, diamond, polygon, runeRing, arcGaps };
}

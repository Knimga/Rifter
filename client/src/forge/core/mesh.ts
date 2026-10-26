import type { Vec3, RGB } from './vec';
import type { Rng } from './rng';
import type { Halo, MeshData, Tone } from './types';

export type ColorFn = (centroid: Vec3, normal: Vec3) => RGB;
export interface FaceOpts {
  /** 0..1 emissive amount (>= 0.5 is rendered unlit). */
  e?: number;
  /** 0..1 opacity. */
  a?: number;
  /** Per-face brightness jitter amount. Default 0.16. This is what makes it look faceted. */
  j?: number;
  /**
   * A color per corner (for a, b, c as passed), blended across the face instead of one flat color: soft
   * gradients, e.g. a blurred glow. Rare; the faceted look is the default.
   */
  vc?: [RGB, RGB, RGB];
  /**
   * Painted with the tint the model is drawn in (core/tint.ts: a rift or keystone in its dungeon's color): how
   * much of the tint and of its deep shade this face adds to its own color (usually black). One Tone for the
   * face, or one per corner (blended, like vc).
   */
  tint?: Tone | [Tone, Tone, Tone];
  /** A fading part's start color (PartFade: the animation fades the face from this to its own color). */
  from?: RGB;
}
export interface Face {
  v: [Vec3, Vec3, Vec3];
  c: RGB;
  /** Corner colors (same order as v), when the face blends them (FaceOpts.vc). */
  vc?: [RGB, RGB, RGB];
  /** Tint weights per corner (FaceOpts.tint). */
  t?: [Tone, Tone, Tone];
  /** Its fade's start color (FaceOpts.from). */
  f?: RGB;
  e: number;
  a: number;
  j: number;
  part: number;
}

export class Mesh {
  faces: Face[] = [];
  partNames: string[] = ['body'];
  pivots: Record<string, Vec3> = {};
  anchors: Record<string, Vec3> = {};
  /** Halos so far (Mesh.halo); their color in 0..255 until bake. */
  halos: { p: Vec3; r: number; c: RGB; t?: Tone; from?: RGB; part: number }[] = [];
  private cur = 0;

  constructor(readonly R: Rng) {}

  /** All faces added after this call belong to the named part (until the next call). */
  part(name: string, pivot?: Vec3): void {
    let i = this.partNames.indexOf(name);
    if (i < 0) {
      i = this.partNames.length;
      this.partNames.push(name);
    }
    this.cur = i;
    if (pivot) this.pivots[name] = pivot;
  }

  /** The index of part `name` (adding it if new), without making it the current part. */
  partIndex(name: string): number {
    let i = this.partNames.indexOf(name);
    if (i < 0) {
      i = this.partNames.length;
      this.partNames.push(name);
    }
    return i;
  }

  anchor(name: string, p: Vec3): void {
    this.anchors[name] = p;
  }

  /**
   * A soft glow of color `c` around `p`, out to radius `r` (a halo: see Halo), moving with the current part. Put it
   * on the model's own lights (eyes, cores, spores), usually over an emissive face. Placed where given: `xf`
   * doesn't move it (`xfAll` does), so give it its final position.
   */
  halo(p: Vec3, r: number, c: RGB, tint?: Tone, from?: RGB): void {
    this.halos.push({ p: [p[0], p[1], p[2]], r, c, ...(tint && { t: tint }), ...(from && { from }), part: this.cur });
  }

  /**
   * Add one triangle. The winding is fixed so the normal points AWAY from `ctr`
   * (the center of the convex piece this triangle belongs to). That is why every
   * primitive must be roughly convex, and why callers never think about winding.
   */
  tri(a: Vec3, b: Vec3, c: Vec3, col: RGB | ColorFn, ctr: Vec3, o: FaceOpts = {}): void {
    // The hot path of every build: plain arithmetic (same operations, same order as cross/sub/dot), no temporaries
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    if (l < 1e-7) return; // degenerate (collapsed tip rings etc.)
    const mx = (a[0] + b[0] + c[0]) / 3, my = (a[1] + b[1] + c[1]) / 3, mz = (a[2] + b[2] + c[2]) / 3;
    let vc = o.vc;
    let tones: [Tone, Tone, Tone] | undefined = o.tint ? (typeof o.tint[0] === 'number' ? [o.tint as Tone, o.tint as Tone, o.tint as Tone] : (o.tint as [Tone, Tone, Tone])) : undefined;
    if (nx * (mx - ctr[0]) + ny * (my - ctr[1]) + nz * (mz - ctr[2]) < 0) {
      const t = b;
      b = c;
      c = t;
      nx = -nx; ny = -ny; nz = -nz;
      if (vc) vc = [vc[0], vc[2], vc[1]]; // corner colors follow their corners
      if (tones) tones = [tones[0], tones[2], tones[1]];
    }
    const color = typeof col === 'function' ? col([mx, my, mz], [nx * (1 / l), ny * (1 / l), nz * (1 / l)]) : col;
    this.faces.push({
      v: [[a[0], a[1], a[2]], [b[0], b[1], b[2]], [c[0], c[1], c[2]]],
      c: color,
      vc,
      t: tones,
      f: o.from,
      e: o.e ?? 0,
      a: o.a ?? 1,
      j: 1 + (this.R() - 0.5) * (o.j ?? 0.16),
      part: this.cur,
    });
  }

  quad(a: Vec3, b: Vec3, c: Vec3, d: Vec3, col: RGB | ColorFn, ctr: Vec3, o: FaceOpts = {}): void {
    this.tri(a, b, c, col, ctr, o);
    this.tri(a, c, d, col, ctr, o);
  }

  /** Transform faces added since index `from`. Use to rotate/position a locally built piece. */
  xf(from: number, fn: (p: Vec3) => Vec3): void {
    for (let i = from; i < this.faces.length; i++) {
      const f = this.faces[i];
      f.v = [fn(f.v[0]), fn(f.v[1]), fn(f.v[2])];
    }
  }

  /** Transform everything, including anchors, pivots and halos (`scale`: how much `fn` scales, for halo radii). */
  xfAll(fn: (p: Vec3) => Vec3, scale = 1): void {
    this.xf(0, fn);
    for (const k of Object.keys(this.anchors)) this.anchors[k] = fn(this.anchors[k]);
    for (const k of Object.keys(this.pivots)) this.pivots[k] = fn(this.pivots[k]);
    for (const h of this.halos) { h.p = fn(h.p); h.r *= scale; }
  }

  bounds(): { min: Vec3; max: Vec3 } {
    const min: Vec3 = [Infinity, Infinity, Infinity];
    const max: Vec3 = [-Infinity, -Infinity, -Infinity];
    for (const f of this.faces)
      for (const p of f.v)
        for (let i = 0; i < 3; i++) {
          if (p[i] < min[i]) min[i] = p[i];
          if (p[i] > max[i]) max[i] = p[i];
        }
    return { min, max };
  }
}

export function bake(m: Mesh): MeshData {
  const n = m.faces.length;
  const positions = new Float32Array(n * 9);
  const colors = new Float32Array(n * 9);
  const emissive = new Float32Array(n);
  const alpha = new Float32Array(n);
  const part = new Uint8Array(n);
  // Tint weights (bright, deep) per corner, with the face's jitter, like its color: only if a face is tinted
  const tint = m.faces.some((f) => f.t) ? new Float32Array(n * 6) : undefined;
  // Fade start colors (FaceOpts.from): only if a face fades; the others start at their own color
  const fromColors = m.faces.some((f) => f.f) ? new Float32Array(n * 9) : undefined;
  m.faces.forEach((f, i) => {
    if (fromColors)
      for (let v = 0; v < 3; v++)
        for (let k = 0; k < 3; k++) fromColors[i * 9 + v * 3 + k] = Math.max(0, Math.min(1, ((f.f ?? (f.vc ? f.vc[v] : f.c))[k] / 255) * f.j));
    if (tint && f.t) for (let v = 0; v < 3; v++) { tint[i * 6 + v * 2] = f.t[v][0] * f.j; tint[i * 6 + v * 2 + 1] = f.t[v][1] * f.j; }
    for (let v = 0; v < 3; v++) {
      for (let k = 0; k < 3; k++) {
        positions[i * 9 + v * 3 + k] = f.v[v][k];
        colors[i * 9 + v * 3 + k] = Math.max(0, Math.min(1, ((f.vc ? f.vc[v] : f.c)[k] / 255) * f.j));
      }
    }
    emissive[i] = f.e;
    alpha[i] = f.a;
    part[i] = f.part;
  });
  return {
    triCount: n,
    positions,
    colors,
    emissive,
    alpha,
    part,
    ...(tint && { tint }),
    ...(fromColors && { fromColors }),
    partNames: [...m.partNames],
    pivots: { ...m.pivots },
    anchors: { ...m.anchors },
    halos: m.halos.map((h): Halo => ({
      p: h.p, r: h.r, c: [h.c[0] / 255, h.c[1] / 255, h.c[2] / 255], ...(h.t && { t: h.t }),
      ...(h.from && { from: [h.from[0] / 255, h.from[1] / 255, h.from[2] / 255] as [number, number, number] }), part: h.part,
    })),
    bounds: m.bounds(),
  };
}

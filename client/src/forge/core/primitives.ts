import type { Mesh, ColorFn, FaceOpts } from './mesh';
import { type Vec3, type RGB, add, sub, mul, cross, norm } from './vec';

type Col = RGB | ColorFn;
export interface PrimOpts extends FaceOpts {
  /** loft/frustum: add end caps (default true). */
  caps?: boolean;
}

function basis(u: Vec3): [Vec3, Vec3] {
  const t: Vec3 = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const e1 = norm(cross(u, t));
  return [e1, cross(u, e1)];
}

export function ringPts(c: Vec3, u: Vec3, r: number, n: number): Vec3[] {
  const [e1, e2] = basis(u);
  const p: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    p.push(add(c, add(mul(e1, Math.cos(t) * r), mul(e2, Math.sin(t) * r))));
  }
  return p;
}

/** Connect a stack of equal-length rings with quads, and cap both ends. Basis of blades, hafts, limbs. */
export function loft(m: Mesh, rings: Vec3[][], col: Col, o: PrimOpts = {}): void {
  const n = rings[0].length;
  const all = rings.flat();
  const ctr: Vec3 = [0, 1, 2].map((i) => all.reduce((s, p) => s + p[i], 0) / all.length) as Vec3;
  for (let k = 0; k < rings.length - 1; k++)
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      m.quad(rings[k][i], rings[k][j], rings[k + 1][j], rings[k + 1][i], col, ctr, o);
    }
  if (o.caps !== false)
    for (const r of [rings[0], rings[rings.length - 1]]) {
      const c = mul(
        r.reduce((s, p) => add(s, p), [0, 0, 0] as Vec3),
        1 / n,
      );
      for (let i = 0; i < n; i++) m.tri(c, r[i], r[(i + 1) % n], col, ctr, o);
    }
}

/** Tapered prism between two points. */
export function frustum(m: Mesh, p0: Vec3, p1: Vec3, r0: number, r1: number, n: number, col: Col, o: PrimOpts = {}): void {
  const u = norm(sub(p1, p0));
  loft(m, [ringPts(p0, u, r0, n), ringPts(p1, u, r1, n)], col, o);
}

/** Axis-aligned box with optional corner jitter (jit = fraction of size). */
export function box(m: Mesh, c: Vec3, s: Vec3, col: Col, jit = 0, o: FaceOpts = {}): void {
  const P: Vec3[] = [];
  for (let i = 0; i < 8; i++)
    P.push([
      c[0] + (i & 1 ? 0.5 : -0.5) * s[0] + (m.R() - 0.5) * jit * s[0],
      c[1] + (i & 2 ? 0.5 : -0.5) * s[1] + (m.R() - 0.5) * jit * s[1],
      c[2] + (i & 4 ? 0.5 : -0.5) * s[2] + (m.R() - 0.5) * jit * s[2],
    ]);
  for (const q of [[0, 2, 6, 4], [1, 3, 7, 5], [0, 1, 5, 4], [2, 3, 7, 6], [0, 1, 3, 2], [4, 5, 7, 6]])
    m.quad(P[q[0]], P[q[1]], P[q[2]], P[q[3]], col, c, o);
}

const ICO: Record<number, { V: Vec3[]; F: number[][] }> = {};
function ico(level: number): { V: Vec3[]; F: number[][] } {
  if (ICO[level]) return ICO[level];
  const t = (1 + Math.sqrt(5)) / 2;
  const V: Vec3[] = (
    [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]] as Vec3[]
  ).map(norm);
  let F: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  for (let s = 0; s < level; s++) {
    const cache: Record<string, number> = {};
    const NF: number[][] = [];
    const mid = (a: number, b: number): number => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      if (cache[k] != null) return cache[k];
      V.push(norm(mul(add(V[a], V[b]), 0.5)));
      return (cache[k] = V.length - 1);
    };
    for (const [a, b, c] of F) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      NF.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    F = NF;
  }
  return (ICO[level] = { V, F });
}

/**
 * A lumpy ellipsoid (like `blob`) with glowing patches of molten rock: `share` (0..1) of its faces are emissive
 * `lava`, the rest `col`. The lava grows as a few connected patches (from random seed faces, spreading to
 * neighbouring faces), so it reads as magma showing between rock plates rather than scattered spots, and the
 * share is exact for every seed. `vein`: the patches' face options (default: glowing lava; e.g. `{ j: 0.18 }`
 * for unlit moss).
 */
export function crackedBlob(m: Mesh, c: Vec3, r: Vec3, level: number, jit: number, col: Col, lava: Col, share: number, o: FaceOpts = {}, vein: FaceOpts = { e: 0.85, j: 0.1 }): void {
  const { V, F } = ico(level);
  const P = V.map((v): Vec3 => {
    const k = 1 + (m.R() - 0.5) * 2 * jit;
    return [c[0] + v[0] * r[0] * k, c[1] + v[1] * r[1] * k, c[2] + v[2] * r[2] * k];
  });
  // Faces sharing an edge are neighbours
  const byEdge = new Map<string, number[]>();
  F.forEach((f, i) => {
    for (let e = 0; e < 3; e++) {
      const a = f[e], b = f[(e + 1) % 3], k = a < b ? `${a}_${b}` : `${b}_${a}`;
      byEdge.set(k, [...(byEdge.get(k) ?? []), i]);
    }
  });
  const nbrs: number[][] = F.map(() => []);
  for (const fs of byEdge.values()) if (fs.length === 2) { nbrs[fs[0]].push(fs[1]); nbrs[fs[1]].push(fs[0]); }

  // Grow patches round-robin from random seed faces (about six faces a patch) until the share is reached
  const lavaCount = Math.round(F.length * Math.max(0, Math.min(1, share)));
  const isLava = new Set<number>();
  const fronts: number[][] = [];
  for (let p = 0; p < Math.max(1, Math.round(lavaCount / 6)) && isLava.size < lavaCount; p++) {
    let seed = Math.floor(m.R() * F.length);
    while (isLava.has(seed)) seed = (seed + 1) % F.length;
    isLava.add(seed);
    fronts.push([seed]);
  }
  while (isLava.size < lavaCount) {
    let grew = false;
    for (const front of fronts) {
      if (isLava.size >= lavaCount) break;
      const open = front.flatMap((f) => nbrs[f]).filter((f) => !isLava.has(f));
      if (open.length === 0) continue;
      const next = open[Math.floor(m.R() * open.length)];
      isLava.add(next);
      front.push(next);
      grew = true;
    }
    if (!grew) break;
  }
  F.forEach(([a, b, d], i) =>
    isLava.has(i) ? m.tri(P[a], P[b], P[d], lava, c, { ...o, ...vein }) : m.tri(P[a], P[b], P[d], col, c, o));
}

/** Low-poly ellipsoid. level 0 = 20 tris, level 1 = 80. jit jitters every vertex radially (shared vertices, so no cracks). */
export function blob(m: Mesh, c: Vec3, r: Vec3, level: number, jit: number, col: Col, o: FaceOpts & { floorY?: number } = {}): void {
  const { V, F } = ico(level);
  const P = V.map((v): Vec3 => {
    const k = 1 + (m.R() - 0.5) * 2 * jit;
    const p: Vec3 = [c[0] + v[0] * r[0] * k, c[1] + v[1] * r[1] * k, c[2] + v[2] * r[2] * k];
    if (o.floorY != null) p[1] = Math.max(p[1], o.floorY);
    return p;
  });
  for (const f of F) m.tri(P[f[0]], P[f[1]], P[f[2]], col, c, o);
}

/** Double-pointed crystal around the y axis. */
export function bipyr(m: Mesh, c: Vec3, r: number, h: number, n: number, col: Col, o: FaceOpts = {}): void {
  const top: Vec3 = [c[0], c[1] + h, c[2]];
  const bot: Vec3 = [c[0], c[1] - h * 0.8, c[2]];
  const ring: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const t = (i / n) * 2 * Math.PI;
    const k = 1 + (m.R() - 0.5) * 0.25;
    ring.push([c[0] + Math.cos(t) * r * k, c[1], c[2] + Math.sin(t) * r * k]);
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    m.tri(top, ring[i], ring[j], col, c, o);
    m.tri(bot, ring[j], ring[i], col, c, o);
  }
}

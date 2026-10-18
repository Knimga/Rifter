import type { Vec3, RGB } from './vec';
import type { Rng } from './rng';
import type { MeshData } from './types';

export type ColorFn = (centroid: Vec3, normal: Vec3) => RGB;
export interface FaceOpts {
  /** 0..1 emissive amount (>= 0.5 is rendered unlit). */
  e?: number;
  /** 0..1 opacity. */
  a?: number;
  /** Per-face brightness jitter amount. Default 0.16. This is what makes it look faceted. */
  j?: number;
}
export interface Face {
  v: [Vec3, Vec3, Vec3];
  c: RGB;
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

  anchor(name: string, p: Vec3): void {
    this.anchors[name] = p;
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
    if (nx * (mx - ctr[0]) + ny * (my - ctr[1]) + nz * (mz - ctr[2]) < 0) {
      const t = b;
      b = c;
      c = t;
      nx = -nx; ny = -ny; nz = -nz;
    }
    const color = typeof col === 'function' ? col([mx, my, mz], [nx * (1 / l), ny * (1 / l), nz * (1 / l)]) : col;
    this.faces.push({
      v: [[a[0], a[1], a[2]], [b[0], b[1], b[2]], [c[0], c[1], c[2]]],
      c: color,
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

  /** Transform everything, including anchors and pivots. */
  xfAll(fn: (p: Vec3) => Vec3): void {
    this.xf(0, fn);
    for (const k of Object.keys(this.anchors)) this.anchors[k] = fn(this.anchors[k]);
    for (const k of Object.keys(this.pivots)) this.pivots[k] = fn(this.pivots[k]);
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
  m.faces.forEach((f, i) => {
    for (let v = 0; v < 3; v++) {
      for (let k = 0; k < 3; k++) {
        positions[i * 9 + v * 3 + k] = f.v[v][k];
        colors[i * 9 + v * 3 + k] = Math.max(0, Math.min(1, (f.c[k] / 255) * f.j));
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
    partNames: [...m.partNames],
    pivots: { ...m.pivots },
    anchors: { ...m.anchors },
    bounds: m.bounds(),
  };
}

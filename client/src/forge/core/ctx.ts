import { mulberry32, type Rng } from './rng';
import { Mesh } from './mesh';
import type { ParamDef, Params } from './types';

/**
 * Handed to Design.build(). Owns the RNG, the mesh being built, and the parameter system.
 *
 * PARAMETER RULES (these keep shapes stable when a parameter is pinned):
 *  1. Call choice/range/int/chance at the TOP of build(), unconditionally, in a fixed order.
 *     Each call always consumes exactly one random number, even when the caller pinned a value.
 *  2. Use ri/rf/pick for incidental detail (sizes, jitter). Those are never pinned.
 *  3. Never call a parameter helper inside an `if`, or the random stream shifts between seeds.
 */
export class BuildCtx {
  readonly R: Rng;
  readonly mesh: Mesh;
  /** Discovered automatically from the helper calls; powers the builder page's controls. */
  readonly schema: Record<string, ParamDef> = {};
  /** Final value of every parameter. */
  readonly resolved: Params = {};

  constructor(
    readonly seed: number,
    private overrides: Params = {},
  ) {
    this.R = mulberry32(seed);
    this.mesh = new Mesh(this.R);
  }

  readonly ri = (a: number, b: number): number => a + Math.floor(this.R() * (b - a + 1));
  readonly rf = (a: number, b: number): number => a + this.R() * (b - a);
  readonly pick = <T>(arr: readonly T[]): T => arr[Math.floor(this.R() * arr.length)];

  choice<T extends string>(key: string, options: readonly T[], weights?: readonly number[]): T {
    this.schema[key] = { type: 'choice', options };
    const r = this.R();
    let idx = Math.min(options.length - 1, Math.floor(r * options.length));
    if (weights) {
      const tot = weights.reduce((s, w) => s + w, 0);
      let acc = 0;
      idx = weights.length - 1;
      for (let i = 0; i < weights.length; i++) {
        acc += weights[i] / tot;
        if (r < acc) {
          idx = i;
          break;
        }
      }
    }
    let v: T = options[idx];
    const o = this.overrides[key];
    if (typeof o === 'string' && (options as readonly string[]).includes(o)) v = o as T;
    this.resolved[key] = v;
    return v;
  }

  range(key: string, min: number, max: number): number {
    this.schema[key] = { type: 'number', min, max };
    let v = min + this.R() * (max - min);
    const o = this.overrides[key];
    if (typeof o === 'number' && Number.isFinite(o)) v = Math.max(min, Math.min(max, o));
    this.resolved[key] = v;
    return v;
  }

  int(key: string, min: number, max: number): number {
    this.schema[key] = { type: 'number', min, max, int: true };
    let v = min + Math.floor(this.R() * (max - min + 1));
    const o = this.overrides[key];
    if (typeof o === 'number' && Number.isFinite(o)) v = Math.max(min, Math.min(max, Math.round(o)));
    this.resolved[key] = v;
    return v;
  }

  chance(key: string, p: number): boolean {
    this.schema[key] = { type: 'bool' };
    let v = this.R() < p;
    const o = this.overrides[key];
    if (typeof o === 'boolean') v = o;
    this.resolved[key] = v;
    return v;
  }
}

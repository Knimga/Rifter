import { mulberry32, type Rng } from './rng';
import { Mesh } from './mesh';

/** Handed to Design.build(). Owns the RNG and the mesh being built. */
export class BuildCtx {
  readonly R: Rng;
  readonly mesh: Mesh;

  constructor(
    readonly seed: number,
    /**
     * Build input other than the seed: for character designs, how the arms hold the equipped weapon
     * (a Hold; see designs/_character.ts). Undefined = the design's default.
     */
    readonly hold?: string,
  ) {
    this.R = mulberry32(seed);
    this.mesh = new Mesh(this.R);
  }

  readonly ri = (a: number, b: number): number => a + Math.floor(this.R() * (b - a + 1));
  readonly rf = (a: number, b: number): number => a + this.R() * (b - a);
  readonly pick = <T>(arr: readonly T[]): T => arr[Math.floor(this.R() * arr.length)];
  /** True with probability p. */
  readonly chance = (p: number): boolean => this.R() < p;
}

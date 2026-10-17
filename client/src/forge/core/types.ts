import type { Vec3 } from './vec';
import type { BuildCtx } from './ctx';

export type ParamDef =
  | { type: 'choice'; options: readonly string[] }
  | { type: 'number'; min: number; max: number; int?: boolean }
  | { type: 'bool' };

/** Overrides a caller can pin. Anything not pinned is drawn from the seed. */
export type Params = Record<string, string | number | boolean>;

export type Category = 'creature' | 'character' | 'weapon' | 'armor' | 'offhand' | 'prop';

/**
 * How a finished mesh is scaled and positioned. Units are TILES (1 unit = 1 grid cell).
 * standing: origin at the feet center, y up, scaled so height <= height and footprint radius <= maxRadius.
 * item:     origin at the bbox center, scaled so the longest dimension == size.
 *           groundPitchDeg: how far it tips back when lying on the floor as loot (default -90 = flat,
 *           face up; see ITEM_GROUND_PITCH). Less tipped (e.g. -55) hides an open underside like a helm's.
 */
export type FitSpec =
  | { kind: 'standing'; height: number; maxRadius: number }
  | { kind: 'item'; size: number; groundPitchDeg?: number };

/**
 * The one game data entry a design is the model for. `key` identifies the entry within its table:
 *  - enemies: the class id ('skeleton')
 *  - weapons: `${seriesId}/${weaponType}` ('plain/1h Swords')
 *  - armor: `${seriesId}/${slot}` ('apprentice/helm')
 *  - offhands: the offhand's id ('buckler')
 * Lint checks that the entry exists, that the design's label is exactly the entry's display name, and
 * that the file name is that name slugged (see src/forge/dataRefs.ts).
 */
export interface DataRef {
  table: 'enemies' | 'weapons' | 'armor' | 'offhands';
  key: string;
}

export interface Design {
  /** `${category}.${fileStem}`, e.g. 'creature.skeleton'. Lint enforces the match. */
  id: string;
  category: Category;
  /** Exactly the display name of the data entry in `source` (lint-enforced). */
  label: string;
  /** The game data entry this design is the model for. */
  source: DataRef;
  /** Bump when a change alters the look of existing seeds. */
  version: number;
  fit: FitSpec;
  /** Max triangles after build. Lint enforces it. */
  budget: number;
  /** Draw into c.mesh. Return the display name. */
  build(c: BuildCtx): string;
}

/** Renderer-agnostic, non-indexed triangle data. Nothing in here depends on three.js. */
export interface MeshData {
  triCount: number;
  /** 9 floats per triangle. Winding is counter-clockwise seen from outside. */
  positions: Float32Array;
  /** 9 floats per triangle, sRGB 0..1, flat per face, face-jitter already baked in. */
  colors: Float32Array;
  /** 1 float per triangle: 0 = lit, 1 = fully emissive (unlit glow). */
  emissive: Float32Array;
  /** 1 float per triangle: 1 = opaque. */
  alpha: Float32Array;
  /** 1 byte per triangle: index into partNames. */
  part: Uint8Array;
  partNames: string[];
  /** Part name -> pivot point (for future animation). */
  pivots: Record<string, Vec3>;
  /** Named attach points: feet, overhead, hand_l, hand_r, grip, tip... */
  anchors: Record<string, Vec3>;
  bounds: { min: Vec3; max: Vec3 };
}

/**
 * Link from a game data entry (an enemy class, later item bases) to its approved forge model.
 * Plain data, no three.js.
 * - `params`: the FIXED params; every instance gets these. Params not listed vary per instance.
 * - `seed`: omit it so each instance seeds from its own id (see instanceSeed), which is what makes the
 *   unfixed params vary between enemies. Set it only to make every instance identical.
 * - `version`: the design version the link was made against; the forge flags links whose design has moved on.
 */
export interface ModelLink {
  design: string;
  version: number;
  params: Params;
  seed?: number;
}

export interface Model {
  designId: string;
  version: number;
  seed: number;
  name: string;
  /** Final value of every parameter, whether drawn from the seed or pinned. */
  params: Params;
  mesh: MeshData;
  /** Items only: the pitch (radians, about x) it lies at on the floor as loot. */
  groundPitch?: number;
}

import type { Vec3 } from './vec';
import type { BuildCtx } from './ctx';

export type Category = 'creature' | 'character' | 'weapon' | 'armor' | 'offhand' | 'object';

/**
 * A part that keeps moving while the model is on screen (view state, like facing): it spins about `axis`
 * (model space, through the part's pivot) at `turnsPerSec`. `frame` squashes the spin: the part is built
 * as if round, then scaled by `frame` (e.g. a circle scaled to an oval); the spin happens in the round
 * frame, so an oval part turns its pattern while keeping its oval outline. Models without motion are static.
 */
export interface PartSpin {
  part: string;
  axis: 'x' | 'y' | 'z';
  turnsPerSec: number;
  frame?: Vec3;
}

/** One part's move in an animation: it turns `angleDeg` about `axis` (model space, through the part's pivot). */
export interface PartTurn {
  part: string;
  axis: 'x' | 'y' | 'z';
  angleDeg: number;
}

/**
 * A one-time animation (e.g. a chest's lid swinging open): from the rest pose, each listed part turns over
 * `ms` (eased), then holds its end pose. The game plays one when its object's state calls for it (view
 * state, like facing) and shows it already played on an object that appears in that state; the forge plays
 * each one on demand. Unlike PartSpin, it never repeats.
 */
export interface PartAnimation {
  /** Short name, shown in the forge and used by the game to ask for it: 'open'. */
  name: string;
  ms: number;
  turns: PartTurn[];
}

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
 *  - classes: the class key ('knight'); the player character's body (it holds its gear, see equip.ts)
 *  - gameObjects: the object's id ('heavy-door'): interactable things on the map (data/gameObjects.ts)
 * Lint checks that the entry exists, that the design's label is exactly the entry's display name, and
 * that the file name is that name slugged (see src/forge/dataRefs.ts).
 */
export interface DataRef {
  table: 'enemies' | 'weapons' | 'armor' | 'offhands' | 'classes' | 'gameObjects';
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
  fit: FitSpec;
  /** Max triangles after build. Lint enforces it. */
  budget: number;
  /** Parts that keep moving on screen (see PartSpin). */
  motion?: PartSpin[];
  /** One-time animations of its parts, by name (see PartAnimation). */
  animations?: PartAnimation[];
  /** Draw into c.mesh. Return the display name. */
  build(c: BuildCtx): string;
}

/** Renderer-agnostic, non-indexed triangle data. Nothing in here depends on three.js. */
export interface MeshData {
  triCount: number;
  /** 9 floats per triangle. Winding is counter-clockwise seen from outside. */
  positions: Float32Array;
  /** 9 floats per triangle (one color per corner), sRGB 0..1, face-jitter already baked in. Usually the same for all three corners (flat); differ only where a design blends corner colors (FaceOpts.vc). */
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
 * A game data entry's model: the id of its design (e.g. 'weapon.plain-gladius'). Every enemy class,
 * item base and class has one. How each instance is seeded: see instanceSeed in core/link.ts.
 */
export type ModelLink = string;

export interface Model {
  designId: string;
  seed: number;
  name: string;
  mesh: MeshData;
  /** Items only: the pitch (radians, about x) it lies at on the floor as loot. */
  groundPitch?: number;
  /** The design's moving parts (PartSpin), if any: renderers animate them. */
  motion?: PartSpin[];
  /** The design's one-time animations (PartAnimation), if any. */
  animations?: PartAnimation[];
}

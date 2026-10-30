import type { Vec3 } from './vec';
import type { BuildCtx } from './ctx';

export type Category = 'creature' | 'summon' | 'character' | 'weapon' | 'armor' | 'offhand' | 'jewelry' | 'interactive' | 'decor' | 'loot' | 'rift' | 'npc';

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
 * One part's growth in an animation: it scales up from nothing to its full size about its pivot, or (`shrink`)
 * down from its full size to nothing.
 */
export interface PartGrow {
  part: string;
  /**
   * 'out' (growing's default): fast, then settling, like something bursting open; 'in' (shrinking's default):
   * slow, then faster, like something collapsing; 'inOut': eased at both ends.
   */
  ease?: 'out' | 'in' | 'inOut';
  shrink?: boolean;
}

/**
 * One part's glow fading in an animation: its faces go from their `from` colors (FaceOpts.from) to their own,
 * its halos from theirs (Mesh.halo's `from`) to theirs. Faces and halos without a `from` don't change.
 */
export interface PartFade {
  part: string;
}

/**
 * A one-time animation (e.g. a chest's lid swinging open, the Rifter waking): from the rest pose, over `ms`
 * (eased), each listed part turns, grows or fades, then holds its end pose. The game plays one when its
 * object's state calls for it (view state, like facing) and shows it already played on an object that
 * appears in that state; the forge plays each one on demand. Unlike PartSpin, it never repeats.
 */
export interface PartAnimation {
  /** Short name, shown in the forge and used by the game to ask for it: 'open'. */
  name: string;
  ms: number;
  turns?: PartTurn[];
  grows?: PartGrow[];
  fades?: PartFade[];
}

/**
 * How a finished mesh is scaled and positioned. Units are TILES (1 unit = 1 grid cell).
 * standing: origin at the feet center, y up, scaled so height <= height and footprint radius <= maxRadius.
 *           floor: 'lowest' (default) sets its lowest point on the floor; 'origin' keeps its own y = 0 as the
 *           floor (it floats: nothing need touch y = 0), and its height counts from there.
 * item:     origin at the bbox center, scaled so the longest dimension == size.
 *           groundRollDeg: as loot, first turned this far about its front axis (z), e.g. 90 to rest on its
 *           side (default 0); then
 *           groundPitchDeg: how far it tips back when lying on the floor as loot (default -90 = flat,
 *           face up; see ITEM_GROUND_PITCH). Less tipped (e.g. -55) hides an open underside like a helm's.
 */
export type FitSpec =
  | { kind: 'standing'; height: number; maxRadius: number; floor?: 'lowest' | 'origin' }
  | { kind: 'item'; size: number; groundPitchDeg?: number; groundRollDeg?: number };

/**
 * The one game data entry a design is the model for. `key` identifies the entry within its table:
 *  - enemies: the class id ('skeleton')
 *  - summons: the summoned creature's id ('void-wisp', data/units/summons.ts); category `summon`
 *  - weapons: `${seriesId}/${weaponType}` ('plain/1h Swords')
 *  - armor: `${seriesId}/${slot}` ('apprentice/helm')
 *  - offhands: the offhand's id ('buckler')
 *  - jewelry: the ring's or amulet's id (data/gear/jewelry.ts); category `jewelry` ("Rings & Amulets"), items
 *  - classes: the class key ('knight'); the player character's body (it holds its gear, see equip.ts)
 *  - interactiveObjects: the object's id ('heavy-door'): interactable things on the map (data/world/interactiveObjects.ts); category `interactive` ("Interactive Objects")
 *  - decorObjects: the object's id: static things that fill a tile, never used (data/world/decorObjects.ts); category `decor` ("Decorative Objects")
 *  - loot: the loot's id ('gold'): things on the floor the party picks up that aren't items (data/gear/loot.ts); category `loot` ("Loot")
 *  - rifts: 'rift' or 'keystone' (data/world/rifts.ts): category `rift` ("Rifts & Keys"), tinted models (core/tint.ts)
 *  - npcs: the NPC's id ('denisel', data/world/npcs.ts): category `npc` ("NPCs"), people standing on the map
 * Lint checks that the entry exists, that the design's label is exactly the entry's display name, and
 * that the file name is that name slugged (see src/forge/dataRefs.ts).
 */
export interface DataRef {
  table: 'enemies' | 'summons' | 'weapons' | 'armor' | 'offhands' | 'jewelry' | 'classes' | 'interactiveObjects' | 'decorObjects' | 'loot' | 'rifts' | 'npcs';
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

/**
 * How much a tinted face, corner or halo takes of the tint it is drawn in (core/tint.ts): [bright, deep], the
 * tint itself and its deep shade (tintDeep), added to its own color. [1, 0] is the tint, [0, 1] its deep shade.
 */
export type Tone = [number, number];

/**
 * A soft glow around a point of light the model carries (an eye, a spore, a gem): drawn by the renderer as a
 * round additive halo facing the camera, fading from its center to `r`, hidden by whatever is in front of it.
 */
export interface Halo {
  /** Its center (model space). */
  p: Vec3;
  /** Its radius (model units). */
  r: number;
  /** Its color, sRGB 0..1. */
  c: [number, number, number];
  /** Painted with the model's tint too (Tone), added to `c` (core/tint.ts). */
  t?: Tone;
  /** Where a fading part (PartFade) starts this halo's color, sRGB 0..1 (none: it doesn't fade). */
  from?: [number, number, number];
  /** Index into partNames: the part it moves with. */
  part: number;
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
  /**
   * Tinted models only (Rifts & Keys): 6 floats per triangle, (bright, deep) tint weights per corner, face-jitter
   * baked in. The color drawn is colors + the weights times the tint (tintModel, core/tint.ts).
   */
  tint?: Float32Array;
  /**
   * Models with fading parts only (PartFade): 9 floats per triangle, each corner's color where the fade starts
   * (FaceOpts.from; the same as `colors` on faces without one), face-jitter baked in.
   */
  fromColors?: Float32Array;
  /** 1 byte per triangle: index into partNames. */
  part: Uint8Array;
  partNames: string[];
  /** Part name -> pivot point (for future animation). */
  pivots: Record<string, Vec3>;
  /** Named attach points: feet, overhead, hand_l, hand_r, grip, tip... */
  anchors: Record<string, Vec3>;
  /** Soft glows around its lights (Mesh.halo). Not part of the bounds. */
  halos: Halo[];
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
  /** Items only: the roll (radians, about z, before the pitch) it lies at on the floor as loot. */
  groundRoll?: number;
  /** The design's moving parts (PartSpin), if any: renderers animate them. */
  motion?: PartSpin[];
  /** The design's one-time animations (PartAnimation), if any. */
  animations?: PartAnimation[];
}

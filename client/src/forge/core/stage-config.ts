import type { Vec3 } from './vec';

/**
 * ONE source of truth for how models are viewed. The game, the builder page and the
 * contact-sheet CLI all read this, so a design that looks right in one looks right in all.
 * Tune values by eye in the builder page, then leave them alone.
 */

/**
 * Game view: OBLIQUE projection. The camera looks down from `elevationDeg`, but the view is
 * stretched vertically by 1/sin(elevation) so the ground plane maps 1:1 onto the DOM tile grid
 * (1 tile = TILE_SIZE px on both axes). A point at height y draws y·cot(elevation) tiles above
 * its footprint. See docs/forge-inventory.md "Projection".
 */
export const GAME_CAMERA = {
  /** Degrees above the ground plane. 90 = straight down. */
  elevationDeg: 60,
};

/**
 * Inventory icon camera: straight-on (no elevation, no yaw), so an item's face is never tilted toward
 * or away from the viewer. Items are built facing +z, so this shows their true outline.
 */
export const ICON_CAMERA = { elevationDeg: 0, yawRad: 0, fovDeg: 28 };

/**
 * Items on the map (loot) lie FLAT on their tile, face up: rotate the model -90° about X (its +z face
 * turns up, its +y "tip" points up the screen), then lift it so it rests on the floor. The oblique game
 * projection draws the ground plane without distortion, so a flat item shows its true outline,
 * not tilted toward or away from the camera. Used by the game renderer, the forge game view and forge:sheet.
 * A design can lie less tipped (fit.groundPitchDeg), e.g. a helm, so its open underside isn't on show.
 */
export const ITEM_GROUND_PITCH = -Math.PI / 2;

/** The pitch an item design lies at on the floor: its fit.groundPitchDeg, or ITEM_GROUND_PITCH (flat). */
export const itemGroundPitch = (fit: { groundPitchDeg?: number }): number =>
  fit.groundPitchDeg !== undefined ? (fit.groundPitchDeg * Math.PI) / 180 : ITEM_GROUND_PITCH;

/** A model point pitched by `pitch` about the x axis (same convention as three.js rotation.x). */
export const pitchX = (p: Vec3, pitch: number): Vec3 => {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
};

/** Lift that rests an item pitched by `pitch` on the floor: minus its lowest pitched y. `positions` = xyz triples. */
export function itemRestLift(positions: ArrayLike<number>, pitch: number): number {
  let low = Infinity;
  for (let i = 0; i < positions.length; i += 3) low = Math.min(low, pitchX([positions[i], positions[i + 1], positions[i + 2]], pitch)[1]);
  return -low;
}

/** An item model point as it lies on the floor: pitched, then lifted by `lift` (from itemRestLift). */
export const layItem = (p: Vec3, pitch: number, lift: number): Vec3 => {
  const q = pitchX(p, pitch);
  return [q[0], q[1] + lift, q[2]];
};

/** World-fixed key light. Direction points TOWARD the light: from upper-left, toward the camera. */
export const LIGHT = {
  keyDir: [-0.45, 0.8, 0.55] as [number, number, number],
  /** three.js intensities (r155+ physical units). Tune in the builder page. */
  keyIntensity: 2.4,
  hemiSky: 0xdfe6ff,
  hemiGround: 0x4a4458,
  hemiIntensity: 1.1,
};

/** What the software contact-sheet renderer uses to approximate the above. Not used by the game. */
export const SHEET_SHADING = { ambient: 0.42, key: 0.8 };

const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * World point -> game screen space, in TILES: [right, down, depth toward camera].
 * The ground (y = 0) maps 1:1: (x, 0, z) -> (x, z). Height moves a point up by y·cot(e).
 * The three.js game camera produces the same mapping (see three/stage.ts).
 */
export function obliqueProject(p: Vec3, elevationDeg = GAME_CAMERA.elevationDeg): Vec3 {
  const e = rad(elevationDeg);
  return [p[0], p[2] - p[1] / Math.tan(e), p[1] * Math.sin(e) + p[2] * Math.cos(e)];
}

/** Screen offset (in tiles, upward) of a point `height` units above the ground. For DOM overlays. */
export const obliqueLift = (height: number, elevationDeg = GAME_CAMERA.elevationDeg) => height / Math.tan(rad(elevationDeg));
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

/** Inventory icon camera: lower angle than the game so items read as objects, not shapes. */
export const ICON_CAMERA = { elevationDeg: 28, yawRad: 0.55, fovDeg: 28 };

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
import type { Vec3 } from './vec';
import { GAME_CAMERA, rad, turnWithView, type ViewAngles } from '../../viewEngine/camera';

/**
 * How models are staged: their lighting, how loot lies on the floor, the reference character size and the
 * icon camera. The game, the builder page and the contact-sheet CLI all read this, so a design that looks
 * right in one looks right in all. The game VIEW (camera angle, projection, board layout) is not here:
 * it belongs to the whole display, see src/viewEngine.
 */

/**
 * Inventory icon camera: straight-on (no elevation, no yaw), so an item's face is never tilted toward
 * or away from the viewer. Items are built facing +z, so this shows their true outline.
 */
export const ICON_CAMERA: IconCamera = { elevationDeg: 0, yawRad: 0, fovDeg: 28, zoom: 1 };

/** How an icon is seen (fitIconCamera, poseIcon in viewEngine/three/stage.ts). */
export interface IconCamera {
  elevationDeg: number;
  yawRad: number;
  fovDeg: number;
  /** How much larger than an item's framing the model shows (1: it fills the icon as items do). */
  zoom: number;
  /**
   * A model with a `top` anchor (a ring's gem) is turned so that point is at `angleDeg` on the icon (from its middle:
   * 0 right, 90 up), its top tipped `tiltDeg` toward the viewer about the axis across it (square to the line from its
   * top to its bottom).
   */
  top?: { angleDeg: number; tiltDeg: number };
}

/**
 * Rings' and amulets' icon camera (category `jewelry`): a little closer in, so a piece fills its slot. A ring is
 * turned so its top (where its gem sits, its `top` anchor) is at the upper right, tipped toward the viewer across
 * that line, so a band shows its depth (face-on it reads as a flat circle). On the floor they stay small: loot's
 * size is `fit.size`.
 */
export const JEWELRY_ICON_CAMERA: IconCamera = { elevationDeg: 0, yawRad: 0, fovDeg: 28, zoom: 1.035, top: { angleDeg: 45, tiltDeg: 24 } };

/**
 * Loot's icon camera (category `loot`, e.g. the Gold Coins in a chest's slot): loot lies on the floor, so it is seen
 * from above at an angle, like on the map, rather than straight-on (which would show coins edge-on).
 */
export const LOOT_ICON_CAMERA: IconCamera = { elevationDeg: 50, yawRad: 0, fovDeg: 28, zoom: 1 };

/** The icon camera for a model, by its design id: loot's, jewelry's, or the items' straight-on one. */
export const iconCameraFor = (designId: string): IconCamera =>
  designId.startsWith('loot.') ? LOOT_ICON_CAMERA : designId.startsWith('jewelry.') ? JEWELRY_ICON_CAMERA : ICON_CAMERA;

/**
 * Standing height of a player character, in tiles: the reference size for people. Matches the skeleton
 * (creature.skeleton fit height). Held weapon and shield sizes are fractions of it (src/forge/equip.ts).
 */
export const CHARACTER_HEIGHT = 1.12;

/**
 * Items on the map (loot) lie FLAT on their tile, face up: rotate the model -90Â° about X (its +z face
 * turns up, its +y "tip" points north), then lift it so it rests on the floor, and turn it by lootYaw so
 * it keeps its icon's screen orientation. Used by the game renderer, the forge game view and forge:sheet.
 * A design can lie less tipped (fit.groundPitchDeg), or on its side (fit.groundRollDeg: turned about its front
 * axis first), e.g. a helm, so it rests the way it would if dropped.
 */
export const ITEM_GROUND_PITCH = -Math.PI / 2;

/** The pitch an item design lies at on the floor: its fit.groundPitchDeg, or ITEM_GROUND_PITCH (flat). */
export const itemGroundPitch = (fit: { groundPitchDeg?: number }): number =>
  fit.groundPitchDeg !== undefined ? (fit.groundPitchDeg * Math.PI) / 180 : ITEM_GROUND_PITCH;

/** The roll an item design lies at on the floor (about its front axis, z, before the pitch): fit.groundRollDeg, or 0. */
export const itemGroundRoll = (fit: { groundRollDeg?: number }): number => ((fit.groundRollDeg ?? 0) * Math.PI) / 180;

/** A model point rolled by `roll` about the z axis (three.js rotation.z), then pitched by `pitch` about x. */
const rollThenPitch = (p: Vec3, pitch: number, roll: number): Vec3 => {
  const c = Math.cos(roll), s = Math.sin(roll);
  return pitchX([p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]], pitch);
};

/** A model point pitched by `pitch` about the x axis (same convention as three.js rotation.x). */
export const pitchX = (p: Vec3, pitch: number): Vec3 => {
  const c = Math.cos(pitch), s = Math.sin(pitch);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
};

/**
 * Lift that rests an item rolled by `roll` and pitched by `pitch` on the floor: minus its lowest posed y.
 * `positions` = xyz triples.
 */
export function itemRestLift(positions: ArrayLike<number>, pitch: number, roll = 0): number {
  let low = Infinity;
  for (let i = 0; i < positions.length; i += 3) low = Math.min(low, rollThenPitch([positions[i], positions[i + 1], positions[i + 2]], pitch, roll)[1]);
  return -low;
}

/** An item model point as it lies on the floor: rolled, pitched, then lifted by `lift` (from itemRestLift). */
export const layItem = (p: Vec3, pitch: number, lift: number, roll = 0): Vec3 => {
  const q = rollThenPitch(p, pitch, roll);
  return [q[0], q[1] + lift, q[2]];
};

/**
 * Yaw (radians, about world up) of loot lying on the floor: turned against the view's yaw, so an item
 * keeps the screen orientation it has in its icon (tip up and to the left) whatever the view's yaw.
 */
export const lootYaw = (view: ViewAngles = GAME_CAMERA): number => -rad(view.yawDeg);

/**
 * Key light. `keyDir` points TOWARD the light, given for an unturned view (x = screen right, -z = up the
 * screen): from the upper left, toward the camera. keyLightDir turns it with the view, so the light
 * always comes from the screen's upper left whatever the view's yaw.
 */
export const LIGHT = {
  keyDir: [-0.45, 0.8, 0.55] as [number, number, number],
  /** three.js intensities (r155+ physical units). Tune in the builder page. */
  keyIntensity: 2.4,
  hemiSky: 0xdfe6ff,
  hemiGround: 0x4a4458,
  hemiIntensity: 1.1,
};

/** Direction toward the key light for a view (LIGHT.keyDir turned with it). */
export const keyLightDir = (view: ViewAngles = GAME_CAMERA): Vec3 => turnWithView(LIGHT.keyDir, view);

/** What the software contact-sheet renderer uses to approximate the above. Not used by the game. */
export const SHEET_SHADING = { ambient: 0.42, key: 0.8 };

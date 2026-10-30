import * as THREE from 'three';
import type { Model } from '../../forge/core/types';
import { ICON_CAMERA, ITEM_GROUND_PITCH, LIGHT, iconCameraFor, itemRestLift, keyLightDir, type IconCamera } from '../../forge/core/stage-config';
import { GAME_CAMERA, type ViewAngles } from '../camera';
import type { BoardLayout } from '../board';

/**
 * Lights matching stage-config. Add to any scene (game, builder page, icon renderer). `view`: the view
 * the scene is seen through, so the key light comes from that view's upper left (keyLightDir); omit it
 * for an unturned view (icons). Returns the key light (aimKeyLight re-aims it for another view).
 */
export function addForgeLights(scene: THREE.Scene, view?: ViewAngles): THREE.DirectionalLight {
  const key = new THREE.DirectionalLight(0xffffff, LIGHT.keyIntensity);
  aimKeyLight(key, view);
  scene.add(key, new THREE.HemisphereLight(LIGHT.hemiSky, LIGHT.hemiGround, LIGHT.hemiIntensity));
  return key;
}

/** Point a key light for `view` (unturned when omitted). */
export function aimKeyLight(key: THREE.DirectionalLight, view?: ViewAngles): void {
  key.position.set(...(view ? keyLightDir(view) : LIGHT.keyDir)).multiplyScalar(10);
}

export function makeGameCamera(): THREE.OrthographicCamera {
  return new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
}

/**
 * Orthographic camera for a view (GAME_CAMERA by default), matching viewProject exactly: it looks at
 * `target`, and `frame` is the visible rectangle in screen tiles around it (left/right along screen right,
 * top/bottom along screen up). The game frames a whole board (frameBoard); the forge frames one cell.
 */
export function fitViewCamera(
  cam: THREE.OrthographicCamera,
  frame: { left: number; right: number; top: number; bottom: number },
  view: ViewAngles = GAME_CAMERA,
  target: [number, number, number] = [0, 0, 0],
): void {
  const e = (view.elevationDeg * Math.PI) / 180, t = (view.yawDeg * Math.PI) / 180;
  // Back from the target, against the view direction (horizontal forward (sinθ, 0, -cosθ), tilted down by e)
  const back = new THREE.Vector3(-Math.sin(t) * Math.cos(e), Math.sin(e), Math.cos(t) * Math.cos(e));
  cam.position.set(...target).addScaledVector(back, 50);
  cam.up.set(0, 1, 0);
  cam.lookAt(...target);
  Object.assign(cam, frame);
  cam.near = 0.1;
  cam.far = 200;
  cam.updateProjectionMatrix();
}

/** The game camera framing a whole board's box (boardLayout): its canvas covers the box exactly. */
export function frameBoard(cam: THREE.OrthographicCamera, b: BoardLayout): void {
  const T = b.tilePx;
  fitViewCamera(cam, { left: -b.originX / T, right: (b.width - b.originX) / T, top: b.originY / T, bottom: -(b.height - b.originY) / T }, b.view);
}

/**
 * Inventory icon camera (`view`: ICON_CAMERA, straight-on; loot's is LOOT_ICON_CAMERA, iconCameraFor), framed so a
 * model with these bounds fills the view. Shared by the game's icon renderer and the forge's icon view, so both show
 * the same icon.
 */
export function fitIconCamera(cam: THREE.PerspectiveCamera, min: ArrayLike<number>, max: ArrayLike<number>, aspect = 1, view: IconCamera = ICON_CAMERA): void {
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const cy = (min[1] + max[1]) / 2;
  const e = (view.elevationDeg * Math.PI) / 180, d = (span * 2.4) / view.zoom;
  cam.fov = view.fovDeg;
  cam.aspect = aspect;
  cam.near = d * 0.05;
  cam.far = d * 4;
  cam.updateProjectionMatrix();
  cam.position.set(Math.sin(view.yawRad) * Math.cos(e) * d, cy + Math.sin(e) * d, Math.cos(view.yawRad) * Math.cos(e) * d);
  cam.lookAt(0, cy, 0);
}

/**
 * Pose a model's object for its icon and give the bounds to frame (fitIconCamera): its icon camera (iconCameraFor)
 * and `yaw` (the forge's turn; icons 0). A camera with `top` turns a model that marks a `top` anchor (a ring's gem):
 * its top straight up, tipped toward the viewer about the horizontal (square to the line from top to bottom), then
 * the whole turned about the view axis so the top is at `top.angleDeg` (the tilt turns with it). Shared by the game's
 * icons and the forge's icon view, so both pose a model alike.
 */
export function poseIcon(obj: THREE.Object3D, model: Model, yaw = 0): { min: number[]; max: number[]; view: IconCamera } {
  const view = iconCameraFor(model.designId);
  const top = model.mesh.anchors.top;
  obj.position.set(0, 0, 0);
  if (!view.top || !top) {
    obj.rotation.set(0, yaw, 0, 'YXZ');
    return { min: [...model.mesh.bounds.min], max: [...model.mesh.bounds.max], view };
  }
  const about = (axis: THREE.Vector3, a: number) => new THREE.Quaternion().setFromAxisAngle(axis, a);
  const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0), Z = new THREE.Vector3(0, 0, 1);
  const up = about(Z, Math.PI / 2 - Math.atan2(top[1], top[0]));                           // its top straight up
  const tilt = about(X, (view.top.tiltDeg * Math.PI) / 180);                                 // tipped toward the viewer
  const place = about(Z, (view.top.angleDeg * Math.PI) / 180 - Math.PI / 2);                 // the top to its angle
  obj.quaternion.copy(about(Y, yaw).multiply(place).multiply(tilt).multiply(up));
  const box = new THREE.Box3().setFromObject(obj, true); // precise: a turned box's corners would frame it too loosely
  return { min: box.min.toArray(), max: box.max.toArray(), view };
}

/**
 * Lay an item model on the floor at its design's pitch (flat and face up unless the design says
 * otherwise, see itemGroundPitch), resting on the floor, then spin it `yaw` about world up (loot uses
 * lootYaw, so it keeps its icon's screen orientation).
 */
export function layItemOnGround(obj: THREE.Object3D, model: Model, yaw = 0): void {
  const pitch = model.groundPitch ?? ITEM_GROUND_PITCH, roll = model.groundRoll ?? 0;
  // YXZ: the roll (z) first, then the pitch (x), then the yaw (y), as layItem poses it
  obj.rotation.set(pitch, yaw, roll, 'YXZ');
  obj.position.y = itemRestLift(model.mesh.positions, pitch, roll);
}

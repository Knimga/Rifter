import * as THREE from 'three';
import type { Model } from '../core/types';
import { ICON_CAMERA, ITEM_GROUND_PITCH, LIGHT, itemRestLift, keyLightDir } from '../core/stage-config';
import { GAME_CAMERA, type ViewAngles } from '../../viewEngine/camera';
import type { BoardLayout } from '../../viewEngine/board';

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
 * Inventory icon camera (ICON_CAMERA, straight-on), framed so a model with these bounds fills the
 * view. Shared by the game's icon renderer and the forge's icon view, so both show the same icon.
 */
export function fitIconCamera(cam: THREE.PerspectiveCamera, min: ArrayLike<number>, max: ArrayLike<number>, aspect = 1): void {
  const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const cy = (min[1] + max[1]) / 2;
  const e = (ICON_CAMERA.elevationDeg * Math.PI) / 180, d = span * 2.4;
  cam.fov = ICON_CAMERA.fovDeg;
  cam.aspect = aspect;
  cam.near = d * 0.05;
  cam.far = d * 4;
  cam.updateProjectionMatrix();
  cam.position.set(Math.sin(ICON_CAMERA.yawRad) * Math.cos(e) * d, cy + Math.sin(e) * d, Math.cos(ICON_CAMERA.yawRad) * Math.cos(e) * d);
  cam.lookAt(0, cy, 0);
}

/**
 * Lay an item model on the floor at its design's pitch (flat and face up unless the design says
 * otherwise, see itemGroundPitch), resting on the floor, then spin it `yaw` about world up (loot uses
 * lootYaw, so it keeps its icon's screen orientation).
 */
export function layItemOnGround(obj: THREE.Object3D, model: Model, yaw = 0): void {
  const pitch = model.groundPitch ?? ITEM_GROUND_PITCH;
  obj.rotation.set(pitch, yaw, 0, 'YXZ');
  obj.position.y = itemRestLift(model.mesh.positions, pitch);
}

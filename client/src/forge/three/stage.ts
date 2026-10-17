import * as THREE from 'three';
import type { Model } from '../core/types';
import { GAME_CAMERA, ICON_CAMERA, ITEM_GROUND_PITCH, LIGHT, itemRestLift } from '../core/stage-config';

/** Lights matching stage-config. Add to any scene (game, builder page, icon renderer). */
export function addForgeLights(scene: THREE.Scene): void {
  const key = new THREE.DirectionalLight(0xffffff, LIGHT.keyIntensity);
  key.position.set(...LIGHT.keyDir).multiplyScalar(10);
  scene.add(key, new THREE.HemisphereLight(LIGHT.hemiSky, LIGHT.hemiGround, LIGHT.hemiIntensity));
}

/**
 * Oblique game camera (see stage-config): an orthographic camera at `elevationDeg` whose vertical
 * extent is compressed by sin(elevation), so a canvas `widthTiles` x `heightTiles` tiles big shows the
 * ground plane at exactly 1 tile per tile on both axes.
 *
 * The view covers world x in [x0, x0 + widthTiles] and ground z in [z0, z0 + heightTiles].
 * `liftTiles` extra rows ABOVE z0 are added to the top of the view for models that stick up
 * past the first row (the canvas must be that much taller too).
 */
export function makeGameCamera(): THREE.OrthographicCamera {
  return new THREE.OrthographicCamera(-1, 1, 1, -1, -100, 100);
}

export function fitGameCamera(
  cam: THREE.OrthographicCamera,
  view: { x0: number; z0: number; widthTiles: number; heightTiles: number; liftTiles?: number },
  elevationDeg = GAME_CAMERA.elevationDeg,
): void {
  const e = (elevationDeg * Math.PI) / 180;
  const se = Math.sin(e);
  const lift = view.liftTiles ?? 0;
  // Aim at the ground point under the view's vertical center (including the lift rows).
  const target = new THREE.Vector3(view.x0 + view.widthTiles / 2, 0, view.z0 + (view.heightTiles - lift) / 2);
  cam.position.set(target.x, target.y + Math.sin(e) * 50, target.z + Math.cos(e) * 50);
  cam.up.set(0, 1, 0);
  cam.lookAt(target);
  const halfH = ((view.heightTiles + lift) / 2) * se;
  cam.left = -view.widthTiles / 2;
  cam.right = view.widthTiles / 2;
  cam.top = halfH;
  cam.bottom = -halfH;
  cam.near = 0.1;
  cam.far = 200;
  cam.updateProjectionMatrix();
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
 * otherwise, see itemGroundPitch), resting on the floor, then spin it `yaw` about world up.
 */
export function layItemOnGround(obj: THREE.Object3D, model: Model, yaw = 0): void {
  const pitch = model.groundPitch ?? ITEM_GROUND_PITCH;
  obj.rotation.set(pitch, yaw, 0, 'YXZ');
  obj.position.y = itemRestLift(model.mesh.positions, pitch);
}

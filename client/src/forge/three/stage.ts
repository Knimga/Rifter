import * as THREE from 'three';
import { GAME_CAMERA, LIGHT } from '../core/stage-config';

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

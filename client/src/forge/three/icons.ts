import * as THREE from 'three';
import type { Model } from '../core/types';
import { ICON_CAMERA } from '../core/stage-config';
import { addForgeLights } from './stage';
import { disposeObject, toThree } from './toThree';

/**
 * One shared WebGL context renders every inventory icon to a data URL (cached by key).
 * Do NOT create one canvas per inventory slot: browsers cap live WebGL contexts at ~16.
 * Key suggestion: `${designId}:${seed}:${JSON.stringify(params)}:v${version}`.
 */
export class IconRenderer {
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam: THREE.PerspectiveCamera;
  private cache = new Map<string, string>();

  constructor(size = 128) {
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.r.setPixelRatio(1);
    this.r.setSize(size, size);
    this.r.setClearColor(0x000000, 0);
    this.cam = new THREE.PerspectiveCamera(ICON_CAMERA.fovDeg, 1, 0.1, 20);
    addForgeLights(this.scene);
  }

  render(key: string, model: Model): string {
    const hit = this.cache.get(key);
    if (hit) return hit;
    const obj = toThree(model);
    this.scene.add(obj);
    const e = (ICON_CAMERA.elevationDeg * Math.PI) / 180, d = 2.4;
    this.cam.position.set(Math.sin(ICON_CAMERA.yawRad) * Math.cos(e) * d, Math.sin(e) * d, Math.cos(ICON_CAMERA.yawRad) * Math.cos(e) * d);
    this.cam.lookAt(0, 0, 0);
    this.r.render(this.scene, this.cam);
    const url = this.r.domElement.toDataURL('image/png');
    this.scene.remove(obj);
    disposeObject(obj);
    this.cache.set(key, url);
    return url;
  }

  dispose(): void {
    this.r.dispose();
    this.cache.clear();
  }
}

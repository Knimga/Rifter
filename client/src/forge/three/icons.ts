import * as THREE from 'three';
import type { Design, Model, ModelLink } from '../core/types';
import { buildLinkedModel } from '../core/link';
import { addForgeLights, fitIconCamera } from './stage';
import { disposeObject, toThree } from './toThree';

/**
 * One shared WebGL context renders every inventory icon to a data URL. Callers cache the URLs.
 * Do NOT create one canvas per inventory slot: browsers cap live WebGL contexts at ~16.
 */
export class IconRenderer {
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera();

  constructor(size = 128) {
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.r.setPixelRatio(1);
    this.r.setSize(size, size);
    this.r.setClearColor(0x000000, 0);
    addForgeLights(this.scene);
  }

  render(model: Model): string {
    const obj = toThree(model);
    this.scene.add(obj);
    fitIconCamera(this.cam, model.mesh.bounds.min, model.mesh.bounds.max);
    this.r.render(this.scene, this.cam);
    const url = this.r.domElement.toDataURL('image/png');
    this.scene.remove(obj);
    disposeObject(obj);
    return url;
  }

  dispose(): void {
    this.r.dispose();
  }
}

let shared: IconRenderer | null = null;

/** Icon (PNG data URL) of one instance of a linked game object, e.g. a weapon item, seeded by its id. */
export function renderLinkedIcon(design: Design, link: ModelLink, instanceId: string): string {
  shared ??= new IconRenderer();
  return shared.render(buildLinkedModel(design, link, instanceId));
}

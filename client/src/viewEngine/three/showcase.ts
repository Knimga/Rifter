import * as THREE from 'three';
import type { Model } from '../../forge/core/types';
import { addForgeLights } from './stage';
import { animateParts, disposeObject, toThree } from './toThree';

/** One model drawn into a rectangle of the canvas (CSS px, relative to the canvas). */
export interface ShowcaseCell {
  model: Model;
  rect: { x: number; y: number; w: number; h: number };
  /** Turn about its own vertical (radians). 0 = facing the viewer. */
  yaw: number;
  /** Size multiplier, anchored at the feet (bottom centre of the rect). */
  scale: number;
  /** Drawn darker (e.g. not the focused one). */
  dim?: boolean;
}

/** A full turn of a spinning showcase model (ms): character select and the party window. */
export const SHOWCASE_SPIN_MS = 8000;

/** Camera tilt: looks slightly down on the model. */
const ELEVATION = (12 * Math.PI) / 180;
/** World height a cell shows at scale 1, and the gap below the feet (world units). */
const FRAME_HEIGHT = 1.75;
const FEET_PAD = 0.1;

/**
 * Draws several standing models side by side on ONE WebGL canvas (a scissored viewport per cell), for
 * menu screens such as character select. One context for all, never one per model.
 */
export class ShowcaseRenderer {
  readonly canvas: HTMLCanvasElement;
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  private objects = new Map<Model, THREE.Group>();
  private lights: { light: THREE.Light; base: number }[] = [];
  private size = { w: 1, h: 1 };

  constructor() {
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.r.setPixelRatio(window.devicePixelRatio);
    this.r.setClearColor(0x000000, 0);
    this.canvas = this.r.domElement;
    addForgeLights(this.scene);
    this.scene.traverse((o) => { if (o instanceof THREE.Light) this.lights.push({ light: o, base: o.intensity }); });
  }

  setSize(w: number, h: number): void {
    this.size = { w: Math.max(1, w), h: Math.max(1, h) };
    this.r.setSize(this.size.w, this.size.h);
  }

  /** Draw all cells, moving parts posed at `sec`. Models not drawn by this call are released. */
  render(cells: ShowcaseCell[], sec = 0): void {
    const { w, h } = this.size;
    this.r.setScissorTest(false);
    this.r.setViewport(0, 0, w, h);
    this.r.clear();
    this.r.setScissorTest(true);
    const used = new Set<Model>();
    for (const o of this.objects.values()) o.visible = false;

    for (const cell of cells) {
      used.add(cell.model);
      let obj = this.objects.get(cell.model);
      if (!obj) {
        obj = toThree(cell.model);
        this.objects.set(cell.model, obj);
        this.scene.add(obj);
      }
      obj.visible = true;
      obj.rotation.y = cell.yaw;
      animateParts(obj, sec);
      for (const { light, base } of this.lights) light.intensity = base * (cell.dim ? 0.45 : 1);

      // A camera framing this cell: feet near its bottom edge, scaled about the feet
      const { x, y, w: cw, h: ch } = cell.rect;
      const worldH = FRAME_HEIGHT / cell.scale, worldW = worldH * (cw / ch);
      this.cam.left = -worldW / 2;
      this.cam.right = worldW / 2;
      this.cam.bottom = -FEET_PAD / cell.scale;
      this.cam.top = worldH - FEET_PAD / cell.scale;
      this.cam.position.set(0, Math.sin(ELEVATION) * 20, Math.cos(ELEVATION) * 20);
      this.cam.lookAt(0, 0, 0);
      this.cam.updateProjectionMatrix();

      const gy = h - y - ch; // GL origin is bottom-left
      this.r.setViewport(x, gy, cw, ch);
      this.r.setScissor(x, gy, cw, ch);
      this.r.render(this.scene, this.cam);
      obj.visible = false;
    }

    for (const [model, obj] of this.objects) {
      if (used.has(model)) continue;
      this.scene.remove(obj);
      disposeObject(obj);
      this.objects.delete(model);
    }
  }

  dispose(): void {
    for (const obj of this.objects.values()) disposeObject(obj);
    this.objects.clear();
    this.r.dispose();
  }
}

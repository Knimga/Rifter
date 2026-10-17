// DEV ONLY. One WebGL canvas that draws a grid of model cells (one scissored viewport per cell),
// so the builder page never needs more than one WebGL context.
import * as THREE from 'three';
import type { Model } from '../core/types';
import { ICON_CAMERA } from '../core/stage-config';
import { TILE_SIZE } from '../../data/constants';
import { addForgeLights, fitGameCamera, makeGameCamera } from '../three/stage';
import { disposeObject, sharedMaterials, toThree } from '../three/toThree';

export type CameraPreset = 'game' | 'icon' | 'top' | 'side';

export interface Cell {
  model: Model;
  yaw: number;
  /** CSS px, relative to the canvas. */
  rect: { x: number; y: number; w: number; h: number };
}

export interface ViewOptions {
  camera: CameraPreset;
  wireframe: boolean;
  ground: boolean;
}

const BG = 0x1e1c28;

/**
 * Game view: where the model's tile center sits inside a cell (fractions of the cell). The page draws the
 * DOM floor tiles behind the canvas around this point, exactly like the game's tile grid.
 */
export const GAME_VIEW_ANCHOR = { x: 0.5, y: 0.5 };

export class ForgeView {
  readonly canvas: HTMLCanvasElement;
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private ground = new THREE.Group();
  /** three.js objects cached by Model instance: a rebuilt model (new design code, params or seed) is a
   *  new instance, so it always gets a fresh mesh instead of a stale cached one. */
  private objects = new Map<Model, THREE.Group>();
  private gameCam = makeGameCamera();
  private persp = new THREE.PerspectiveCamera(ICON_CAMERA.fovDeg, 1, 0.01, 50);
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50);

  constructor() {
    // alpha: the game view is transparent so the DOM floor tiles show through, as in the game
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.r.setPixelRatio(window.devicePixelRatio);
    this.canvas = this.r.domElement;
    addForgeLights(this.scene);
    // 1x1 tile reference under the model
    const tile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: 0x3a3846 }));
    tile.rotation.x = -Math.PI / 2;
    const edge = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)),
      new THREE.LineBasicMaterial({ color: 0x6e6c80 }),
    );
    edge.rotation.x = -Math.PI / 2;
    this.ground.add(tile, edge);
    this.scene.add(this.ground);
  }

  /** Draw all cells. Objects not used by this call are disposed. */
  render(cells: Cell[], opts: ViewOptions, size: { w: number; h: number }): void {
    this.r.setSize(size.w, size.h, false);
    this.r.setScissorTest(true);
    this.r.setClearColor(0x000000, 0);
    this.r.setScissor(0, 0, size.w, size.h);
    this.r.setViewport(0, 0, size.w, size.h);
    this.r.clear();

    const used = new Set<Model>();
    for (const o of this.objects.values()) o.visible = false;
    for (const m of Object.values(sharedMaterials)) m.wireframe = opts.wireframe;

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

      const { min, max } = cell.model.mesh.bounds;
      const isItem = cell.model.mesh.anchors.center !== undefined;
      const game = opts.camera === 'game';
      // Game view: items rest on the tile (their origin is their center); other views keep them centered.
      obj.position.y = game && isItem ? -min[1] : 0;
      this.ground.visible = opts.ground && !game; // game view: the page's DOM tiles are the ground
      this.ground.position.y = isItem ? min[1] - 0.02 : 0;

      const { x, y, w, h } = cell.rect;
      const gy = size.h - y - h; // GL origin is bottom-left
      this.r.setViewport(x, gy, w, h);
      this.r.setScissor(x, gy, w, h);
      if (!game) {
        this.r.setClearColor(BG, 1);
        this.r.clear();
        this.r.setClearColor(0x000000, 0);
      }
      this.r.render(this.scene, this.cameraFor(opts.camera, w, h, min, max, isItem));
      obj.visible = false;
    }
    for (const m of Object.values(sharedMaterials)) m.wireframe = false;

    for (const [model, obj] of this.objects) {
      if (used.has(model)) continue;
      this.scene.remove(obj);
      disposeObject(obj);
      this.objects.delete(model);
    }
  }

  private cameraFor(preset: CameraPreset, w: number, h: number, min: number[], max: number[], isItem: boolean): THREE.Camera {
    const aspect = w / h;
    const span = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
    if (preset === 'game') {
      // Exactly the game: oblique projection at 1 tile = TILE_SIZE px, tile center at GAME_VIEW_ANCHOR.
      fitGameCamera(this.gameCam, {
        x0: -(w * GAME_VIEW_ANCHOR.x) / TILE_SIZE,
        z0: -(h * GAME_VIEW_ANCHOR.y) / TILE_SIZE,
        widthTiles: w / TILE_SIZE,
        heightTiles: h / TILE_SIZE,
      });
      return this.gameCam;
    }
    if (preset === 'top') {
      // Straight down, scaled to fit. Standing models: feet ~70% down the cell.
      const widthTiles = Math.max(2.2, span * 1.6);
      const tall = widthTiles / aspect;
      const below = isItem ? 0.5 : 0.3;
      fitGameCamera(this.gameCam, { x0: -widthTiles / 2, z0: -tall * (1 - below), widthTiles, heightTiles: tall }, 89.9);
      return this.gameCam;
    }
    const cy = (min[1] + max[1]) / 2;
    if (preset === 'icon') {
      const e = (ICON_CAMERA.elevationDeg * Math.PI) / 180, d = span * 2.4;
      this.persp.aspect = aspect;
      this.persp.updateProjectionMatrix();
      this.persp.position.set(Math.sin(ICON_CAMERA.yawRad) * Math.cos(e) * d, cy + Math.sin(e) * d, Math.cos(ICON_CAMERA.yawRad) * Math.cos(e) * d);
      this.persp.lookAt(0, cy, 0);
      return this.persp;
    }
    // side: straight-on from the front (+z)
    const half = span * 0.65;
    Object.assign(this.ortho, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    this.ortho.updateProjectionMatrix();
    this.ortho.position.set(0, cy, 10);
    this.ortho.lookAt(0, cy, 0);
    return this.ortho;
  }

  dispose(): void {
    for (const obj of this.objects.values()) disposeObject(obj);
    this.objects.clear();
    this.r.dispose();
  }
}

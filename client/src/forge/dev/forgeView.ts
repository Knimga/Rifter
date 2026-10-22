// DEV ONLY. One WebGL canvas that draws a grid of model cells (one scissored viewport per cell),
// so the builder page never needs more than one WebGL context.
import * as THREE from 'three';
import type { Model } from '../core/types';
import { lootYaw } from '../core/stage-config';
import { GAME_CAMERA } from '../../viewEngine/camera';
import { TILE_SIZE } from '../../viewEngine/board';
import { addForgeLights, aimKeyLight, fitIconCamera, fitViewCamera, layItemOnGround, makeGameCamera } from '../../viewEngine/three/stage';
import { animateParts, disposeObject, sharedMaterials, toThree, type AnimationProgress } from '../../viewEngine/three/toThree';

export type CameraPreset = 'game' | 'icon' | 'top' | 'side';

export interface Cell {
  model: Model;
  yaw: number;
  /** CSS px, relative to the canvas. */
  rect: { x: number; y: number; w: number; h: number };
  /** How far along each of its one-time animations is (PartAnimation; none = the rest pose). */
  progress?: AnimationProgress;
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
  private persp = new THREE.PerspectiveCamera();
  private ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, -50, 50);
  /** Key light: aimed for the game view in the game preset (it turns with GAME_CAMERA), unturned otherwise. */
  private key: THREE.DirectionalLight;

  constructor() {
    // alpha: the game view is transparent so the DOM floor tiles show through, as in the game
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.r.setPixelRatio(window.devicePixelRatio);
    this.canvas = this.r.domElement;
    this.key = addForgeLights(this.scene);
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

  /**
   * Draw all cells, spinning parts posed at `sec` and animated parts at each cell's `progress` (see animateParts). Objects not used by this call are
   * disposed.
   */
  render(cells: Cell[], opts: ViewOptions, size: { w: number; h: number }, sec = 0): void {
    this.r.setSize(size.w, size.h, false);
    this.r.setScissorTest(true);
    this.r.setClearColor(0x000000, 0);
    this.r.setScissor(0, 0, size.w, size.h);
    this.r.setViewport(0, 0, size.w, size.h);
    this.r.clear();

    const used = new Set<Model>();
    for (const o of this.objects.values()) o.visible = false;
    for (const m of Object.values(sharedMaterials)) m.wireframe = opts.wireframe;
    aimKeyLight(this.key, opts.camera === 'game' ? GAME_CAMERA : undefined);

    for (const cell of cells) {
      used.add(cell.model);
      let obj = this.objects.get(cell.model);
      if (!obj) {
        obj = toThree(cell.model);
        this.objects.set(cell.model, obj);
        this.scene.add(obj);
      }
      obj.visible = true;
      animateParts(obj, sec, cell.progress);

      const { min, max } = cell.model.mesh.bounds;
      const isItem = cell.model.mesh.anchors.center !== undefined;
      const game = opts.camera === 'game';
      // Game view: items lie flat on the tile, face up, resting on the floor, turned exactly as loot in the
      // game (lootYaw); yaw then spins them in place on the floor. Other views keep items upright and centered.
      if (game && isItem) layItemOnGround(obj, cell.model, lootYaw() + cell.yaw);
      else { obj.rotation.set(0, cell.yaw, 0, 'YXZ'); obj.position.y = 0; }
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
      // Exactly the game (GAME_CAMERA) at 1 tile = TILE_SIZE px, the tile center at GAME_VIEW_ANCHOR.
      const ax = w * GAME_VIEW_ANCHOR.x, ay = h * GAME_VIEW_ANCHOR.y;
      fitViewCamera(this.gameCam, { left: -ax / TILE_SIZE, right: (w - ax) / TILE_SIZE, top: ay / TILE_SIZE, bottom: -(h - ay) / TILE_SIZE });
      return this.gameCam;
    }
    if (preset === 'top') {
      // Straight down, unturned, scaled to fit. Standing models: feet ~70% down the cell.
      const widthTiles = Math.max(2.2, span * 1.6);
      const tall = widthTiles / aspect;
      const below = isItem ? 0.5 : 0.3;
      fitViewCamera(this.gameCam, { left: -widthTiles / 2, right: widthTiles / 2, top: tall * (1 - below), bottom: -tall * below }, { elevationDeg: 89.9, yawDeg: 0 });
      return this.gameCam;
    }
    const cy = (min[1] + max[1]) / 2;
    if (preset === 'icon') {
      fitIconCamera(this.persp, min, max, aspect);
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

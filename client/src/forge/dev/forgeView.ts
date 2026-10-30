// DEV ONLY. One WebGL canvas that draws a grid of model cells (one scissored viewport per cell),
// so the builder page never needs more than one WebGL context.
import * as THREE from 'three';
import type { Model } from '../core/types';
import { iconCameraFor, lootYaw } from '../core/stage-config';
import { GAME_CAMERA } from '../../viewEngine/camera';
import { TILE_SIZE } from '../../viewEngine/board';
import { addForgeLights, aimKeyLight, fitIconCamera, fitViewCamera, layItemOnGround, makeGameCamera, poseIcon } from '../../viewEngine/three/stage';
import { animateParts, disposeObject, sharedMaterials, toThree, type AnimationProgress } from '../../viewEngine/three/toThree';

export type CameraPreset = 'game' | 'icon' | 'top' | 'side';

export interface Cell {
  model: Model;
  yaw: number;
  /** CSS px, relative to the canvas. */
  rect: { x: number; y: number; w: number; h: number };
  /** How far along each of its one-time animations is (PartAnimation; none = the rest pose). */
  progress?: AnimationProgress;
  /** Tiles a side it stands on in game (a large creature's 2×2); the tile reference shows that square. Default 1. */
  tiles?: number;
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
  /** The tile reference under the model, by square size (tiles a side), built on first use. */
  private grounds = new Map<number, THREE.Group>();
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
  }

  /** The tile reference for a model standing on `n`×`n` tiles: the tiles under it, centered on its feet. */
  private groundFor(n: number): THREE.Group {
    let g = this.grounds.get(n);
    if (g) return g;
    g = new THREE.Group();
    const fill = new THREE.MeshBasicMaterial({ color: 0x3a3846 }), line = new THREE.LineBasicMaterial({ color: 0x6e6c80 });
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const at = (k: number) => k - (n - 1) / 2;
        const tile = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fill);
        const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(1, 1)), line);
        for (const o of [tile, edge]) { o.rotation.x = -Math.PI / 2; o.position.set(at(i), 0, at(j)); }
        g.add(tile, edge);
      }
    }
    this.grounds.set(n, g);
    this.scene.add(g);
    return g;
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

      let min: number[] = [...cell.model.mesh.bounds.min], max: number[] = [...cell.model.mesh.bounds.max];
      const isItem = cell.model.mesh.anchors.center !== undefined;
      const game = opts.camera === 'game';
      // Game view: items lie flat on the tile, face up, resting on the floor, turned exactly as loot in the
      // game (lootYaw); yaw then spins them in place on the floor. The icon view poses a model as its icon does
      // (poseIcon: a ring turned with its top to the upper right). Other views keep items upright and centered.
      if (game && isItem) layItemOnGround(obj, cell.model, lootYaw() + cell.yaw);
      else if (opts.camera === 'icon') ({ min, max } = poseIcon(obj, cell.model, cell.yaw));
      else { obj.rotation.set(0, cell.yaw, 0, 'YXZ'); obj.position.y = 0; }
      for (const g of this.grounds.values()) g.visible = false;
      const ground = this.groundFor(cell.tiles ?? 1);
      ground.visible = opts.ground && !game; // game view: the page's DOM tiles are the ground
      ground.position.y = isItem ? min[1] - 0.02 : 0;

      const { x, y, w, h } = cell.rect;
      const gy = size.h - y - h; // GL origin is bottom-left
      this.r.setViewport(x, gy, w, h);
      this.r.setScissor(x, gy, w, h);
      if (!game) {
        this.r.setClearColor(BG, 1);
        this.r.clear();
        this.r.setClearColor(0x000000, 0);
      }
      this.r.render(this.scene, this.cameraFor(opts.camera, w, h, min, max, isItem, cell.model.designId));
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

  private cameraFor(preset: CameraPreset, w: number, h: number, min: number[], max: number[], isItem: boolean, designId: string): THREE.Camera {
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
      fitIconCamera(this.persp, min, max, aspect, iconCameraFor(designId));
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
    for (const g of this.grounds.values()) disposeObject(g);
    this.r.dispose();
  }
}

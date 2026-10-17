import * as THREE from 'three';
import type { Model } from '../core/types';
import { smoothYaw, yawFromGridMove } from '../core/facing';
import { addForgeLights, fitGameCamera, makeGameCamera, layItemOnGround } from './stage';
import { disposeObject, toThree } from './toThree';

type Pos = { x: number; y: number };

/** One model on the map. `id` is stable for the unit's lifetime (e.g. an enemy instance id). */
export interface MapUnit {
  id: string;
  model: Model;
  pos: Pos;
  /** Items (loot) lie flat on the floor and never turn; creatures stand and face their last move. */
  lying?: boolean;
}

interface Entry {
  model: Model;
  obj: THREE.Group;
  pos: Pos;
  yaw: number;
  targetYaw: number;
}

/** A unit's scene object, standing upright or (loot) laid flat on the floor. */
function makeObject(u: MapUnit): THREE.Group {
  const obj = toThree(u.model);
  if (u.lying) layItemOnGround(obj, u.model);
  return obj;
}

/**
 * Draws models on a transparent canvas laid exactly over the DOM tile grid (oblique game projection,
 * 1 tile = tilePx). Creatures stand with their feet at the tile center; loot lies flat, centered on its tile.
 *
 * Facing is view state kept here, never in the game: when a unit's position changes, it turns toward
 * the direction of that move. Rendering is on demand; the animation loop only runs while a unit is
 * still turning.
 */
export class MapModelRenderer {
  readonly canvas: HTMLCanvasElement;
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = makeGameCamera();
  private entries = new Map<string, Entry>();
  private raf = 0;
  private lastFrame = 0;

  constructor() {
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.r.setPixelRatio(window.devicePixelRatio);
    this.r.setClearColor(0x000000, 0);
    this.canvas = this.r.domElement;
    addForgeLights(this.scene);
  }

  /** Size the canvas and camera to a grid of cols x rows tiles. */
  setGrid(cols: number, rows: number, tilePx: number): void {
    this.r.setSize(cols * tilePx, rows * tilePx);
    fitGameCamera(this.cam, { x0: 0, z0: 0, widthTiles: cols, heightTiles: rows });
    this.requestFrame();
  }

  /** Replace the set of units. New units face the camera; moved units turn toward their move. */
  setUnits(units: MapUnit[]): void {
    const seen = new Set<string>();
    let changed = false;
    for (const u of units) {
      seen.add(u.id);
      let e = this.entries.get(u.id);
      if (!e || e.model !== u.model || u.pos.x !== e.pos.x || u.pos.y !== e.pos.y) changed = true;
      if (e && e.model !== u.model) {
        // Same unit, rebuilt model (e.g. a design update in dev): swap the mesh, keep its facing.
        this.scene.remove(e.obj);
        disposeObject(e.obj);
        e = { ...e, model: u.model, obj: makeObject(u) };
        this.scene.add(e.obj);
        this.entries.set(u.id, e);
      }
      if (!e) {
        e = { model: u.model, obj: makeObject(u), pos: u.pos, yaw: 0, targetYaw: 0 };
        this.scene.add(e.obj);
        this.entries.set(u.id, e);
      } else if (u.pos.x !== e.pos.x || u.pos.y !== e.pos.y) {
        e.targetYaw = yawFromGridMove(u.pos.x - e.pos.x, u.pos.y - e.pos.y);
        e.pos = u.pos;
      }
      e.obj.position.x = u.pos.x + 0.5;
      e.obj.position.z = u.pos.y + 0.5;
    }
    for (const [id, e] of this.entries) {
      if (seen.has(id)) continue;
      this.scene.remove(e.obj);
      disposeObject(e.obj);
      this.entries.delete(id);
      changed = true;
    }
    if (changed) this.requestFrame();
  }

  private requestFrame(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.raf = 0;
    const dt = this.lastFrame ? Math.min(now - this.lastFrame, 50) : 16;
    let turning = false;
    for (const e of this.entries.values()) {
      if (e.yaw !== e.targetYaw) {
        e.yaw = smoothYaw(e.yaw, e.targetYaw, dt);
        turning ||= e.yaw !== e.targetYaw;
      }
      e.obj.rotation.y = e.yaw;
    }
    this.r.render(this.scene, this.cam);
    if (turning) {
      this.lastFrame = now;
      this.raf = requestAnimationFrame(this.frame);
    } else {
      this.lastFrame = 0;
    }
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    for (const e of this.entries.values()) disposeObject(e.obj);
    this.entries.clear();
    this.r.dispose();
  }
}

import * as THREE from 'three';
import type { Model } from '../../forge/core/types';
import { shortestAngle, smoothYaw, yawFromGridMove } from '../../forge/core/facing';
import { lootYaw } from '../../forge/core/stage-config';
import { GAME_CAMERA } from '../camera';
import type { BoardLayout } from '../board';
import { addForgeLights, frameBoard, makeGameCamera, layItemOnGround } from './stage';
import { animateParts, disposeObject, hasAnimations, hasSpinningParts, toThree, type AnimationProgress } from './toThree';
import { FogOfWar, type FogInput } from './fog';

type Pos = { x: number; y: number };

/** Half-turn time of a model (smoothYaw's default): a turn of `a` radians takes a / PI of it. */
const HALF_TURN_MS = 170;
/** Glide speed between tiles. */
const MS_PER_TILE = 200;
/** Longest a move may take, turning included. */
const MAX_MOVE_MS = 1000;

/** One model on the map. `id` is stable for the unit's lifetime (e.g. an enemy instance id). */
export interface MapUnit {
  id: string;
  model: Model;
  pos: Pos;
  /** Items (loot) lie flat on the floor and never turn; creatures stand and face their last move. */
  lying?: boolean;
  /** The yaw (radians) a unit starts facing; map objects (a door facing its floor tile) keep it. Default 0. */
  facing?: number;
  /**
   * The tile the unit last aimed an ability at. When `seq` changes, the unit turns to face it (until it
   * next moves or aims).
   */
  aim?: { x: number; y: number; seq: number };
  /**
   * The model's one-time animations (PartAnimation) the unit's state has called for, e.g. ['open'] for a
   * looted chest. One newly listed plays; one already listed when the unit appears shows its end pose.
   */
  played?: string[];
  /** One the fog is seen from (a party member): the fog's clouds drift only while one of these moves. */
  viewer?: boolean;
  /** Its square's side in tiles (a large creature's 2; default 1): `pos` is its top-left tile, the model stands at its center. */
  size?: number;
}

interface Entry {
  model: Model;
  obj: THREE.Group;
  /** Logical tile (the game's position). */
  pos: Pos;
  /** Where the model is drawn now, in tile coordinates (differs from `pos` while gliding). */
  at: Pos;
  yaw: number;
  targetYaw: number;
  aimSeq?: number;
  /** A glide in progress: it starts once the unit has turned to face it. */
  move?: { from: Pos; to: Pos; ms: number; t: number };
  /** Facing to turn to once the glide ends (an ability aimed mid-glide). */
  afterMoveYaw?: number;
  /** Its played animations: time into each (ms) and its length; done when t >= ms. */
  anims: Record<string, { t: number; ms: number }>;
  /** See MapUnit.viewer. */
  viewer?: boolean;
  /** See MapUnit.size. */
  size: number;
}

/** Each played animation's progress (0..1), for animateParts. */
const progressOf = (e: Entry): AnimationProgress =>
  Object.fromEntries(Object.entries(e.anims).map(([name, a]) => [name, a.ms > 0 ? Math.min(1, a.t / a.ms) : 1]));

/** Bring an entry's played animations in line with the unit's `played`: new ones start (or, `snap`, end) now. */
function syncAnimations(e: Entry, played: string[] = [], snap: boolean): boolean {
  let changed = false;
  for (const name of played) {
    if (e.anims[name]) continue;
    const ms = e.model.animations?.find((a) => a.name === name)?.ms ?? 0;
    e.anims[name] = { t: snap ? ms : 0, ms };
    changed = true;
  }
  for (const name of Object.keys(e.anims)) if (!played.includes(name)) { delete e.anims[name]; changed = true; }
  return changed;
}

/** A unit's scene object, standing upright or (loot) laid flat on the floor, with the fog's materials. */
function makeObject(u: MapUnit, fog: FogOfWar): THREE.Group {
  const obj = toThree(u.model);
  if (u.lying) layItemOnGround(obj, u.model, lootYaw());
  fog.apply(obj);
  return obj;
}

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * Draws models on a transparent canvas covering a board's box (boardLayout: the game view, GAME_CAMERA),
 * laid exactly over the DOM floor. Creatures stand with their feet at the tile center; loot lies flat,
 * centered on its tile, turned to keep its icon's screen orientation (lootYaw).
 *
 * Facing and motion are view state kept here, never in the game. When a unit's position changes, it turns
 * toward the move, then glides there (at most MAX_MOVE_MS in all); when it aims an ability (a new `aim`),
 * it turns toward the aimed tile. `onPlace` reports every change of a unit's drawn position, so DOM
 * overlays (HP bars, floor glow) can follow it. A unit's one-time animations (`played`, e.g. a chest
 * opening) play when its state calls for them. Rendering is on demand; the animation loop only runs while a
 * unit is turning, moving or animating, or while a model with spinning parts (PartSpin) is on the map.
 */
export class MapModelRenderer {
  readonly canvas: HTMLCanvasElement;
  private r: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private cam = makeGameCamera();
  private entries = new Map<string, Entry>();
  private raf = 0;
  private lastFrame = 0;
  /** Fog of war over everything on the map (fog.ts). */
  private fog: FogOfWar;

  /** Whether it has drawn a frame yet (onFirstFrame fires once, after it). */
  private drawn = false;

  /**
   * `onPlace`: every change of a unit's drawn position (DOM overlays follow it). `onFirstFrame`: once, after the
   * first frame is drawn (models and fog on screen), so the page can stop hiding the map.
   */
  constructor(private onPlace?: (id: string, at: Pos) => void, private onFirstFrame?: () => void) {
    this.r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.r.setPixelRatio(window.devicePixelRatio);
    this.r.setClearColor(0x000000, 0);
    this.canvas = this.r.domElement;
    addForgeLights(this.scene, GAME_CAMERA);
    // The fog's color: the palette's (index.css --rift-fog)
    const fogColor = getComputedStyle(document.documentElement).getPropertyValue('--rift-fog').trim() || '#050608';
    this.fog = new FogOfWar(fogColor);
    this.scene.add(this.fog.sheet);
  }

  /**
   * The fog of war (null: none; the Sanctum's is still, darkening only its edges). Tiles that change fade in or out. Its clouds drift only
   * while a party member (a `viewer` unit) moves; other redraws (an ability, a chest opening) leave them still.
   */
  setFog(fog: FogInput | null): void {
    this.fog.set(fog);
    this.requestFrame();
  }

  /** Size the canvas and camera to a board's box. */
  setBoard(board: BoardLayout): void {
    this.r.setSize(board.width, board.height);
    frameBoard(this.cam, board);
    this.requestFrame();
  }

  /** Where a unit is drawn now (tile coordinates), if it is on the map. */
  drawnAt(id: string): Pos | undefined {
    return this.entries.get(id)?.at;
  }

  /** Replace the set of units. New units appear in place; moved units turn toward their move, then glide. */
  setUnits(units: MapUnit[]): void {
    const seen = new Set<string>();
    let changed = false;
    for (const u of units) {
      seen.add(u.id);
      let e = this.entries.get(u.id);
      if (e && e.model !== u.model) {
        // Same unit, rebuilt model (e.g. new gear, or a design update in dev): swap the mesh, keep its state
        this.scene.remove(e.obj);
        disposeObject(e.obj);
        e = { ...e, model: u.model, obj: makeObject(u, this.fog) };
        this.scene.add(e.obj);
        this.entries.set(u.id, e);
        // The new object where the unit is drawn now, facing its way (a fresh object starts at the origin)
        this.place(u.id, e);
        e.obj.rotation.y = e.yaw;
        animateParts(e.obj, 0, progressOf(e));
        changed = true;
      }
      if (!e) {
        // A new unit adopts any existing aim without turning to it (a remount never replays an old attack)
        const yaw = u.lying ? lootYaw() : (u.facing ?? 0);
        e = { model: u.model, obj: makeObject(u, this.fog), pos: u.pos, at: { ...u.pos }, yaw, targetYaw: yaw, aimSeq: u.aim?.seq, anims: {}, viewer: u.viewer, size: u.size ?? 1 };
        this.scene.add(e.obj);
        this.entries.set(u.id, e);
        this.place(u.id, e);
        // A unit that appears in an animated state (a chest already looted) shows it done, not replayed
        syncAnimations(e, u.played, true);
        animateParts(e.obj, 0, progressOf(e));
        changed = true;
      } else if (u.pos.x !== e.pos.x || u.pos.y !== e.pos.y) {
        // Turn toward the new tile (from where the model is drawn now, which matters mid-glide), then glide
        const from = { ...e.at }, dx = u.pos.x - from.x, dy = u.pos.y - from.y;
        e.targetYaw = yawFromGridMove(dx, dy);
        const turnMs = (Math.abs(shortestAngle(e.yaw, e.targetYaw)) / Math.PI) * HALF_TURN_MS;
        const ms = Math.max(1, Math.min(Math.hypot(dx, dy) * MS_PER_TILE, MAX_MOVE_MS - turnMs));
        e.move = { from, to: u.pos, ms, t: 0 };
        e.afterMoveYaw = undefined;
        e.pos = u.pos;
        changed = true;
      }
      // A newly called-for animation plays from now (a new unit has already taken its state, as done)
      if (syncAnimations(e, u.played, false)) changed = true;
      // A new ability aim: turn toward the aimed tile (from wherever the unit now stands)
      if (u.aim && u.aim.seq !== e.aimSeq) {
        e.aimSeq = u.aim.seq;
        // From its center (a large unit's lies between its tiles), so it never faces a tile of itself
        const half = (e.size - 1) / 2, dx = u.aim.x - (u.pos.x + half), dy = u.aim.y - (u.pos.y + half);
        if (Math.abs(dx) > half || Math.abs(dy) > half) {
          const yaw = yawFromGridMove(dx, dy);
          // Mid-glide: finish the glide (still facing it), then turn
          if (e.move) e.afterMoveYaw = yaw;
          else e.targetYaw = yaw;
          changed = true;
        }
      }
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

  private place(id: string, e: Entry): void {
    e.obj.position.x = e.at.x + e.size / 2;
    e.obj.position.z = e.at.y + e.size / 2;
    this.onPlace?.(id, e.at);
  }

  private requestFrame(): void {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.raf = 0;
    const dt = this.lastFrame ? Math.min(now - this.lastFrame, 50) : 16;
    let animating = false;
    // A viewer (party member) turning toward a move or gliding: the fog's clouds drift with it
    let viewerMoving = false;
    for (const [id, e] of this.entries) {
      if (e.viewer && e.move) viewerMoving = true;
      // Spinning parts keep the loop running while the unit is on the map; a one-time animation while it plays
      const playing = Object.values(e.anims).some((a) => a.t < a.ms);
      for (const a of Object.values(e.anims)) a.t = Math.min(a.ms, a.t + dt);
      if (hasSpinningParts(e.obj) || (playing && hasAnimations(e.obj))) {
        animateParts(e.obj, now / 1000, progressOf(e));
        animating = true;
      }
      if (e.yaw !== e.targetYaw) {
        // Turn first: a pending glide waits until the unit faces it
        e.yaw = smoothYaw(e.yaw, e.targetYaw, dt);
        animating = true;
      } else if (e.move) {
        const m = e.move;
        m.t = Math.min(m.ms, m.t + dt);
        const k = easeInOut(m.t / m.ms);
        e.at = { x: m.from.x + (m.to.x - m.from.x) * k, y: m.from.y + (m.to.y - m.from.y) * k };
        if (m.t >= m.ms) {
          e.at = { ...m.to };
          e.move = undefined;
          if (e.afterMoveYaw !== undefined) {
            e.targetYaw = e.afterMoveYaw;
            e.afterMoveYaw = undefined;
          }
        }
        this.place(id, e);
        animating = true;
      }
      e.obj.rotation.y = e.yaw;
    }
    // The fog: tiles still fading in or out, and its drift (only while a party member moves)
    if (this.fog.step(now, viewerMoving)) animating = true;
    this.r.render(this.scene, this.cam);
    if (!this.drawn) { this.drawn = true; this.onFirstFrame?.(); }
    if (animating) {
      this.lastFrame = now;
      this.raf = requestAnimationFrame(this.frame);
    } else {
      this.lastFrame = 0;
    }
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.fog.dispose();
    for (const e of this.entries.values()) disposeObject(e.obj);
    this.entries.clear();
    this.r.dispose();
  }
}

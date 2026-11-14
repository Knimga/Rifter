import * as THREE from 'three';
import type { Model } from '../../forge/core/types';
import type { Terrain } from '../../forge/terrain/types';
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
/** How long a hit's flash lasts. */
const FLASH_MS = 120;
/** How long a unit takes to fade in as it appears (MapUnit.fadeIn). */
const FADE_IN_MS = 900;
/**
 * How high (tiles) a map object's model may rise and still lie flat on the floor (a seal carved into it): such an
 * object is drawn with the floor, under the map's tile overlays (highlights, the move line), not over them.
 */
const FLAT_HEIGHT = 0.03;

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
   * How its next move to a new tile plays, when `seq` is new (a movement ability): a 'dash' turns toward it, then glides
   * there in `ms` (fast, whatever the distance); a 'blink' fades out where it stands and back in on the new tile over
   * `ms` in all, without turning. A move with no new `seq` is a walk.
   */
  move?: { kind: 'dash' | 'blink'; ms: number; seq: number };
  /**
   * The model's one-time animations (PartAnimation) the unit's state has called for, e.g. ['open'] for a
   * looted chest. One newly listed plays; one already listed when the unit appears shows its end pose.
   */
  played?: string[];
  /** One the fog is seen from (a party member): the fog's clouds drift only while one of these moves. */
  viewer?: boolean;
  /**
   * The tiles it fills: a square's side (a large creature's 2; default 1), or [across x, across y] (a 1x2 obstacle):
   * `pos` is its top-left tile, the model stands at its center.
   */
  size?: number | readonly [number, number];
  /** A hit's flash: when it changes, the model flashes white for FLASH_MS (one already set when the unit appears doesn't). */
  flash?: number;
  /** Its model is subtly lit (a hovered door): washed a little toward white while set. */
  highlighted?: boolean;
  /** It fades in as it appears (over FADE_IN_MS), instead of being there at once (a party member stepping out of a portal). */
  fadeIn?: boolean;
  /**
   * Its `played` animations play from their start when it appears (a portal opening), instead of showing them done
   * (a chest already looted).
   */
  playIn?: boolean;
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
  /** The last movement-ability move it played (MapUnit.move's seq). */
  moveSeq?: number;
  /** A blink in progress (MapUnit.move): it fades out, appears at `to` halfway (`jumped`), and fades back in. */
  blink?: { to: Pos; ms: number; t: number; jumped: boolean };
  /** Its played animations: time into each (ms) and its length; done when t >= ms. */
  anims: Record<string, { t: number; ms: number }>;
  /** See MapUnit.viewer. */
  viewer?: boolean;
  /** See MapUnit.size: [across x, across y]. */
  size: readonly [number, number];
  /** Its last flash (MapUnit.flash), and how much of a flash in progress is left (ms). */
  flashSeq?: number;
  flashMs: number;
  /** See MapUnit.highlighted (shown again once a flash ends). */
  highlighted?: boolean;
  /** It lies flat on the floor (FLAT_HEIGHT): drawn with the terrain's floor (groundCanvas), under the tile overlays. */
  flat: boolean;
  /** How far into fading in it is (ms), while it does (MapUnit.fadeIn). */
  fadeMs?: number;
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

/** Whether a unit lies flat on the floor (a carving, a marking): a map object no taller than FLAT_HEIGHT. Loot never does. */
const isFlat = (u: MapUnit) => !u.lying && u.model.mesh.bounds.max[1] <= FLAT_HEIGHT;

/**
 * A unit's scene object, standing upright or (loot) laid flat on the floor, with the fog's materials. A flat one
 * (isFlat) keeps its own: it is drawn with the floor, which the fog sheet covers.
 */
function makeObject(u: MapUnit, fog: FogOfWar): THREE.Group {
  const obj = toThree(u.model);
  if (u.lying) layItemOnGround(obj, u.model, lootYaw());
  if (!isFlat(u)) fog.apply(obj);
  return obj;
}

/** A WebGL renderer drawing on a transparent canvas at the screen's pixel ratio (the map's canvases sit over the page). */
function transparentRenderer(): THREE.WebGLRenderer {
  const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  r.setPixelRatio(window.devicePixelRatio);
  r.setClearColor(0x000000, 0);
  return r;
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
 * opening) play when its state calls for them; a hit (`flash`) washes its model white for a moment. Rendering is on demand; the animation loop only runs while a
 * unit is turning, moving or animating, or while a model with spinning parts (PartSpin) is on the map.
 *
 * A map's terrain (forge/terrain: its 3D floor and walls) is split across two canvases, so the map's HTML
 * floor (highlights, glows, the move line) lies between them: the walls stand with the units on this canvas
 * (hiding what is behind them, fogged like them), and the floor is drawn on `groundCanvas`, laid under the HTML
 * floor; the fog sheet on this canvas covers both floors.
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
   * The terrain's floor, on its own canvas (created with the first terrain), drawn only when it or the board changes.
   * `flats`: the flat objects lying on it (isFlat), drawn over it whatever its own relief (a carving on raised stones).
   */
  private ground: { r: THREE.WebGLRenderer; scene: THREE.Scene; flats: THREE.Scene; floor?: THREE.Object3D; dirty: boolean } | null = null;
  /** The terrain's walls, in this scene. */
  private walls: THREE.Object3D | null = null;

  /**
   * `onPlace`: every change of a unit's drawn position (DOM overlays follow it). `onFirstFrame`: once, after the
   * first frame is drawn (models and fog on screen), so the page can stop hiding the map.
   */
  constructor(private onPlace?: (id: string, at: Pos) => void, private onFirstFrame?: () => void) {
    this.r = transparentRenderer();
    this.canvas = this.r.domElement;
    addForgeLights(this.scene, GAME_CAMERA);
    // The fog's color: the palette's (index.css --rift-fog)
    const fogColor = getComputedStyle(document.documentElement).getPropertyValue('--rift-fog').trim() || '#000000';
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
    if (this.ground) {
      this.ground.r.setSize(board.width, board.height);
      this.ground.dirty = true;
    }
    frameBoard(this.cam, board);
    this.requestFrame();
  }

  /** The canvas the terrain's floor is drawn on (lay it under the map's HTML floor), once a terrain is set. */
  get groundCanvas(): HTMLCanvasElement | null {
    return this.ground?.r.domElement ?? null;
  }

  /** The map's terrain (null: none, e.g. a forge view): its walls here, its floor on groundCanvas. */
  setTerrain(terrain: Terrain | null): void {
    if (this.walls) {
      this.scene.remove(this.walls);
      disposeObject(this.walls);
      this.walls = null;
    }
    if (this.ground?.floor) {
      this.ground.scene.remove(this.ground.floor);
      disposeObject(this.ground.floor);
      this.ground.floor = undefined;
    }
    if (terrain) {
      this.walls = toThree(terrain.walls);
      this.fog.apply(this.walls);
      this.scene.add(this.walls);
      if (!this.ground) {
        const r = transparentRenderer();
        const size = this.r.getSize(new THREE.Vector2());
        r.setSize(size.x, size.y);
        r.autoClear = false; // the floor, then its flat objects over it (frame)
        const scene = new THREE.Scene(), flats = new THREE.Scene();
        addForgeLights(scene, GAME_CAMERA);
        addForgeLights(flats, GAME_CAMERA);
        this.ground = { r, scene, flats, dirty: true };
        // Flat objects added before there was a floor to lie on move to it
        for (const e of this.entries.values()) if (e.flat) { e.obj.removeFromParent(); this.addObject(e); }
      }
      // Not fogged: the fog sheet over the HTML floor covers it
      this.ground.floor = toThree(terrain.floor);
      this.ground.scene.add(this.ground.floor);
    }
    if (this.ground) this.ground.dirty = true;
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
        this.removeObject(e);
        disposeObject(e.obj);
        // (Its highlight is applied to the new object below)
        e = { ...e, model: u.model, obj: makeObject(u, this.fog), flat: isFlat(u), highlighted: undefined };
        this.addObject(e);
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
        e = { model: u.model, obj: makeObject(u, this.fog), pos: u.pos, at: { ...u.pos }, yaw, targetYaw: yaw, aimSeq: u.aim?.seq, moveSeq: u.move?.seq, anims: {}, viewer: u.viewer, size: typeof u.size === 'object' ? u.size : [u.size ?? 1, u.size ?? 1], flashSeq: u.flash, flashMs: 0, flat: isFlat(u) };
        if (u.fadeIn) {
          e.fadeMs = 0;
          this.fog.fade(e.obj, 0);
        }
        this.addObject(e);
        this.entries.set(u.id, e);
        this.place(u.id, e);
        // A unit that appears in an animated state (a chest already looted) shows it done, not replayed; one that
        // plays in (a portal opening) plays it from now
        syncAnimations(e, u.played, !u.playIn);
        animateParts(e.obj, 0, progressOf(e));
        changed = true;
      } else if (u.pos.x !== e.pos.x || u.pos.y !== e.pos.y) {
        // A movement ability's move (a new `move`) plays as it asks; any other is a walk
        const ability = u.move && u.move.seq !== e.moveSeq ? u.move : undefined;
        if (u.move) e.moveSeq = u.move.seq;
        if (ability?.kind === 'blink') {
          // Fade out here, appear on the new tile halfway, fade back in (frame)
          e.blink = { to: { ...u.pos }, ms: Math.max(2, ability.ms), t: 0, jumped: false };
          e.move = undefined;
          e.afterMoveYaw = undefined;
        } else {
          // Turn toward the new tile (from where the model is drawn now, which matters mid-glide), then glide
          const from = { ...e.at }, dx = u.pos.x - from.x, dy = u.pos.y - from.y;
          e.targetYaw = yawFromGridMove(dx, dy);
          const turnMs = (Math.abs(shortestAngle(e.yaw, e.targetYaw)) / Math.PI) * HALF_TURN_MS;
          const ms = ability ? Math.max(1, ability.ms) : Math.max(1, Math.min(Math.hypot(dx, dy) * MS_PER_TILE, MAX_MOVE_MS - turnMs));
          e.move = { from, to: u.pos, ms, t: 0 };
          e.afterMoveYaw = undefined;
        }
        e.pos = u.pos;
        changed = true;
      }
      // A new hit: the model flashes (starting over if it already is)
      if (u.flash !== undefined && u.flash !== e.flashSeq) {
        e.flashSeq = u.flash;
        if (!e.flashMs) this.fog.wash(e.obj, 'flash');
        e.flashMs = FLASH_MS;
        changed = true;
      }
      // Highlighted (a hovered door) or no longer: a flash in progress keeps showing until it ends
      if (!!u.highlighted !== !!e.highlighted) {
        e.highlighted = !!u.highlighted;
        if (!e.flashMs) this.fog.wash(e.obj, e.highlighted ? 'highlight' : null);
        changed = true;
      }
      // A newly called-for animation plays from now (a new unit has already taken its state, as done)
      if (syncAnimations(e, u.played, false)) changed = true;
      // A new ability aim: turn toward the aimed tile (from wherever the unit now stands)
      if (u.aim && u.aim.seq !== e.aimSeq) {
        e.aimSeq = u.aim.seq;
        // From its center (a large unit's lies between its tiles), so it never faces a tile of itself
        const hx = (e.size[0] - 1) / 2, hy = (e.size[1] - 1) / 2, dx = u.aim.x - (u.pos.x + hx), dy = u.aim.y - (u.pos.y + hy);
        if (Math.abs(dx) > hx || Math.abs(dy) > hy) {
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
      this.removeObject(e);
      disposeObject(e.obj);
      this.entries.delete(id);
      changed = true;
    }
    if (changed) this.requestFrame();
  }

  /** Put an entry's object in its scene: the floor's (groundCanvas) for a flat one, once there is one; else this one. */
  private addObject(e: Entry): void {
    if (e.flat && this.ground) {
      this.ground.flats.add(e.obj);
      this.ground.dirty = true;
    } else this.scene.add(e.obj);
  }

  private removeObject(e: Entry): void {
    if (this.ground && e.obj.parent === this.ground.flats) this.ground.dirty = true;
    if (e.fadeMs !== undefined || e.blink) this.fog.fade(e.obj, 1); // drops its faded materials' copies
    e.obj.removeFromParent();
  }

  private place(id: string, e: Entry): void {
    e.obj.position.x = e.at.x + e.size[0] / 2;
    e.obj.position.z = e.at.y + e.size[1] / 2;
    if (e.flat && this.ground) this.ground.dirty = true;
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
      if (e.blink) {
        const b = e.blink, half = b.ms / 2;
        b.t = Math.min(b.ms, b.t + dt);
        if (!b.jumped && b.t >= half) {
          b.jumped = true;
          e.at = { ...b.to };
          this.place(id, e);
        }
        this.fog.fade(e.obj, b.t >= b.ms ? 1 : b.t < half ? 1 - b.t / half : (b.t - half) / half);
        if (b.t >= b.ms) e.blink = undefined;
        animating = true;
      }
      e.obj.rotation.y = e.yaw;
      if (e.fadeMs !== undefined) {
        e.fadeMs = Math.min(FADE_IN_MS, e.fadeMs + dt);
        this.fog.fade(e.obj, e.fadeMs / FADE_IN_MS);
        if (e.fadeMs >= FADE_IN_MS) e.fadeMs = undefined;
        animating = true;
      }
      if (e.flashMs > 0) {
        e.flashMs = Math.max(0, e.flashMs - dt);
        if (!e.flashMs) this.fog.wash(e.obj, e.highlighted ? 'highlight' : null);
        animating = true;
      }
    }
    // The fog: tiles still fading in or out, and its drift (only while a party member moves)
    if (this.fog.step(now, viewerMoving)) animating = true;
    this.r.render(this.scene, this.cam);
    if (this.ground?.dirty) {
      // The floor, then (its depth cleared) the flat objects lying on it, always over it
      const g = this.ground;
      g.r.clear();
      g.r.render(g.scene, this.cam);
      g.r.clearDepth();
      g.r.render(g.flats, this.cam);
      this.ground.dirty = false;
    }
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
    if (this.walls) disposeObject(this.walls);
    if (this.ground?.floor) disposeObject(this.ground.floor);
    this.ground?.r.dispose();
    this.r.dispose();
  }
}

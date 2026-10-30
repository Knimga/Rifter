import type { EnemyClassData, EnemyInstance } from '../units/enemies';
import type { Item } from '../gear';
import type { RGB } from '../../forge/core/vec';
import { bodySize, creatureTiles, generateEnemyInstance } from '../units/enemies';
import { findOpenTilesNear, fits, footprint, keyPos, neighbors, posKey, reachableTiles, STEPS, type Pos } from './grid';
import { chance, pick, randFloat, randInt, shuffle } from '../random';
import { AGGRO_RANGE } from '../constants';
import { BASE_MOVEMENT } from '../units/stats';

// ─── Core Types ──────────────────────────────────────────────────────────────

export interface Room {
  id: number;
  x: number;   // top-left floor tile x
  y: number;   // top-left floor tile y
  w: number;   // floor width (inclusive tile count)
  h: number;   // floor height (inclusive tile count)
}

export interface Door {
  id: string;            // e.g. "door-0"
  pos: Pos;              // wall tile position in this zone
  targetZoneId: number;  // which zone this door leads to
  targetDoorId: string;  // paired door id in target zone
}

export interface ZoneData {
  id: number;
  width: number;
  height: number;
  floors: Set<string>;   // "x,y" keys for all walkable tiles
  rooms: Room[];
  doors: Door[];
  /** Wall tiles standing in the middle of rooms (IslandConfig): never door spots. */
  islands: Set<string>;
  droppedItems: Record<string, Item[]>; // "x,y" → items dropped at that tile
  /** "x,y" → the rift key lying on that tile (a dungeon key: whose key it is), dropped by a boss. One per tile. */
  droppedKeys: Record<string, string>;
  /** "x,y" → the gold lying on that tile (data/gear/loot.ts), dropped by enemies: one pile a tile, adding up. */
  droppedGold: Record<string, number>;
}

/**
 * A container on the map (a chest, a dead adventurer: data/gear/containers.ts): its id (keys its contents), zone,
 * tile, look (INTERACTIVE_OBJECTS id) and the floor side it faces.
 */
export interface DungeonChest {
  id: string;
  zoneId: number;
  pos: Pos;
  object: string;
  /** Grid direction it faces (away from the wall at its back), e.g. [0, 1] = south. */
  facing: readonly [number, number];
}

/** A rift back to the Sanctum: one where the party arrives (the first zone), one past the boss (its antechamber). */
export interface DungeonRift {
  zoneId: number;
  pos: Pos;
}

export interface DungeonData {
  zones: ZoneData[];
  startZoneId: number;
  endZoneId: number;     // the boss zone
  /** The leader's tile on arrival, beside the first zone's rift (the followers take the tiles around it). */
  playerStart: Pos;
  /** The ways back to the Sanctum, at most one per zone (zoneRift). */
  rifts: DungeonRift[];
  /** Containers (chests and the like), where each zone's config places them (placeContainers). */
  chests: DungeonChest[];
  /** The party's level when it entered: the first zone's enemies are this level, each zone after one higher; loot is this level. */
  level: number;
}

/**
 * Tiles of a zone that a map object stands on (a rift, chests): nobody walks onto or through
 * them, party or enemy. They stay floor (drawn as floor; they don't block sight or AoE). The Sanctum's
 * blockers are handled the same way by isSanctumWalkable.
 */
export const objectTilesOf = (d: DungeonData, zone: ZoneData): Set<string> => new Set([
  ...d.rifts.filter(r => r.zoneId === zone.id).map(r => posKey(r.pos)),
  ...d.chests.filter(c => c.zoneId === zone.id).map(c => posKey(c.pos)),
]);

/** The zone's rift back to the Sanctum, if it has one. */
export const zoneRift = (d: DungeonData, zoneId: number): Pos | null => d.rifts.find(r => r.zoneId === zoneId)?.pos ?? null;

/** Walkable tiles of a zone: floor without a map object on it. */
export function zoneWalkable(d: DungeonData, zone: ZoneData): (p: Pos) => boolean {
  const objects = objectTilesOf(d, zone);
  return (p) => zone.floors.has(posKey(p)) && !objects.has(posKey(p));
}

/** A tile of `zone` where a party member can be placed: walkable, with no living enemy of that zone on it. */
export function isFreeFloor(d: DungeonData, zone: ZoneData, enemies: EnemyInstance[]): (p: Pos) => boolean {
  const walkable = zoneWalkable(d, zone);
  const taken = creatureTiles(enemies.filter(e => e.zoneId === zone.id && e.currentHp > 0));
  return (p) => walkable(p) && !taken.has(posKey(p));
}

// ─── Config Types ─────────────────────────────────────────────────────────────

/**
 * Islands: small clusters of wall tiles standing in the middle of rooms (pillars, boulders, giant fungus). Each is
 * a connected blob of `size` tiles; islands never touch each other or the room's walls (always at least one floor
 * tile between them, diagonals included), so they never block the way. Many single-tile islands, or a few big ones.
 */
export interface IslandConfig {
  /** Share of the zone's rooms that get islands (0..1); the rest have none. */
  roomChance: number;
  /** Tiles per island: [min, max]. */
  size: [number, number];
  /** Share of a room's floor to turn into islands (0..1), as far as they fit with their gaps. */
  density: number;
}

export interface ZoneConfig {
  minRoomSize: number;
  maxRoomSize: number;
  splitDepth: number;
  /** Width of the corridors ('rooms'), of the openings between rooms ('caverns'), or of the tunnels ('tunnels'). */
  corridorWidth: number;
  /**
   * How the rooms are shaped and joined. 'rooms' (default): rectangles joined by straight corridors. 'caverns':
   * round, organic rooms, each nearly filling its space, joined to their neighbours by short openings. 'tunnels':
   * round rooms of any size in the range (small ones leave rock around them) joined by long winding tunnels.
   */
  layout?: 'rooms' | 'caverns' | 'tunnels';
  /** Wall islands inside rooms (none if absent). */
  islands?: IslandConfig;
  /**
   * The zone's enemy groups: ROOM_FILL_SHARE of the zone's rooms (all but the one the party enters by) get one
   * group each, cycling through this list (reshuffled each time round) until those rooms are filled. Never two
   * groups in one room.
   */
  enemyGroups: EnemyClassData[][];
  /**
   * Containers in the zone (INTERACTIVE_OBJECTS ids, e.g. 'worn-treasure-chest', 'dead-adventurer'), one each; list
   * one twice for two. Each stands against a wall in a room the party doesn't enter the zone by, as far from its
   * entry as fits (placeContainers). None if absent.
   */
  containers?: string[];
}

export interface BossZoneConfig {
  roomSize: number;       // boss room is a square of this side length (a cavern: round, within that square)
  corridorWidth: number;  // corridor (or, for caverns, opening) connecting boss room to antechamber
  /** The boss room and its antechamber: rectangles joined by a corridor ('rooms', default), or caverns ('caverns'). */
  layout?: 'rooms' | 'caverns';
  /** The boss first, then its guard: the boss in the boss room's center, the rest flanking it (spawnDungeonEnemies). */
  bossGroup: EnemyClassData[];
  /** Containers in the boss room (as ZoneConfig.containers), against its walls, far from its door. */
  containers?: string[];
}

export interface DungeonConfig {
  name: string;
  width: number;          // applies to all regular zones
  height: number;         // applies to all regular zones
  zones: ZoneConfig[];    // regular zones, chained linearly: 0 → 1 → … → boss
  bossZone: BossZoneConfig;
  floorColor: string;     // hex color for walkable floor tiles
  wallColor: string;      // hex color for wall/non-floor tiles
  doorObject: string;     // INTERACTIVE_OBJECTS id of the doors between zones
  /**
   * The dungeon's color: the Sanctum's rift into it and its keystone are painted in it (data/world/rifts.ts; its
   * rifts back to the Sanctum are SANCTUM_RIFT_COLOR). Bright and saturated: the rift's deeper swirl and floor pool derive from it.
   */
  riftColor: RGB;
  /** Its rift key's name ("Necrotic Key"): the key that opens a rift to it (data/world/rifts.ts), painted in riftColor. */
  keyName: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Rect = Pick<Room, 'x' | 'y' | 'w' | 'h'>;

/** The four straight steps (no diagonals). */
const DIRS4 = STEPS.slice(0, 4);

/** Whether `p` lies inside the rectangle. */
const inRect = (p: Pos, r: Rect) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

function roomCenter(room: Rect): Pos {
  return {
    x: Math.floor(room.x + room.w / 2),
    y: Math.floor(room.y + room.h / 2),
  };
}

function fillRect(floors: Set<string>, r: Rect): void {
  for (let x = r.x; x < r.x + r.w; x++) {
    for (let y = r.y; y < r.y + r.h; y++) floors.add(posKey({ x, y }));
  }
}

/** A room's floor tiles (within its rectangle: a cavern's or one with islands isn't all floor). */
function roomFloor(zone: Pick<ZoneData, 'floors'>, room: Rect): Pos[] {
  const tiles: Pos[] = [];
  for (let x = room.x; x < room.x + room.w; x++)
    for (let y = room.y; y < room.y + room.h; y++) if (zone.floors.has(posKey({ x, y }))) tiles.push({ x, y });
  return tiles;
}

/**
 * The room's floor tile nearest its center (its center, unless that's an island or outside a cavern's shape).
 * `open`: only among the tiles with floor all around them, if there are any (a map object stood there never cuts a way off).
 */
function roomSpot(zone: Pick<ZoneData, 'floors'>, room: Rect, open = false): Pos {
  const c = roomCenter(room);
  let best = c, bestD = Infinity;
  const floor = roomFloor(zone, room);
  const isOpen = (p: Pos) => neighbors(p).every(q => zone.floors.has(posKey(q)));
  const spots = open && floor.some(isOpen) ? floor.filter(isOpen) : floor;
  for (const p of spots) {
    const d = (p.x - c.x) ** 2 + (p.y - c.y) ** 2;
    if (d < bestD) { best = p; bestD = d; }
  }
  return best;
}

// ─── BSP ─────────────────────────────────────────────────────────────────────

interface BSPNode {
  x: number; y: number; w: number; h: number;
  left?: BSPNode;
  right?: BSPNode;
  room?: Room;
}

function splitBSP(
  node: BSPNode,
  depth: number,
  zoneConfig: Pick<ZoneConfig, 'minRoomSize' | 'maxRoomSize' | 'layout'>,
  nextId: { value: number },
): void {
  const minLeaf = zoneConfig.minRoomSize + 2; // room + 1 tile padding each side

  if (depth > 0) {
    const canSplitH = node.h >= minLeaf * 2;
    const canSplitV = node.w >= minLeaf * 2;

    if (canSplitH || canSplitV) {
      let splitH: boolean;
      if (canSplitH && canSplitV) {
        splitH = node.h > node.w ? true : node.w > node.h ? false : chance(0.5);
      } else {
        splitH = canSplitH;
      }

      if (splitH) {
        const at = randInt(minLeaf, node.h - minLeaf);
        node.left  = { x: node.x, y: node.y, w: node.w, h: at };
        node.right = { x: node.x, y: node.y + at, w: node.w, h: node.h - at };
      } else {
        const at = randInt(minLeaf, node.w - minLeaf);
        node.left  = { x: node.x, y: node.y, w: at, h: node.h };
        node.right = { x: node.x + at, y: node.y, w: node.w - at, h: node.h };
      }

      splitBSP(node.left, depth - 1, zoneConfig, nextId);
      splitBSP(node.right, depth - 1, zoneConfig, nextId);
      return;
    }
  }

  // Leaf — create room
  const maxW = Math.min(zoneConfig.maxRoomSize, node.w - 2);
  const maxH = Math.min(zoneConfig.maxRoomSize, node.h - 2);
  if (maxW < zoneConfig.minRoomSize || maxH < zoneConfig.minRoomSize) return;

  // A cavern nearly fills its space, so its neighbours are close and the openings between them short
  const cavern = zoneConfig.layout === 'caverns';
  const rw = randInt(cavern ? Math.max(zoneConfig.minRoomSize, maxW - 1) : zoneConfig.minRoomSize, maxW);
  const rh = randInt(cavern ? Math.max(zoneConfig.minRoomSize, maxH - 1) : zoneConfig.minRoomSize, maxH);
  const rx = node.x + 1 + randInt(0, node.w - 2 - rw);
  const ry = node.y + 1 + randInt(0, node.h - 2 - rh);

  node.room = { id: nextId.value++, x: rx, y: ry, w: rw, h: rh };
}

function collectRooms(node: BSPNode): Room[] {
  if (node.room) return [node.room];
  const rooms: Room[] = [];
  if (node.left) rooms.push(...collectRooms(node.left));
  if (node.right) rooms.push(...collectRooms(node.right));
  return rooms;
}

// ─── Corridors ───────────────────────────────────────────────────────────────

/**
 * Straight corridor of `width` tiles. 'h' runs along x from `from` to `to` at row `at`;
 * 'v' runs along y at column `at`. The corridor is centred on `at`.
 */
function drawCorridor(axis: 'h' | 'v', from: number, to: number, at: number, floors: Set<string>, width: number): void {
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);
  const offset = -Math.floor((width - 1) / 2);
  for (let i = lo; i <= hi; i++) {
    for (let w = 0; w < width; w++) {
      floors.add(axis === 'h' ? posKey({ x: i, y: at + offset + w }) : posKey({ x: at + offset + w, y: i }));
    }
  }
}

function connectBSP(node: BSPNode, floors: Set<string>, corridorWidth: number): void {
  if (!node.left || !node.right) return;

  connectBSP(node.left, floors, corridorWidth);
  connectBSP(node.right, floors, corridorWidth);

  // Connect one room from each subtree with an L-shaped corridor
  const leftRooms = collectRooms(node.left);
  const rightRooms = collectRooms(node.right);
  if (leftRooms.length === 0 || rightRooms.length === 0) return;

  const a = roomCenter(pick(leftRooms));
  const b = roomCenter(pick(rightRooms));

  if (chance(0.5)) {
    drawCorridor('h', a.x, b.x, a.y, floors, corridorWidth);
    drawCorridor('v', a.y, b.y, b.x, floors, corridorWidth);
  } else {
    drawCorridor('v', a.y, b.y, a.x, floors, corridorWidth);
    drawCorridor('h', a.x, b.x, b.y, floors, corridorWidth);
  }
}

// ─── Caverns ─────────────────────────────────────────────────────────────────

/**
 * A round, organic room in its rectangle: an oval whose edge wobbles (a few slow waves around it), clipped to
 * the rectangle.
 */
function carveCavern(floors: Set<string>, room: Rect): void {
  const cx = room.x + room.w / 2, cy = room.y + room.h / 2, rx = room.w / 2, ry = room.h / 2;
  const waves = [2, 3, 5].map((k, i) => ({ k, amp: randFloat(0.03, [0.1, 0.08, 0.05][i]), phase: randFloat(0, Math.PI * 2) }));
  for (let x = room.x; x < room.x + room.w; x++) {
    for (let y = room.y; y < room.y + room.h; y++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, a = Math.atan2(dy, dx);
      const edge = 1 + waves.reduce((sum, w) => sum + w.amp * Math.sin(w.k * a + w.phase), 0);
      if (Math.hypot(dx, dy) <= edge) floors.add(posKey({ x, y }));
    }
  }
}

/**
 * An opening of `width` tiles from `a` to `b` (a straight run of a square brush), within the zone's inner
 * tiles (its outer ring stays wall).
 */
function carveOpening(floors: Set<string>, a: Pos, b: Pos, width: number, zw: number, zh: number): void {
  const off = -Math.floor((width - 1) / 2);
  const steps = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y), 1);
  const stamp = (px: number, py: number) => {
    for (let ox = 0; ox < width; ox++)
      for (let oy = 0; oy < width; oy++) {
        const x = px + off + ox, y = py + off + oy;
        if (x >= 1 && y >= 1 && x < zw - 1 && y < zh - 1) floors.add(posKey({ x, y }));
      }
  };
  let last: Pos | null = null;
  for (let i = 0; i <= steps; i++) {
    const px = Math.round(a.x + ((b.x - a.x) * i) / steps), py = Math.round(a.y + ((b.y - a.y) * i) / steps);
    // A 1-wide line's diagonal step only touches at a corner, which can't be walked through (canStep): fill one
    // of the two tiles beside it. A wider brush already overlaps itself there.
    if (width === 1 && last && last.x !== px && last.y !== py) stamp(px, last.y);
    stamp(px, py);
    last = { x: px, y: py };
  }
}

/**
 * Open two caverns (their floor tiles `A`, `B`) into each other by the shortest way: an opening between the
 * closest pair of tiles (a random one among the pairs within a tile of the closest).
 */
function openBetween(floors: Set<string>, A: Pos[], B: Pos[], width: number, zw: number, zh: number): void {
  if (A.length === 0 || B.length === 0) return;
  let best = Infinity;
  const pairs: { a: Pos; b: Pos; d: number }[] = [];
  for (const a of A) for (const b of B) {
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (d <= best + 1) { pairs.push({ a, b, d }); best = Math.min(best, d); }
  }
  const { a, b } = pick(pairs.filter(p => p.d <= best + 1));
  carveOpening(floors, a, b, width, zw, zh);
}

/**
 * Join the caverns of the two halves of every split, like connectBSP but by the shortest way (openBetween), so
 * neighbouring rooms open into each other instead of being joined by long hallways.
 */
function connectCaverns(node: BSPNode, floors: Set<string>, width: number, zw: number, zh: number): void {
  if (!node.left || !node.right) return;
  connectCaverns(node.left, floors, width, zw, zh);
  connectCaverns(node.right, floors, width, zw, zh);
  const tilesOf = (n: BSPNode) => collectRooms(n).flatMap(room => roomFloor({ floors }, room));
  openBetween(floors, tilesOf(node.left), tilesOf(node.right), width, zw, zh);
}

/**
 * Round off the cavern's edges once: a wall tile with at least 5 of its 8 neighbours floor becomes floor (fills
 * notches where openings meet rooms). The zone's outer ring stays wall.
 */
function smoothCaverns(floors: Set<string>, zw: number, zh: number): void {
  const add: string[] = [];
  for (let x = 1; x < zw - 1; x++) {
    for (let y = 1; y < zh - 1; y++) {
      if (floors.has(posKey({ x, y }))) continue;
      if (neighbors({ x, y }).filter(q => floors.has(posKey(q))).length >= 5) add.push(posKey({ x, y }));
    }
  }
  for (const k of add) floors.add(k);
}

// ─── Tunnels ─────────────────────────────────────────────────────────────────

/** How often a tunnel veers off sideways at a step, and how many steps a veer lasts: [fewest, most]. */
const TUNNEL_VEER_CHANCE = 0.18, TUNNEL_VEER_STEPS: [number, number] = [2, 4];

/**
 * A winding tunnel `width` tiles wide from `a` to `b`: it steps toward `b` (along the axis with more of the way
 * left, mostly), now and then veering sideways for a few steps, so it wanders instead of running straight. Within
 * the zone's inner tiles (its outer ring stays wall).
 */
function carveTunnel(floors: Set<string>, a: Pos, b: Pos, width: number, zw: number, zh: number): void {
  const lo = 1 - Math.floor((width - 1) / 2), hiX = zw - 2 - Math.ceil((width - 1) / 2), hiY = zh - 2 - Math.ceil((width - 1) / 2);
  const inside = (q: Pos) => q.x >= lo && q.y >= lo && q.x <= hiX && q.y <= hiY;
  let p = a, veer: Pos | null = null, veerLeft = 0;
  carveOpening(floors, p, p, width, zw, zh);
  for (let guard = 0; guard < 4 * (zw + zh) && (p.x !== b.x || p.y !== b.y); guard++) {
    const dx = b.x - p.x, dy = b.y - p.y;
    if (veerLeft === 0 && chance(TUNNEL_VEER_CHANCE)) {
      // Sideways to the way it is mostly going
      const side = chance(0.5) ? 1 : -1;
      veer = Math.abs(dx) >= Math.abs(dy) ? { x: 0, y: side } : { x: side, y: 0 };
      veerLeft = randInt(...TUNNEL_VEER_STEPS);
    }
    let step: Pos;
    if (veerLeft > 0 && veer) { step = veer; veerLeft--; }
    else step = chance(Math.abs(dx) / (Math.abs(dx) + Math.abs(dy))) ? { x: Math.sign(dx), y: 0 } : { x: 0, y: Math.sign(dy) };
    const next = { x: p.x + step.x, y: p.y + step.y };
    if (!inside(next)) { veerLeft = 0; continue; }
    p = next;
    carveOpening(floors, p, p, width, zw, zh);
  }
  // A walk that ran out of steps finishes straight
  carveOpening(floors, p, b, width, zw, zh);
}

/** Join the two halves of every split with a winding tunnel (carveTunnel) between their closest rooms, so each tunnel stays local. */
function connectTunnels(node: BSPNode, floors: Set<string>, width: number, zw: number, zh: number): void {
  if (!node.left || !node.right) return;
  connectTunnels(node.left, floors, width, zw, zh);
  connectTunnels(node.right, floors, width, zw, zh);
  let best: [Pos, Pos] | null = null, bestD = Infinity;
  for (const a of collectRooms(node.left).map(roomCenter))
    for (const b of collectRooms(node.right).map(roomCenter)) {
      const d = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      if (d < bestD) { best = [a, b]; bestD = d; }
    }
  if (best) carveTunnel(floors, best[0], best[1], width, zw, zh);
}

// ─── Islands ─────────────────────────────────────────────────────────────────

/** True if every floor tile of the zone can be walked to from every other (by the movement rules). */
function allConnected(floors: Set<string>): boolean {
  const first = floors.values().next().value;
  if (first === undefined) return true;
  return reachableTiles(keyPos(first), Infinity, p => floors.has(posKey(p))).size === floors.size;
}

/**
 * Islands in a share of the rooms (IslandConfig): in each, blobs of wall grown from random floor tiles until
 * about `density` of its floor is island. An island tile needs all 8 tiles around it to be floor (or its own
 * island), so islands keep a gap of at least one tile from the walls and each other; an island is kept only if
 * every floor tile of the zone can still be walked to.
 */
function placeIslands(zone: ZoneData, cfg: IslandConfig): void {
  const { floors, islands } = zone;
  for (const room of zone.rooms) {
    if (!chance(cfg.roomChance)) continue;
    const roomTiles = roomFloor(zone, room);
    let left = Math.round(roomTiles.length * cfg.density);
    // Never smaller than the size range allows: once the room's share left is below it, the room is done
    for (let tries = 0; left >= cfg.size[0] && tries < 40; tries++) {
      const own = new Set<string>();
      const fits = (p: Pos) => floors.has(posKey(p)) && !own.has(posKey(p)) && neighbors(p).every(q => floors.has(posKey(q)) || own.has(posKey(q)));
      const seeds = roomTiles.filter(fits);
      if (seeds.length === 0) break;
      const target = Math.min(left, randInt(cfg.size[0], cfg.size[1]));
      const grown = [pick(seeds)];
      own.add(posKey(grown[0]));
      while (own.size < target) {
        const next = grown.flatMap(p => DIRS4.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))).filter(fits);
        if (next.length === 0) break;
        const p = pick(next);
        grown.push(p);
        own.add(posKey(p));
      }
      // Too little room to grow to its minimum: not placed
      if (own.size < cfg.size[0]) continue;
      for (const k of own) floors.delete(k);
      if (!allConnected(floors)) {
        for (const k of own) floors.add(k);
        continue;
      }
      for (const k of own) islands.add(k);
      left -= own.size;
    }
  }
}

// ─── Regular Zone Generator ──────────────────────────────────────────────────

function generateZone(id: number, width: number, height: number, zoneConfig: ZoneConfig): ZoneData {
  const nextId = { value: 0 };
  const root: BSPNode = { x: 1, y: 1, w: width - 2, h: height - 2 };

  splitBSP(root, zoneConfig.splitDepth, zoneConfig, nextId);

  const rooms = collectRooms(root);
  const floors = new Set<string>();
  if (zoneConfig.layout === 'caverns') {
    rooms.forEach(r => carveCavern(floors, r));
    connectCaverns(root, floors, zoneConfig.corridorWidth, width, height);
    smoothCaverns(floors, width, height);
  } else if (zoneConfig.layout === 'tunnels') {
    rooms.forEach(r => carveCavern(floors, r));
    connectTunnels(root, floors, zoneConfig.corridorWidth, width, height);
  } else {
    rooms.forEach(r => fillRect(floors, r));
    connectBSP(root, floors, zoneConfig.corridorWidth);
  }

  const zone: ZoneData = { id, width, height, floors, rooms, doors: [], islands: new Set(), droppedItems: {}, droppedKeys: {}, droppedGold: {} };
  if (zoneConfig.islands) placeIslands(zone, zoneConfig.islands);
  return zone;
}

// ─── Boss Zone Generator ──────────────────────────────────────────────────────

const ANTECHAMBER_SIZE = 5;
// Enough padding on all 4 sides for: 1 border + antechamber + corridor gap
const BOSS_ZONE_PADDING = 9;

type CardinalDir = 'north' | 'south' | 'east' | 'west';

/**
 * Which side of the boss room its door is on: the way from the room's middle toward the door, mostly (a round
 * room's door can sit inside its square's corners, so the square's sides can't tell).
 */
function getEntryDirection(doorPos: Pos, bossRoom: Room): CardinalDir {
  const dx = doorPos.x + 0.5 - (bossRoom.x + bossRoom.w / 2), dy = doorPos.y + 0.5 - (bossRoom.y + bossRoom.h / 2);
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'north' : 'south';
  return dx < 0 ? 'west' : 'east';
}

/** Generates just the main boss room. Antechamber is added after door placement. */
function generateBossZoneMain(id: number, config: BossZoneConfig): { zone: ZoneData; bossRoom: Room } {
  const zoneSize = config.roomSize + BOSS_ZONE_PADDING * 2;
  const half = Math.floor((zoneSize - config.roomSize) / 2);
  const bossRoom: Room = { id: 0, x: half, y: half, w: config.roomSize, h: config.roomSize };
  const floors = new Set<string>();
  if (config.layout === 'caverns') carveCavern(floors, bossRoom);
  else fillRect(floors, bossRoom);
  return {
    zone: { id, width: zoneSize, height: zoneSize, floors, rooms: [bossRoom], doors: [], islands: new Set(), droppedItems: {}, droppedKeys: {}, droppedGold: {} },
    bossRoom,
  };
}

/**
 * Adds an antechamber (small room) in a random cardinal direction that is not
 * the entry direction, connects it with a corridor, and returns the rift position.
 * Caverns: the antechamber is a cavern too, opening into the boss room by the shortest way (no corridor).
 */
function addBossAntechamber(
  zone: ZoneData,
  bossRoom: Room,
  entryDir: CardinalDir,
  corridorWidth: number,
  layout: BossZoneConfig['layout'] = 'rooms',
): Pos {
  const dir = pick((['north', 'south', 'east', 'west'] as const).filter(d => d !== entryDir));
  const { x: cx, y: cy } = roomCenter(bossRoom);
  const A = ANTECHAMBER_SIZE;

  // Antechamber placement against the zone edge, and the corridor back to the boss room wall
  const placement: Record<CardinalDir, { room: Rect; corridor: Parameters<typeof drawCorridor>[0]; from: number; to: number; at: number }> = {
    north: { room: { x: cx - Math.floor(A / 2), y: 1, w: A, h: A },                       corridor: 'v', from: 1 + A,                   to: bossRoom.y - 1,               at: cx },
    south: { room: { x: cx - Math.floor(A / 2), y: zone.height - 1 - A, w: A, h: A },     corridor: 'v', from: bossRoom.y + bossRoom.h, to: zone.height - 1 - A - 1,      at: cx },
    east:  { room: { x: zone.width - 1 - A, y: cy - Math.floor(A / 2), w: A, h: A },      corridor: 'h', from: bossRoom.x + bossRoom.w, to: zone.width - 1 - A - 1,       at: cy },
    west:  { room: { x: 1, y: cy - Math.floor(A / 2), w: A, h: A },                       corridor: 'h', from: 1 + A,                   to: bossRoom.x - 1,               at: cy },
  };
  const { room, corridor, from, to, at } = placement[dir];
  zone.rooms.push({ id: 1, ...room });

  if (layout === 'caverns') {
    carveCavern(zone.floors, room);
    openBetween(zone.floors, roomFloor(zone, bossRoom), roomFloor(zone, room), corridorWidth, zone.width, zone.height);
    smoothCaverns(zone.floors, zone.width, zone.height);
    return roomSpot(zone, room);
  }
  drawCorridor(corridor, from, to, at, zone.floors, corridorWidth);
  fillRect(zone.floors, room);
  return roomCenter(room);
}

// ─── Door Placement ─────────────────────────────────────────────────────────

/**
 * Where a door can go: a wall tile set into the edge of a room's floor (deduplicated), never an island. Along a
 * rectangular room's sides; around a round room, any wall tile with exactly one floor tile beside it (not
 * diagonally) and wall behind it, so the door is set into the wall, facing into the room.
 */
function findDoorCandidates(zone: ZoneData): Pos[] {
  const candidates = new Map<string, Pos>();
  const isFloor = (p: Pos) => zone.floors.has(posKey(p));
  const consider = (p: Pos) => {
    if (p.x >= 0 && p.y >= 0 && p.x < zone.width && p.y < zone.height && !isFloor(p) && !zone.islands.has(posKey(p))) {
      candidates.set(posKey(p), p);
    }
  };
  for (const room of zone.rooms) {
    // Its floor's edge: every wall tile beside a floor tile of the room (a rectangle's sides, a cavern's outline)
    for (const t of roomFloor(zone, room)) {
      for (const [dx, dy] of DIRS4) {
        const p = { x: t.x + dx, y: t.y + dy }, behind = { x: p.x + dx, y: p.y + dy };
        const floorsBeside = DIRS4.filter(([ex, ey]) => isFloor({ x: p.x + ex, y: p.y + ey })).length;
        if (floorsBeside === 1 && !isFloor(behind)) consider(p);
      }
    }
  }
  return [...candidates.values()];
}

/** How close to the farthest a "far" pick must be: candidates within this share of the max distance qualify. */
const FAR_SHARE = 0.85;

/** Walking distance (steps, by the movement rules) from `from` to every floor tile of `zone` it can reach. */
function walkDistances(zone: ZoneData, from: Pos): Map<string, number> {
  const steps = new Map<string, number>();
  for (const [key, r] of reachableTiles(from, Infinity, p => zone.floors.has(posKey(p)))) steps.set(key, r.steps);
  return steps;
}

/** Walking distance to a door (a wall tile): to the nearest floor tile beside it. Infinity if none is reached. */
function doorDistance(door: Pos, steps: Map<string, number>): number {
  let best = Infinity;
  for (const [dx, dy] of DIRS4) best = Math.min(best, steps.get(posKey({ x: door.x + dx, y: door.y + dy })) ?? Infinity);
  return best;
}

/**
 * A door spot as far as possible from `from` by walking: a random pick among the candidates within
 * FAR_SHARE of the farthest, so doors vary between runs but always sit across the zone.
 */
function farDoorSpot(zone: ZoneData, from: Pos, exclude: Pos[] = []): Pos | null {
  const steps = walkDistances(zone, from);
  const scored = findDoorCandidates(zone)
    .filter(c => !exclude.some(e => e.x === c.x && e.y === c.y))
    .map(c => ({ c, d: doorDistance(c, steps) }))
    .filter(s => Number.isFinite(s.d));
  if (scored.length === 0) return null;
  const max = Math.max(...scored.map(s => s.d));
  return pick(scored.filter(s => s.d >= max * FAR_SHARE)).c;
}

/** A random floor tile of the zone. */
const randomFloor = (zone: ZoneData): Pos => keyPos(pick([...zone.floors]));

/** The floor tile farthest (by walking) from `from`: one end of the zone. */
function farFloor(zone: ZoneData, from: Pos): Pos {
  let far = from, best = -1;
  for (const [key, d] of walkDistances(zone, from)) {
    if (d > best) { best = d; far = keyPos(key); }
  }
  return far;
}

/** Link two neighbouring zones with a pair of doors (A's way forward, B's way back). */
function linkDoors(zoneA: ZoneData, posA: Pos, zoneB: ZoneData, posB: Pos, nextDoorId: { value: number }): void {
  const idA = `door-${nextDoorId.value++}`;
  const idB = `door-${nextDoorId.value++}`;
  zoneA.doors.push({ id: idA, pos: posA, targetZoneId: zoneB.id, targetDoorId: idB });
  zoneB.doors.push({ id: idB, pos: posB, targetZoneId: zoneA.id, targetDoorId: idA });
}

// ─── Main Generator ─────────────────────────────────────────────────────────

/** A fresh dungeon from its config, its enemies' and loot's level set by the party's (`partyLevel`). */
export function generateDungeon(config: DungeonConfig, partyLevel: number): DungeonData {
  const numRegularZones = config.zones.length;
  const bossZoneId = numRegularZones;

  const zones: ZoneData[] = config.zones.map((zoneConfig, i) => generateZone(i, config.width, config.height, zoneConfig));

  // Generate boss zone (main room only — antechamber added after door placement)
  const { zone: bossZone, bossRoom } = generateBossZoneMain(bossZoneId, config.bossZone);
  zones.push(bossZone);

  // The party arrives in the first zone at one end of it, around a rift back to the Sanctum: the rift stands at
  // the center of the room around the zone's far end from a random point (roughly one end of its longest walk)
  const startEnd = farFloor(zones[0], randomFloor(zones[0]));
  const startRoom = zones[0].rooms.find(r => inRect(startEnd, r)) ?? zones[0].rooms[0];
  const startRift = roomSpot(zones[0], startRoom, true);
  const playerStart = findOpenTilesNear(startRift, p => zones[0].floors.has(posKey(p)), 1, 3)[0] ?? startRift;

  // Linear chain 0 → 1 → … → boss, no branches: the first zone has one door (forward), every later zone a
  // door back and a door forward. A zone's forward door is as far as possible (by walking) from where the
  // party enters it (the rift in, or its door back), so moving on means crossing the zone.
  const nextDoorId = { value: 0 };
  let entry = playerStart;
  for (let i = 0; i < zones.length - 1; i++) {
    const zone = zones[i], next = zones[i + 1];
    const back = zone.doors.map(d => d.pos);
    const forward = farDoorSpot(zone, entry, back);
    // The next zone's door back: at one end of it, so its own forward door can go to the other end.
    // (The boss zone is one room: anywhere along its wall.)
    const nextBack = next.id === bossZoneId ? pick(findDoorCandidates(next)) : farDoorSpot(next, randomFloor(next));
    if (!forward || !nextBack) break;
    linkDoors(zone, forward, next, nextBack, nextDoorId);
    entry = nextBack;
  }

  // Determine entry direction from the boss zone's entry door, then add antechamber
  const entryDoor = bossZone.doors[0];
  const entryDir = entryDoor ? getEntryDirection(entryDoor.pos, bossRoom) : 'south';
  const riftPos = addBossAntechamber(bossZone, bossRoom, entryDir, config.bossZone.corridorWidth, config.bossZone.layout);
  // (no rift at the start when the boss zone is the only one: its antechamber's serves)
  const rifts = [...(bossZoneId > 0 ? [{ zoneId: 0, pos: startRift }] : []), { zoneId: bossZoneId, pos: riftPos }];

  // Each zone's containers: the boss zone's in the boss room, far from its door; a regular zone's in its rooms
  // but the one it is entered by, far from its entry (placeContainers)
  const chests = zones.flatMap((zone) => {
    const boss = zone.id === bossZoneId;
    const objects = boss ? config.bossZone.containers : config.zones[zone.id]?.containers;
    const entry = zone.id === 0 ? playerStart : zone.doors.find(d => d.targetZoneId < zone.id)?.pos;
    if (!objects?.length || !entry) return [];
    const steps = walkDistances(zone, entry);
    const toEntry = (r: Room) => Math.min(...roomFloor(zone, r).map(p => steps.get(posKey(p)) ?? Infinity));
    const entryRoom = zone.rooms.reduce<Room | null>((best, r) => (!best || toEntry(r) < toEntry(best) ? r : best), null);
    const others = zone.rooms.filter(r => r !== entryRoom);
    const rooms = boss ? [bossRoom] : others.length ? others : zone.rooms;
    return placeContainers(zone, objects, rooms, entry, rifts.filter(r => r.zoneId === zone.id).map(r => r.pos), zone.id === 0 ? [playerStart] : []);
  });

  return { zones, startZoneId: 0, endZoneId: bossZoneId, playerStart, rifts, chests, level: partyLevel };
}

// ─── Containers ──────────────────────────────────────────────────────────────

/** How far from the zone's entry a container must be: among the spots within this share of the farthest (by walking). */
const CONTAINER_FAR_SHARE = 0.6;

/**
 * Place a zone's containers (`objects`: INTERACTIVE_OBJECTS ids, one container each) in `rooms`, each on a random
 * spot among those far from `entry` (CONTAINER_FAR_SHARE, by walking). A spot:
 * - stands against a wall, its back to it, facing into the room: exactly one wall beside it (never a corner), and
 *   that wall is the room's edge (rock behind it too), not an island standing in the room;
 * - never blocks a way: not beside an opening out of its room (a corridor, a tunnel, the way to the antechamber),
 *   not within a tile of a door, a rift (`rifts`, which nobody walks onto either), `keepClear` (the party's start)
 *   or another container, and the zone's floor stays connected with it there.
 * A container with no spot left is skipped. Ids are `container-<zone>-<index>`.
 */
function placeContainers(zone: ZoneData, objects: string[], rooms: Room[], entry: Pos, rifts: Pos[], keepClear: Pos[]): DungeonChest[] {
  const isFloor = (p: Pos) => zone.floors.has(posKey(p));
  const steps = walkDistances(zone, entry);
  const placed: DungeonChest[] = [];
  const clear = [...zone.doors.map(d => d.pos), ...rifts, ...keepClear];
  const near = (p: Pos, q: Pos) => Math.max(Math.abs(p.x - q.x), Math.abs(p.y - q.y)) <= 1;
  // Whether every floor tile but the taken ones (containers and rifts: nobody walks there) is still reached from the
  // entry (a door's own tile, in the wall, doesn't count)
  const keepsConnected = (taken: Pos[]) => {
    const blocked = new Set(taken.map(posKey));
    const walk = (p: Pos) => isFloor(p) && !blocked.has(posKey(p));
    const reached = [...reachableTiles(entry, Infinity, walk).keys()].filter(key => zone.floors.has(key)).length;
    return reached === zone.floors.size - blocked.size;
  };

  const spots: { pos: Pos; facing: readonly [number, number]; d: number }[] = [];
  for (const room of rooms) {
    for (let x = room.x; x < room.x + room.w; x++) {
      for (let y = room.y; y < room.y + room.h; y++) {
        const pos = { x, y };
        if (!isFloor(pos)) continue;
        const walls = DIRS4.filter(([dx, dy]) => !isFloor({ x: x + dx, y: y + dy }));
        if (walls.length !== 1) continue;
        const [wx, wy] = walls[0];
        if (isFloor({ x: x + 2 * wx, y: y + 2 * wy })) continue; // an island's side, not the room's edge
        if (neighbors(pos).some(q => isFloor(q) && !inRect(q, room))) continue;
        const d = steps.get(posKey(pos));
        if (d === undefined) continue;
        spots.push({ pos, facing: [-wx, -wy], d });
      }
    }
  }

  objects.forEach((object, k) => {
    const open = spots.filter(s => !clear.some(c => near(c, s.pos)) && !placed.some(c => near(c.pos, s.pos)));
    if (open.length === 0) return;
    const far = Math.max(...open.map(s => s.d));
    for (const s of shuffle(open.filter(o => o.d >= far * CONTAINER_FAR_SHARE))) {
      if (!keepsConnected([...placed.map(c => c.pos), ...rifts.filter(isFloor), s.pos])) continue;
      placed.push({ id: `container-${zone.id}-${k}`, zoneId: zone.id, object, pos: s.pos, facing: s.facing });
      return;
    }
  });
  return placed;
}

// ─── Enemy Spawning ──────────────────────────────────────────────────────────

/**
 * How far (walking steps) enemies stay from where the party enters a zone: out of aggro sight
 * (AGGRO_RANGE), with a few steps to spare, so walking through a door never lands the party in a pack.
 */
const ENTRY_CLEAR_STEPS = AGGRO_RANGE + 3;

/** Share of a regular zone's rooms (not counting the one the party enters by) that get an enemy group. */
const ROOM_FILL_SHARE = 0.75;

/** Fewest other places a large creature must fit within a move of where it is placed (spawnDungeonEnemies canRoamFrom). */
const LARGE_MIN_STOPS = 8;

export function spawnDungeonEnemies(dungeon: DungeonData, config: DungeonConfig): EnemyInstance[] {
  const instances: EnemyInstance[] = [];
  let globalIdx = 0;
  let nextGroupId = 0;

  const occupied = new Set([
    `${dungeon.startZoneId}:${posKey(dungeon.playerStart)}`,
    ...dungeon.rifts.map(r => `${r.zoneId}:${posKey(r.pos)}`),
    ...dungeon.chests.map(c => `${c.zoneId}:${posKey(c.pos)}`),
  ]);
  for (const zone of dungeon.zones) {
    for (const door of zone.doors) occupied.add(`${zone.id}:${posKey(door.pos)}`);
  }

  // Where the party enters each zone: the start tile in the first, else its door back (to the zone before).
  // No enemy stands within ENTRY_CLEAR_STEPS of it, and the room it opens into (the one nearest it by walking)
  // gets no group.
  const nearEntry = new Set<string>();
  const entryRooms = new Set<Room>();
  for (const zone of dungeon.zones) {
    const entries = zone.id === dungeon.startZoneId ? [dungeon.playerStart]
      : zone.doors.filter(d => d.targetZoneId < zone.id).map(d => d.pos);
    for (const entry of entries) {
      const steps = walkDistances(zone, entry);
      for (const [key, n] of steps) if (n <= ENTRY_CLEAR_STEPS) nearEntry.add(`${zone.id}:${key}`);
      const dist = (r: Room) => Math.min(...roomFloor(zone, r).map(p => steps.get(posKey(p)) ?? Infinity));
      const nearest = zone.rooms.reduce<Room | null>((best, r) => (!best || dist(r) < dist(best) ? r : best), null);
      if (nearest) entryRooms.add(nearest);
    }
  }

  /** Free floor tiles inside `area`: no one on them, and away from the zone's entry unless `nearEntryOk`. */
  const freeTiles = (zone: ZoneData, area: Rect, nearEntryOk: boolean): Pos[] => {
    const free: Pos[] = [];
    for (let x = area.x; x < area.x + area.w; x++) {
      for (let y = area.y; y < area.y + area.h; y++) {
        const key = `${zone.id}:${posKey({ x, y })}`;
        if (!zone.floors.has(posKey({ x, y })) || occupied.has(key) || (!nearEntryOk && nearEntry.has(key))) continue;
        free.push({ x, y });
      }
    }
    return free;
  };

  /** Place one enemy group, member i on spots[i] (a large one's top-left tile). */
  const placeAt = (zone: ZoneData, group: EnemyClassData[], spots: Pos[]) => {
    const groupId = nextGroupId++;
    group.forEach((type, i) => {
      const pos = spots[i];
      for (const p of footprint({ pos, size: bodySize(type) })) occupied.add(`${zone.id}:${posKey(p)}`);
      const level = dungeon.level + zone.id;
      instances.push(generateEnemyInstance(type, level, `${type.id}-${globalIdx++}`, pos, zone.id, groupId));
    });
  };

  /**
   * Whether a large body (`size`) with its top-left at `pos` isn't boxed in: it has LARGE_MIN_STOPS other places
   * it fits within a move (BASE_MOVEMENT tiles, squeezing between them), on the empty zone. Rules out rooms full
   * of 1-tile islands and pinched coves, where it could hardly move.
   */
  const canRoamFrom = (zone: ZoneData, pos: Pos, size: number): boolean => {
    const walkable = zoneWalkable(dungeon, zone);
    let stops = 0;
    for (const r of reachableTiles(pos, BASE_MOVEMENT, walkable, undefined, size).values()) {
      if (r.steps > 0 && fits(r.pos, size, walkable) && ++stops >= LARGE_MIN_STOPS) return true;
    }
    return false;
  };

  /**
   * Where a member of `type` can stand, of the `open` tiles (keys): a tile, or for a large one the top-left of a
   * square that is all open and from which it isn't boxed in (canRoamFrom).
   */
  const canStand = (zone: ZoneData, type: EnemyClassData, open: ReadonlyMap<string, Pos>) => (p: Pos) =>
    fits(p, bodySize(type), q => open.has(posKey(q))) && (bodySize(type) === 1 || canRoamFrom(zone, p, bodySize(type)));

  /**
   * Members of a group on the `open` tiles, its large ones first (they need a whole free square), each on the
   * first tile `order` gives it that it can stand on (canStand). Null if one has nowhere to go.
   */
  const spotsFor = (zone: ZoneData, group: EnemyClassData[], open: Map<string, Pos>, order: (i: number) => Pos[]): Pos[] | null => {
    const spots: Pos[] = [];
    const byLargeFirst = group.map((_, i) => i).sort((a, b) => bodySize(group[b]) - bodySize(group[a]));
    for (const i of byLargeFirst) {
      const spot = order(i).find(canStand(zone, group[i], open));
      if (!spot) return null;
      for (const p of footprint({ pos: spot, size: bodySize(group[i]) })) open.delete(posKey(p));
      spots[i] = spot;
    }
    return spots;
  };

  /**
   * Place one enemy group on random free floor tiles inside `area` (freeTiles: away from the zone's entry). False
   * (nothing placed) if the group doesn't fit there.
   */
  const placeGroup = (zone: ZoneData, area: Rect, group: EnemyClassData[]): boolean => {
    const free = shuffle(freeTiles(zone, area, false));
    const open = new Map(free.map(p => [posKey(p), p]));
    const spots = spotsFor(zone, group, open, () => free);
    if (!spots) return false;
    placeAt(zone, group, spots);
    return true;
  };

  /**
   * Place a boss group: the boss (its first member) on a random free tile inside `area`, the rest flanking it in
   * `room`: beside it on the line across the party's way in (`across`), one each side, then a step further out
   * (past the whole of a large boss). A flank tile that isn't free (a wall, a cavern's edge) gives way to the free
   * tile nearest it. False (nothing placed) if the group doesn't fit.
   */
  const placeBossGroup = (zone: ZoneData, area: Rect, room: Rect, group: EnemyClassData[], across: 'x' | 'y', nearEntryOk = false): boolean => {
    const open = new Map(freeTiles(zone, room, nearEntryOk).map(p => [posKey(p), p]));
    const boss = shuffle(freeTiles(zone, area, nearEntryOk)).find(canStand(zone, group[0], open));
    if (!boss) return false;
    for (const p of footprint({ pos: boss, size: bodySize(group[0]) })) open.delete(posKey(p));
    const bossSize = bodySize(group[0]);
    // Nearest the flank tile first; on a tie, nearest the boss
    const d2 = (p: Pos, q: Pos) => (p.x - q.x) ** 2 + (p.y - q.y) ** 2;
    const flank = (i: number): Pos[] => {
      const out = (i % 2 ? 1 : -1) * Math.ceil(i / 2);
      const step = out > 0 ? out + bossSize - 1 : out;
      const want = across === 'x' ? { x: boss.x + step, y: boss.y } : { x: boss.x, y: boss.y + step };
      return [...open.values()].sort((p, q) => d2(p, want) - d2(q, want) || d2(p, boss) - d2(q, boss));
    };
    const rest = spotsFor(zone, group.slice(1), open, i => flank(i + 1));
    if (!rest) return false;
    placeAt(zone, group, [boss, ...rest]);
    return true;
  };

  for (const zone of dungeon.zones) {
    if (zone.id === dungeon.endZoneId) {
      // Boss group in the center half of the boss room, its guard flanking the boss across the party's way in.
      // The boss is always placed: if the center is too near the door (a round room's door can sit on its
      // diagonal), anywhere in the room away from the door, and failing that the center after all
      const group = config.bossZone.bossGroup;
      if (group.length === 0) continue;
      const bossRoom = zone.rooms[0];
      const center: Rect = {
        x: bossRoom.x + Math.floor(bossRoom.w / 4),
        y: bossRoom.y + Math.floor(bossRoom.h / 4),
        w: Math.ceil(bossRoom.w / 2),
        h: Math.ceil(bossRoom.h / 2),
      };
      const entryDoor = zone.doors.find(d => d.targetZoneId < zone.id);
      const entryDir = entryDoor ? getEntryDirection(entryDoor.pos, bossRoom) : 'south';
      const across = entryDir === 'north' || entryDir === 'south' ? 'x' : 'y';
      if (!placeBossGroup(zone, center, bossRoom, group, across) && !placeBossGroup(zone, bossRoom, bossRoom, group, across)) {
        placeBossGroup(zone, center, bossRoom, group, across, true);
      }
      continue;
    }

    // Regular zone: ROOM_FILL_SHARE of its rooms (not the one the party enters by), random ones, get one group
    // each, cycling through the zone's groups (reshuffled each time round). A room takes the next group in the
    // cycle that fits it (away from the entry); a room none fits is skipped for another. Never two in one room.
    const groups = config.zones[zone.id]?.enemyGroups ?? [];
    if (groups.length === 0) continue;
    const rooms = shuffle(zone.rooms.filter(r => !entryRooms.has(r)));
    const target = Math.round(rooms.length * ROOM_FILL_SHARE);
    let cycle: EnemyClassData[][] = [];
    let filled = 0;
    for (const room of rooms) {
      if (filled === target) break;
      if (cycle.length === 0) cycle = shuffle(groups);
      const i = cycle.findIndex(g => placeGroup(zone, room, g));
      if (i < 0) continue;
      cycle.splice(i, 1);
      filled++;
    }
  }

  return instances;
}

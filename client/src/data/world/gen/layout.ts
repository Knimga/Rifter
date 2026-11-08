// A zone's floor plan: BSP rooms joined by corridors, caverns or tunnels, and the boss zone's room and antechamber.
import { chance, pick, randFloat, randInt } from '../../random';
import { neighbors, posKey, type Pos } from '../grid';
import { fillRect, newZone, roomCenter, roomFloor, roomSpot, type Rect } from './shared';
import { placeIslands, placeObstacles } from './features';
import type { BossZoneConfig, GenOptions, Room, ZoneConfig, ZoneData } from './types';

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
export function carveCavern(floors: Set<string>, room: Rect): void {
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
export function carveTunnel(floors: Set<string>, a: Pos, b: Pos, width: number, zw: number, zh: number): void {
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

// ─── Regular Zone Generator ──────────────────────────────────────────────────

export function generateZone(id: number, width: number, height: number, zoneConfig: ZoneConfig, gen: GenOptions): ZoneData {
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

  const zone = newZone(id, width, height, floors, rooms);
  const islandRooms = zoneConfig.islands ? placeIslands(zone, zoneConfig.islands) : new Set<Room>();
  if (zoneConfig.obstacles) placeObstacles(zone, zoneConfig.obstacles, rooms, islandRooms, gen);
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
export function getEntryDirection(doorPos: Pos, bossRoom: Room): CardinalDir {
  const dx = doorPos.x + 0.5 - (bossRoom.x + bossRoom.w / 2), dy = doorPos.y + 0.5 - (bossRoom.y + bossRoom.h / 2);
  if (Math.abs(dy) >= Math.abs(dx)) return dy < 0 ? 'north' : 'south';
  return dx < 0 ? 'west' : 'east';
}

/** Generates just the main boss room. Antechamber is added after door placement. */
export function generateBossZoneMain(id: number, config: BossZoneConfig, gen: GenOptions): { zone: ZoneData; bossRoom: Room } {
  const zoneSize = config.roomSize + BOSS_ZONE_PADDING * 2;
  const half = Math.floor((zoneSize - config.roomSize) / 2);
  const bossRoom: Room = { id: 0, x: half, y: half, w: config.roomSize, h: config.roomSize };
  const floors = new Set<string>();
  if (config.layout === 'caverns') carveCavern(floors, bossRoom);
  else fillRect(floors, bossRoom);
  const zone = newZone(id, zoneSize, zoneSize, floors, [bossRoom]);
  if (config.obstacles) placeObstacles(zone, config.obstacles, [bossRoom], new Set(), gen);
  return { zone, bossRoom };
}

/**
 * Adds an antechamber (small room) in a random cardinal direction that is not
 * the entry direction, connects it with a corridor, and returns the rift position.
 * Caverns: the antechamber is a cavern too, opening into the boss room by the shortest way (no corridor).
 */
export function addBossAntechamber(
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

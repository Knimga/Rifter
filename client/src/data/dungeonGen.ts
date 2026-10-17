import type { EnemyClassData, EnemyInstance } from './enemies';
import type { Item } from './gear';
import { generateEnemyInstance } from './enemies';
import { posKey, type Pos } from './dungeonHelpers';
import { chance, pick, randInt, shuffle } from './random';

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
  droppedItems: Record<string, Item[]>; // "x,y" → items dropped at that tile
}

export interface DungeonData {
  zones: ZoneData[];
  startZoneId: number;
  endZoneId: number;     // boss zone — portal lives here
  playerStart: Pos;
  portalPos: Pos;
  baseEnemyLevel: number;
}

// ─── Config Types ─────────────────────────────────────────────────────────────

export interface ZoneConfig {
  minRoomSize: number;
  maxRoomSize: number;
  splitDepth: number;
  corridorWidth: number;
  enemyGroups: EnemyClassData[][];  // one group chosen at random per room
}

export interface BossZoneConfig {
  roomSize: number;       // boss room is a square of this side length
  corridorWidth: number;  // corridor connecting boss room to antechamber
  bossGroup: EnemyClassData[];  // placed scattered in the boss room center
}

export interface DungeonConfig {
  name: string;
  width: number;          // applies to all regular zones
  height: number;         // applies to all regular zones
  baseEnemyLevel: number;
  zones: ZoneConfig[];    // regular zones, chained linearly: 0 → 1 → … → boss
  bossZone: BossZoneConfig;
  floorColor: string;     // hex color for walkable floor tiles
  wallColor: string;      // hex color for wall/non-floor tiles
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

type Rect = Pick<Room, 'x' | 'y' | 'w' | 'h'>;

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
  zoneConfig: Pick<ZoneConfig, 'minRoomSize' | 'maxRoomSize'>,
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

  const rw = randInt(zoneConfig.minRoomSize, maxW);
  const rh = randInt(zoneConfig.minRoomSize, maxH);
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

// ─── Regular Zone Generator ──────────────────────────────────────────────────

function generateZone(id: number, width: number, height: number, zoneConfig: ZoneConfig): ZoneData {
  const nextId = { value: 0 };
  const root: BSPNode = { x: 1, y: 1, w: width - 2, h: height - 2 };

  splitBSP(root, zoneConfig.splitDepth, zoneConfig, nextId);

  const rooms = collectRooms(root);
  const floors = new Set<string>();
  rooms.forEach(r => fillRect(floors, r));

  connectBSP(root, floors, zoneConfig.corridorWidth);

  return { id, width, height, floors, rooms, doors: [], droppedItems: {} };
}

// ─── Boss Zone Generator ──────────────────────────────────────────────────────

const ANTECHAMBER_SIZE = 5;
// Enough padding on all 4 sides for: 1 border + antechamber + corridor gap
const BOSS_ZONE_PADDING = 9;

type CardinalDir = 'north' | 'south' | 'east' | 'west';

function getEntryDirection(doorPos: Pos, bossRoom: Room): CardinalDir {
  if (doorPos.y < bossRoom.y) return 'north';
  if (doorPos.y >= bossRoom.y + bossRoom.h) return 'south';
  if (doorPos.x < bossRoom.x) return 'west';
  return 'east';
}

/** Generates just the main boss room. Antechamber is added after door placement. */
function generateBossZoneMain(id: number, config: BossZoneConfig): { zone: ZoneData; bossRoom: Room } {
  const zoneSize = config.roomSize + BOSS_ZONE_PADDING * 2;
  const half = Math.floor((zoneSize - config.roomSize) / 2);
  const bossRoom: Room = { id: 0, x: half, y: half, w: config.roomSize, h: config.roomSize };
  const floors = new Set<string>();
  fillRect(floors, bossRoom);
  return {
    zone: { id, width: zoneSize, height: zoneSize, floors, rooms: [bossRoom], doors: [], droppedItems: {} },
    bossRoom,
  };
}

/**
 * Adds an antechamber (small room) in a random cardinal direction that is not
 * the entry direction, connects it with a corridor, and returns the portal position.
 */
function addBossAntechamber(
  zone: ZoneData,
  bossRoom: Room,
  entryDir: CardinalDir,
  corridorWidth: number,
): Pos {
  const dir = pick((['north', 'south', 'east', 'west'] as const).filter(d => d !== entryDir));
  const { x: cx, y: cy } = roomCenter(bossRoom);
  const A = ANTECHAMBER_SIZE;

  // Antechamber placement against the zone edge, and the corridor back to the boss room wall
  const layout: Record<CardinalDir, { room: Rect; corridor: Parameters<typeof drawCorridor>[0]; from: number; to: number; at: number }> = {
    north: { room: { x: cx - Math.floor(A / 2), y: 1, w: A, h: A },                       corridor: 'v', from: 1 + A,                   to: bossRoom.y - 1,               at: cx },
    south: { room: { x: cx - Math.floor(A / 2), y: zone.height - 1 - A, w: A, h: A },     corridor: 'v', from: bossRoom.y + bossRoom.h, to: zone.height - 1 - A - 1,      at: cx },
    east:  { room: { x: zone.width - 1 - A, y: cy - Math.floor(A / 2), w: A, h: A },      corridor: 'h', from: bossRoom.x + bossRoom.w, to: zone.width - 1 - A - 1,       at: cy },
    west:  { room: { x: 1, y: cy - Math.floor(A / 2), w: A, h: A },                       corridor: 'h', from: 1 + A,                   to: bossRoom.x - 1,               at: cy },
  };
  const { room, corridor, from, to, at } = layout[dir];

  drawCorridor(corridor, from, to, at, zone.floors, corridorWidth);
  fillRect(zone.floors, room);
  zone.rooms.push({ id: 1, ...room });

  return roomCenter(room);
}

// ─── Door Placement ─────────────────────────────────────────────────────────

/** Wall tiles directly bordering any room edge (deduplicated). */
function findDoorCandidates(zone: ZoneData): Pos[] {
  const candidates = new Map<string, Pos>();
  const consider = (p: Pos) => {
    if (p.x >= 0 && p.y >= 0 && p.x < zone.width && p.y < zone.height && !zone.floors.has(posKey(p))) {
      candidates.set(posKey(p), p);
    }
  };
  for (const room of zone.rooms) {
    for (let x = room.x; x < room.x + room.w; x++) {
      consider({ x, y: room.y - 1 });
      consider({ x, y: room.y + room.h });
    }
    for (let y = room.y; y < room.y + room.h; y++) {
      consider({ x: room.x - 1, y });
      consider({ x: room.x + room.w, y });
    }
  }
  return [...candidates.values()];
}

function placeDoorPair(
  zoneA: ZoneData,
  zoneB: ZoneData,
  usedPositions: Set<string>,
  nextDoorId: { value: number },
): void {
  const candidatesA = findDoorCandidates(zoneA).filter(p => !usedPositions.has(`${zoneA.id}:${posKey(p)}`));
  const candidatesB = findDoorCandidates(zoneB).filter(p => !usedPositions.has(`${zoneB.id}:${posKey(p)}`));

  if (candidatesA.length === 0 || candidatesB.length === 0) return;

  const posA = pick(candidatesA);
  const posB = pick(candidatesB);

  const idA = `door-${nextDoorId.value++}`;
  const idB = `door-${nextDoorId.value++}`;

  zoneA.doors.push({ id: idA, pos: posA, targetZoneId: zoneB.id, targetDoorId: idB });
  zoneB.doors.push({ id: idB, pos: posB, targetZoneId: zoneA.id, targetDoorId: idA });

  usedPositions.add(`${zoneA.id}:${posKey(posA)}`);
  usedPositions.add(`${zoneB.id}:${posKey(posB)}`);
}

// ─── Main Generator ─────────────────────────────────────────────────────────

export function generateDungeon(config: DungeonConfig): DungeonData {
  const numRegularZones = config.zones.length;
  const bossZoneId = numRegularZones;

  // Generate regular zones
  const zones: ZoneData[] = config.zones.map((zoneConfig, i) => generateZone(i, config.width, config.height, zoneConfig));

  // Generate boss zone (main room only — antechamber added after door placement)
  const { zone: bossZone, bossRoom } = generateBossZoneMain(bossZoneId, config.bossZone);
  zones.push(bossZone);

  // Linear chain 0 → 1 → … → boss, one door pair per link
  const usedDoorPositions = new Set<string>();
  const nextDoorId = { value: 0 };
  for (let i = 0; i < zones.length - 1; i++) {
    placeDoorPair(zones[i], zones[i + 1], usedDoorPositions, nextDoorId);
  }

  // Determine entry direction from the boss zone's entry door, then add antechamber
  const entryDoor = bossZone.doors[0];
  const entryDir = entryDoor ? getEntryDirection(entryDoor.pos, bossRoom) : 'south';
  const portalPos = addBossAntechamber(bossZone, bossRoom, entryDir, config.bossZone.corridorWidth);

  return {
    zones,
    startZoneId: 0,
    endZoneId: bossZoneId,
    playerStart: roomCenter(zones[0].rooms[0]),
    portalPos,
    baseEnemyLevel: config.baseEnemyLevel,
  };
}

// ─── Enemy Spawning ──────────────────────────────────────────────────────────

export function spawnDungeonEnemies(dungeon: DungeonData, config: DungeonConfig): EnemyInstance[] {
  const instances: EnemyInstance[] = [];
  let globalIdx = 0;
  let nextGroupId = 0;

  const occupied = new Set([
    `${dungeon.startZoneId}:${posKey(dungeon.playerStart)}`,
    `${dungeon.endZoneId}:${posKey(dungeon.portalPos)}`,
  ]);
  for (const zone of dungeon.zones) {
    for (const door of zone.doors) occupied.add(`${zone.id}:${posKey(door.pos)}`);
  }

  /** Place one enemy group at random free tiles inside `area`. */
  const placeGroup = (zone: ZoneData, area: Rect, group: EnemyClassData[]) => {
    const groupId = nextGroupId++;
    for (const type of group) {
      let pos: Pos, key: string;
      let attempts = 0;
      do {
        pos = { x: area.x + randInt(0, area.w - 1), y: area.y + randInt(0, area.h - 1) };
        key = `${zone.id}:${posKey(pos)}`;
        attempts++;
      } while (occupied.has(key) && attempts < 100);

      if (attempts >= 100) continue;
      occupied.add(key);

      const level = config.baseEnemyLevel + zone.id;
      instances.push(generateEnemyInstance(type, level, `${type.id}-${globalIdx++}`, pos, zone.id, groupId));
    }
  };

  for (const zone of dungeon.zones) {
    if (zone.id === dungeon.endZoneId) {
      // Boss group scattered in the center half of the boss room
      const group = config.bossZone.bossGroup;
      if (group.length === 0) continue;
      const bossRoom = zone.rooms[0];
      placeGroup(zone, {
        x: bossRoom.x + Math.floor(bossRoom.w / 4),
        y: bossRoom.y + Math.floor(bossRoom.h / 4),
        w: Math.ceil(bossRoom.w / 2),
        h: Math.ceil(bossRoom.h / 2),
      }, group);
      continue;
    }

    // Regular zone: one random group per selected room (never the start room)
    const zoneConfig = config.zones[zone.id];
    if (!zoneConfig || zoneConfig.enemyGroups.length === 0) continue;

    const eligibleRooms = zone.id === dungeon.startZoneId ? zone.rooms.slice(1) : zone.rooms;
    if (eligibleRooms.length === 0) continue;

    const groupCount = Math.ceil(eligibleRooms.length / 2) + randInt(0, Math.floor(eligibleRooms.length / 4));
    const selectedRooms = shuffle(eligibleRooms).slice(0, Math.min(groupCount, eligibleRooms.length));

    for (const room of selectedRooms) placeGroup(zone, room, pick(zoneConfig.enemyGroups));
  }

  return instances;
}

import type { EnemyClassData, EnemyInstance } from './enemies';
import type { Item } from './gear';
import { generateEnemyInstance } from './enemies';

// ─── Core Types ──────────────────────────────────────────────────────────────

export interface Pos {
  x: number;
  y: number;
}

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
  droppedItems: Record<string, Item>; // "x,y" → item dropped at that tile
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

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function roomCenter(room: Room): Pos {
  return {
    x: Math.floor(room.x + room.w / 2),
    y: Math.floor(room.y + room.h / 2),
  };
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
        splitH = node.h > node.w ? true : node.w > node.h ? false : Math.random() < 0.5;
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

function drawHCorridor(x1: number, x2: number, y: number, floors: Set<string>, width: number): void {
  const lo = Math.min(x1, x2);
  const hi = Math.max(x1, x2);
  const offset = -Math.floor((width - 1) / 2);
  for (let x = lo; x <= hi; x++) {
    for (let i = 0; i < width; i++) floors.add(`${x},${y + offset + i}`);
  }
}

function drawVCorridor(y1: number, y2: number, x: number, floors: Set<string>, width: number): void {
  const lo = Math.min(y1, y2);
  const hi = Math.max(y1, y2);
  const offset = -Math.floor((width - 1) / 2);
  for (let y = lo; y <= hi; y++) {
    for (let i = 0; i < width; i++) floors.add(`${x + offset + i},${y}`);
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

  const a = roomCenter(leftRooms[randInt(0, leftRooms.length - 1)]);
  const b = roomCenter(rightRooms[randInt(0, rightRooms.length - 1)]);

  if (Math.random() < 0.5) {
    drawHCorridor(a.x, b.x, a.y, floors, corridorWidth);
    drawVCorridor(a.y, b.y, b.x, floors, corridorWidth);
  } else {
    drawVCorridor(a.y, b.y, a.x, floors, corridorWidth);
    drawHCorridor(a.x, b.x, b.y, floors, corridorWidth);
  }
}

// ─── Floor Set ───────────────────────────────────────────────────────────────

function buildFloorSet(rooms: Room[]): Set<string> {
  const floors = new Set<string>();
  for (const room of rooms) {
    for (let x = room.x; x < room.x + room.w; x++) {
      for (let y = room.y; y < room.y + room.h; y++) {
        floors.add(`${x},${y}`);
      }
    }
  }
  return floors;
}

// ─── Regular Zone Generator ──────────────────────────────────────────────────

function generateZone(id: number, width: number, height: number, zoneConfig: ZoneConfig): ZoneData {
  const nextId = { value: 0 };
  const root: BSPNode = { x: 1, y: 1, w: width - 2, h: height - 2 };

  splitBSP(root, zoneConfig.splitDepth, zoneConfig, nextId);

  const rooms = collectRooms(root);
  const floors = buildFloorSet(rooms);

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
  const floors = buildFloorSet([bossRoom]);
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
  const all: CardinalDir[] = ['north', 'south', 'east', 'west'];
  const dirs = all.filter(d => d !== entryDir);
  const dir = dirs[randInt(0, dirs.length - 1)];

  const cx = Math.floor(bossRoom.x + bossRoom.w / 2);
  const cy = Math.floor(bossRoom.y + bossRoom.h / 2);
  const A = ANTECHAMBER_SIZE;

  let antRoom: Room;

  switch (dir) {
    case 'north': {
      const ax = cx - Math.floor(A / 2);
      const ay = 1;
      antRoom = { id: 1, x: ax, y: ay, w: A, h: A };
      // corridor from antechamber south edge to boss room north wall
      drawVCorridor(ay + A, bossRoom.y - 1, cx, zone.floors, corridorWidth);
      break;
    }
    case 'south': {
      const ax = cx - Math.floor(A / 2);
      const ay = zone.height - 1 - A;
      antRoom = { id: 1, x: ax, y: ay, w: A, h: A };
      // corridor from boss room south wall to antechamber north edge
      drawVCorridor(bossRoom.y + bossRoom.h, ay - 1, cx, zone.floors, corridorWidth);
      break;
    }
    case 'east': {
      const ax = zone.width - 1 - A;
      const ay = cy - Math.floor(A / 2);
      antRoom = { id: 1, x: ax, y: ay, w: A, h: A };
      // corridor from boss room east wall to antechamber west edge
      drawHCorridor(bossRoom.x + bossRoom.w, ax - 1, cy, zone.floors, corridorWidth);
      break;
    }
    case 'west': {
      const ax = 1;
      const ay = cy - Math.floor(A / 2);
      antRoom = { id: 1, x: ax, y: ay, w: A, h: A };
      // corridor from antechamber east edge to boss room west wall
      drawHCorridor(ax + A, bossRoom.x - 1, cy, zone.floors, corridorWidth);
      break;
    }
  }

  // Add antechamber floor tiles and register room
  for (let x = antRoom.x; x < antRoom.x + antRoom.w; x++) {
    for (let y = antRoom.y; y < antRoom.y + antRoom.h; y++) {
      zone.floors.add(`${x},${y}`);
    }
  }
  zone.rooms.push(antRoom);

  return roomCenter(antRoom);
}

// ─── Zone Graph ─────────────────────────────────────────────────────────────

/** Build a linear chain: 0 → 1 → 2 → … → N-1. */
function buildZoneGraph(zones: ZoneData[]): [number, number][] {
  const connections: [number, number][] = [];
  for (let i = 0; i < zones.length - 1; i++) {
    connections.push([i, i + 1]);
  }
  return connections;
}

// ─── Door Placement ─────────────────────────────────────────────────────────

function findDoorCandidates(zone: ZoneData): Pos[] {
  const candidates: Pos[] = [];

  for (const room of zone.rooms) {
    for (let x = room.x; x < room.x + room.w; x++) {
      const yTop = room.y - 1;
      if (yTop >= 0 && !zone.floors.has(`${x},${yTop}`)) candidates.push({ x, y: yTop });
      const yBot = room.y + room.h;
      if (yBot < zone.height && !zone.floors.has(`${x},${yBot}`)) candidates.push({ x, y: yBot });
    }
    for (let y = room.y; y < room.y + room.h; y++) {
      const xLeft = room.x - 1;
      if (xLeft >= 0 && !zone.floors.has(`${xLeft},${y}`)) candidates.push({ x: xLeft, y });
      const xRight = room.x + room.w;
      if (xRight < zone.width && !zone.floors.has(`${xRight},${y}`)) candidates.push({ x: xRight, y });
    }
  }

  const seen = new Set<string>();
  return candidates.filter(p => {
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function placeDoorPair(
  zoneA: ZoneData,
  zoneB: ZoneData,
  usedPositions: Set<string>,
  nextDoorId: { value: number },
): void {
  const candidatesA = findDoorCandidates(zoneA).filter(p => !usedPositions.has(`${zoneA.id}:${p.x},${p.y}`));
  const candidatesB = findDoorCandidates(zoneB).filter(p => !usedPositions.has(`${zoneB.id}:${p.x},${p.y}`));

  if (candidatesA.length === 0 || candidatesB.length === 0) return;

  const posA = candidatesA[randInt(0, candidatesA.length - 1)];
  const posB = candidatesB[randInt(0, candidatesB.length - 1)];

  const idA = `door-${nextDoorId.value++}`;
  const idB = `door-${nextDoorId.value++}`;

  zoneA.doors.push({ id: idA, pos: posA, targetZoneId: zoneB.id, targetDoorId: idB });
  zoneB.doors.push({ id: idB, pos: posB, targetZoneId: zoneA.id, targetDoorId: idA });

  usedPositions.add(`${zoneA.id}:${posA.x},${posA.y}`);
  usedPositions.add(`${zoneB.id}:${posB.x},${posB.y}`);
}

// ─── Main Generator ─────────────────────────────────────────────────────────

export function generateDungeon(config: DungeonConfig): DungeonData {
  const numRegularZones = config.zones.length;
  const bossZoneId = numRegularZones;

  // Generate regular zones
  const zones: ZoneData[] = [];
  for (let i = 0; i < numRegularZones; i++) {
    zones.push(generateZone(i, config.width, config.height, config.zones[i]));
  }

  // Generate boss zone (main room only — antechamber added after door placement)
  const { zone: bossZone, bossRoom } = generateBossZoneMain(bossZoneId, config.bossZone);
  zones.push(bossZone);

  // Build linear chain and place doors
  const connections = buildZoneGraph(zones);
  const usedDoorPositions = new Set<string>();
  const nextDoorId = { value: 0 };
  for (const [a, b] of connections) {
    placeDoorPair(zones[a], zones[b], usedDoorPositions, nextDoorId);
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
    `${dungeon.startZoneId}:${dungeon.playerStart.x},${dungeon.playerStart.y}`,
    `${dungeon.endZoneId}:${dungeon.portalPos.x},${dungeon.portalPos.y}`,
  ]);

  for (const zone of dungeon.zones) {
    for (const door of zone.doors) {
      occupied.add(`${zone.id}:${door.pos.x},${door.pos.y}`);
    }
  }

  for (const zone of dungeon.zones) {
    const isBossZone = zone.id === dungeon.endZoneId;
    const isStartZone = zone.id === dungeon.startZoneId;

    if (isBossZone) {
      // Place boss group scattered in the center half of the boss room
      const bossRoom = zone.rooms[0];
      const group = config.bossZone.bossGroup;
      if (group.length === 0) continue;

      const groupId = nextGroupId++;
      const subX = bossRoom.x + Math.floor(bossRoom.w / 4);
      const subY = bossRoom.y + Math.floor(bossRoom.h / 4);
      const subW = Math.ceil(bossRoom.w / 2);
      const subH = Math.ceil(bossRoom.h / 2);

      for (const type of group) {
        let x: number, y: number, key: string;
        let attempts = 0;
        do {
          x = subX + Math.floor(Math.random() * subW);
          y = subY + Math.floor(Math.random() * subH);
          key = `${zone.id}:${x},${y}`;
          attempts++;
        } while (occupied.has(key) && attempts < 100);

        if (attempts >= 100) continue;
        occupied.add(key);

        const id = `${type.id}-${globalIdx++}`;
        const level = config.baseEnemyLevel + zone.id;
        instances.push(generateEnemyInstance(type, level, id, { x, y }, zone.id, groupId));
      }
    } else {
      // Regular zone: one random group per selected room
      const zoneConfig = config.zones[zone.id];
      if (!zoneConfig || zoneConfig.enemyGroups.length === 0) continue;

      const eligibleRooms = isStartZone ? zone.rooms.slice(1) : zone.rooms;
      if (eligibleRooms.length === 0) continue;

      const groupCount = Math.ceil(eligibleRooms.length / 2) + randInt(0, Math.floor(eligibleRooms.length / 4));
      const roomCount = Math.min(groupCount, eligibleRooms.length);
      const selectedRooms = [...eligibleRooms].sort(() => Math.random() - 0.5).slice(0, roomCount);

      for (const room of selectedRooms) {
        const group = zoneConfig.enemyGroups[randInt(0, zoneConfig.enemyGroups.length - 1)];
        const groupId = nextGroupId++;

        for (const type of group) {
          let x: number, y: number, key: string;
          let attempts = 0;
          do {
            x = room.x + Math.floor(Math.random() * room.w);
            y = room.y + Math.floor(Math.random() * room.h);
            key = `${zone.id}:${x},${y}`;
            attempts++;
          } while (occupied.has(key) && attempts < 100);

          if (attempts >= 100) continue;
          occupied.add(key);

          const id = `${type.id}-${globalIdx++}`;
          const level = config.baseEnemyLevel + zone.id;
          instances.push(generateEnemyInstance(type, level, id, { x, y }, zone.id, groupId));
        }
      }
    }
  }

  return instances;
}

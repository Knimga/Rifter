import type { EnemyType, EnemyInstance } from './enemies';

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
}

export interface DungeonData {
  zones: ZoneData[];
  startZoneId: number;
  endZoneId: number;
  playerStart: Pos;
  portalPos: Pos;
}

export interface DungeonConfig {
  name: string;
  width: number;
  height: number;
  minRoomSize: number;     // minimum interior dimension for a room
  maxRoomSize: number;     // maximum interior dimension for a room
  splitDepth: number;      // BSP recursion depth
  corridorWidth: number;   // corridor width in tiles (1-3)
  maxZones: number;        // maximum number of zones (min 2)
  enemyGroups: EnemyType[][];  // possible group compositions; one picked at random per room
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

function splitBSP(node: BSPNode, depth: number, config: DungeonConfig, nextId: { value: number }): void {
  const minLeaf = config.minRoomSize + 2; // room + 1 tile padding each side

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

      splitBSP(node.left, depth - 1, config, nextId);
      splitBSP(node.right, depth - 1, config, nextId);
      return;
    }
  }

  // Leaf — create room
  const maxW = Math.min(config.maxRoomSize, node.w - 2);
  const maxH = Math.min(config.maxRoomSize, node.h - 2);
  if (maxW < config.minRoomSize || maxH < config.minRoomSize) return; // too small

  const rw = randInt(config.minRoomSize, maxW);
  const rh = randInt(config.minRoomSize, maxH);
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

// ─── Single Zone Generator ──────────────────────────────────────────────────

function generateZone(id: number, config: DungeonConfig): ZoneData {
  const nextId = { value: 0 };
  const root: BSPNode = { x: 1, y: 1, w: config.width - 2, h: config.height - 2 };

  splitBSP(root, config.splitDepth, config, nextId);

  const rooms = collectRooms(root);
  const floors = buildFloorSet(rooms);

  connectBSP(root, floors, config.corridorWidth);

  return {
    id,
    width: config.width,
    height: config.height,
    floors,
    rooms,
    doors: [],
  };
}

// ─── Zone Graph ─────────────────────────────────────────────────────────────

/** Build a linear chain of connections: 0→1→2→...→N-1. */
function buildZoneGraph(zones: ZoneData[]): [number, number][] {
  const connections: [number, number][] = [];
  for (let i = 0; i < zones.length - 1; i++) {
    connections.push([i, i + 1]);
  }
  return connections;
}

// ─── Door Placement ─────────────────────────────────────────────────────────

/**
 * Find wall tiles adjacent to at least one floor tile within a zone.
 * Prefers tiles on room perimeters.
 */
function findDoorCandidates(zone: ZoneData): Pos[] {
  const candidates: Pos[] = [];

  for (const room of zone.rooms) {
    // Check tiles just outside each room edge
    // Top edge (y = room.y - 1)
    for (let x = room.x; x < room.x + room.w; x++) {
      const y = room.y - 1;
      if (y >= 0 && !zone.floors.has(`${x},${y}`)) {
        candidates.push({ x, y });
      }
    }
    // Bottom edge (y = room.y + room.h)
    for (let x = room.x; x < room.x + room.w; x++) {
      const y = room.y + room.h;
      if (y < zone.height && !zone.floors.has(`${x},${y}`)) {
        candidates.push({ x, y });
      }
    }
    // Left edge (x = room.x - 1)
    for (let y = room.y; y < room.y + room.h; y++) {
      const x = room.x - 1;
      if (x >= 0 && !zone.floors.has(`${x},${y}`)) {
        candidates.push({ x, y });
      }
    }
    // Right edge (x = room.x + room.w)
    for (let y = room.y; y < room.y + room.h; y++) {
      const x = room.x + room.w;
      if (x < zone.width && !zone.floors.has(`${x},${y}`)) {
        candidates.push({ x, y });
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  return candidates.filter(p => {
    const key = `${p.x},${p.y}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Place a pair of doors connecting two zones. Mutates both zones' doors arrays.
 */
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
  const numZones = Math.max(2, randInt(2, config.maxZones));

  // Generate each zone independently
  const zones: ZoneData[] = [];
  for (let i = 0; i < numZones; i++) {
    zones.push(generateZone(i, config));
  }

  // Build zone graph and place doors
  const connections = buildZoneGraph(zones);
  const usedDoorPositions = new Set<string>();
  const nextDoorId = { value: 0 };

  for (const [a, b] of connections) {
    placeDoorPair(zones[a], zones[b], usedDoorPositions, nextDoorId);
  }

  const startZoneId = 0;
  const endZoneId = numZones - 1;

  return {
    zones,
    startZoneId,
    endZoneId,
    playerStart: roomCenter(zones[startZoneId].rooms[0]),
    portalPos: roomCenter(zones[endZoneId].rooms[zones[endZoneId].rooms.length - 1]),
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

  // Also mark door positions as occupied
  for (const zone of dungeon.zones) {
    for (const door of zone.doors) {
      occupied.add(`${zone.id}:${door.pos.x},${door.pos.y}`);
    }
  }

  for (const zone of dungeon.zones) {
    // Entrance room of the start zone has no enemies
    const isStartZone = zone.id === dungeon.startZoneId;
    const eligibleRooms = isStartZone ? zone.rooms.slice(1) : zone.rooms;
    if (eligibleRooms.length === 0 || config.enemyGroups.length === 0) continue;

    // More than half of eligible rooms get a group
    const groupCount = Math.ceil(eligibleRooms.length / 2) + randInt(0, Math.floor(eligibleRooms.length / 4));
    const roomCount = Math.min(groupCount, eligibleRooms.length);

    const shuffled = [...eligibleRooms].sort(() => Math.random() - 0.5);
    const selectedRooms = shuffled.slice(0, roomCount);

    for (const room of selectedRooms) {
      const group = config.enemyGroups[randInt(0, config.enemyGroups.length - 1)];
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

        instances.push({
          id: `${type.id}-${globalIdx++}`,
          type,
          pos: { x, y },
          currentHp: type.stats.hp,
          currentMp: type.stats.mp,
          aggroed: false,
          zoneId: zone.id,
          groupId,
          dots: [],
        });
      }
    }
  }

  return instances;
}

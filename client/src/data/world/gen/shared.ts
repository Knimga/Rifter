// Small helpers the generator's steps share: rectangles, rooms' tiles and spots, walking distances.
import { keyPos, neighbors, posKey, reachableTiles, STEPS, type Pos } from '../grid';
import { pick } from '../../random';
import type { Room, ZoneData } from './types';

export type Rect = Pick<Room, 'x' | 'y' | 'w' | 'h'>;

/** The four straight steps (no diagonals). */
export const DIRS4 = STEPS.slice(0, 4);

/** Whether `p` lies inside the rectangle. */
export const inRect = (p: Pos, r: Rect) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h;

export function roomCenter(room: Rect): Pos {
  return {
    x: Math.floor(room.x + room.w / 2),
    y: Math.floor(room.y + room.h / 2),
  };
}

export function fillRect(floors: Set<string>, r: Rect): void {
  for (let x = r.x; x < r.x + r.w; x++) {
    for (let y = r.y; y < r.y + r.h; y++) floors.add(posKey({ x, y }));
  }
}

/**
 * A new zone of `floors` and `rooms`: no doors, islands or obstacles yet, nothing lying on it, sight over its floor
 * (sightOf sets the final one once its floor is done).
 */
export const newZone = (id: number, width: number, height: number, floors: Set<string>, rooms: Room[]): ZoneData => ({
  id, width, height, floors, rooms, doors: [], islands: new Set(), obstacles: [], sight: floors,
  droppedItems: {}, droppedKeys: {}, droppedGold: {}, droppedShards: {},
});

/** A room's floor tiles (within its rectangle: a cavern's or one with islands isn't all floor). */
export function roomFloor(zone: Pick<ZoneData, 'floors'>, room: Rect): Pos[] {
  const tiles: Pos[] = [];
  for (let x = room.x; x < room.x + room.w; x++)
    for (let y = room.y; y < room.y + room.h; y++) if (zone.floors.has(posKey({ x, y }))) tiles.push({ x, y });
  return tiles;
}

/**
 * The room's floor tile nearest its center (its center, unless that's an island or outside a cavern's shape).
 * `open`: only among the tiles with floor all around them, if there are any (a map object stood there never cuts a way off).
 */
export function roomSpot(zone: Pick<ZoneData, 'floors'>, room: Rect, open = false): Pos {
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

/** Walking distance (steps, by the movement rules) from `from` to every floor tile of `zone` it can reach. */
export function walkDistances(zone: ZoneData, from: Pos): Map<string, number> {
  const steps = new Map<string, number>();
  for (const [key, r] of reachableTiles(from, Infinity, p => zone.floors.has(posKey(p)))) steps.set(key, r.steps);
  return steps;
}

/** A random floor tile of the zone. */
export const randomFloor = (zone: ZoneData): Pos => keyPos(pick([...zone.floors]));

/** The floor tile farthest (by walking) from `from`: one end of the zone. */
export function farFloor(zone: ZoneData, from: Pos): Pos {
  let far = from, best = -1;
  for (const [key, d] of walkDistances(zone, from)) {
    if (d > best) { best = d; far = keyPos(key); }
  }
  return far;
}

/** The zone's room nearest by walking (`steps`: walkDistances from a spot, e.g. its entry): the room that spot opens into. */
export function nearestRoom(zone: ZoneData, steps: Map<string, number>): Room | null {
  const dist = (r: Room) => Math.min(...roomFloor(zone, r).map(p => steps.get(posKey(p)) ?? Infinity));
  return zone.rooms.reduce<Room | null>((best, r) => (!best || dist(r) < dist(best) ? r : best), null);
}

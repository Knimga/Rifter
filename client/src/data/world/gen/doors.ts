// Where a zone's doors go: spots set into its rooms' walls, picked far across the zone, linked in pairs.
import { pick } from '../../random';
import { posKey, type Pos } from '../grid';
import { DIRS4, roomFloor, walkDistances } from './shared';
import type { ZoneData } from './types';

// ─── Door Placement ─────────────────────────────────────────────────────────

/**
 * Where a door can go: a wall tile set into the edge of a room's floor (deduplicated), never an island or obstacle. Along a
 * rectangular room's sides; around a round room, any wall tile with exactly one floor tile beside it (not
 * diagonally) and wall behind it, so the door is set into the wall, facing into the room.
 */
export function findDoorCandidates(zone: ZoneData): Pos[] {
  const candidates = new Map<string, Pos>();
  const isFloor = (p: Pos) => zone.floors.has(posKey(p));
  const consider = (p: Pos) => {
    if (p.x >= 0 && p.y >= 0 && p.x < zone.width && p.y < zone.height && !isFloor(p) && !zone.islands.has(posKey(p)) && !zone.obstacles.some(o => o.tiles.some(t => t.x === p.x && t.y === p.y))) {
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

/** Walking distance to a door (a wall tile): to the nearest floor tile beside it. Infinity if none is reached. */
export function doorDistance(door: Pos, steps: Map<string, number>): number {
  let best = Infinity;
  for (const [dx, dy] of DIRS4) best = Math.min(best, steps.get(posKey({ x: door.x + dx, y: door.y + dy })) ?? Infinity);
  return best;
}

/**
 * A door spot as far as possible from `from` by walking: a random pick among the candidates within
 * FAR_SHARE of the farthest, so doors vary between runs but always sit across the zone.
 */
export function farDoorSpot(zone: ZoneData, from: Pos, exclude: Pos[] = []): Pos | null {
  const steps = walkDistances(zone, from);
  const scored = findDoorCandidates(zone)
    .filter(c => !exclude.some(e => e.x === c.x && e.y === c.y))
    .map(c => ({ c, d: doorDistance(c, steps) }))
    .filter(s => Number.isFinite(s.d));
  if (scored.length === 0) return null;
  const max = Math.max(...scored.map(s => s.d));
  return pick(scored.filter(s => s.d >= max * FAR_SHARE)).c;
}

/** Link two neighbouring zones with a pair of doors (A's way forward, B's way back). */
export function linkDoors(zoneA: ZoneData, posA: Pos, zoneB: ZoneData, posB: Pos, nextDoorId: { value: number }): void {
  const idA = `door-${nextDoorId.value++}`;
  const idB = `door-${nextDoorId.value++}`;
  zoneA.doors.push({ id: idA, pos: posA, to: { zoneId: zoneB.id, doorId: idB } });
  zoneB.doors.push({ id: idB, pos: posB, to: { zoneId: zoneA.id, doorId: idA } });
}

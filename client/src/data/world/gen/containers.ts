// Where a zone's containers (chests, a dead adventurer) stand: against its rooms' walls, far from its entry.
import { shuffle } from '../../random';
import { neighbors, posKey, reachableTiles, type Pos } from '../grid';
import { DIRS4, inRect, walkDistances } from './shared';
import type { DungeonChest, Room, ZoneData } from './types';

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
export function placeContainers(zone: ZoneData, objects: string[], rooms: Room[], entry: Pos, rifts: Pos[], keepClear: Pos[]): DungeonChest[] {
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

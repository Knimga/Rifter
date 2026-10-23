// What the party can see: fog of war's game rule. A tile is visible when a living party member stands on it
// or has line of sight to it (hasLineOfSight, the rule aggro uses too), at any distance. Walls are seen when
// they border floor a viewer can see. Pure: the view draws the fog from these sets (viewEngine/three/fog.ts).
import { hasLineOfSight, posKey, type Pos } from './grid';
import type { ZoneData } from './dungeonGen';

const NEIGHBORS = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]] as const;

/** Keys of every floor tile of the zone, and every wall tile next to floor, that a viewer sees now. */
export function visibleTiles(zone: ZoneData, viewers: Pos[]): Set<string> {
  const out = new Set<string>();
  const { floors } = zone;
  const isFloor = (x: number, y: number) => floors.has(`${x},${y}`);
  for (let y = 0; y < zone.height; y++) {
    for (let x = 0; x < zone.width; x++) {
      const floor = isFloor(x, y);
      // A wall only matters (and is only ever seen) where it borders floor
      if (!floor && !NEIGHBORS.some(([dx, dy]) => isFloor(x + dx, y + dy))) continue;
      const p = { x, y };
      if (viewers.some(v => (v.x === x && v.y === y) || hasLineOfSight(v, p, floors))) out.add(posKey(p));
    }
  }
  return out;
}

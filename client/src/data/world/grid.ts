// Grid geometry, shared by everything on a map: tiles (Pos), distance, line of sight, and walking (one set of
// step rules for party members and creatures alike).

export type Pos = { x: number; y: number };

/** Map/set key for a tile: "x,y". */
export const posKey = (p: Pos) => `${p.x},${p.y}`;

export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;

export function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** One of the 8 tiles touching `a` (not `a` itself). */
export const isAdjacent = (a: Pos, b: Pos) => chebyshev(a, b) === 1;

/** Bresenham line from `a` to `b`, excluding `a`, including `b`. */
export function bresenham(a: Pos, b: Pos): Pos[] {
  const tiles: Pos[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const dy = Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let err = dx - dy;
  while (x !== b.x || y !== b.y) {
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    tiles.push({ x, y });
  }
  return tiles;
}

/** True if every tile strictly between a and b is floor. */
export function hasLineOfSight(a: Pos, b: Pos, floors: ReadonlySet<string>): boolean {
  return bresenham(a, b).slice(0, -1).every(p => floors.has(posKey(p)));
}

/**
 * Up to `count` tiles passing `isOpen`, searched ring by ring outward from `center`
 * (radius 1..maxRadius, closest ring first). Excludes `center` itself.
 */
export function findOpenTilesNear(center: Pos, isOpen: (p: Pos) => boolean, count: number, maxRadius: number): Pos[] {
  const found: Pos[] = [];
  for (let r = 1; r <= maxRadius && found.length < count; r++) {
    for (let dx = -r; dx <= r && found.length < count; dx++) {
      for (let dy = -r; dy <= r && found.length < count; dy++) {
        if (Math.abs(dx) < r && Math.abs(dy) < r) continue; // outer ring only
        const p = { x: center.x + dx, y: center.y + dy };
        if (isOpen(p)) found.push(p);
      }
    }
  }
  return found;
}

// ─── Movement ─────────────────────────────────────────────────────────────────
// One set of rules for everyone who walks (party members and enemies): a move is a path of steps to
// any of the 8 neighbouring tiles, each costing 1 movement. A step must land on a walkable tile, and a
// diagonal step may not cut a wall corner (both tiles beside it must be walkable too).

const STEPS: readonly [number, number][] = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** True if one step from `from` by (dx, dy) is allowed: onto a walkable tile, never cutting a wall corner. */
export function canStep(from: Pos, dx: number, dy: number, isWalkable: (p: Pos) => boolean): boolean {
  if (!isWalkable({ x: from.x + dx, y: from.y + dy })) return false;
  return dx === 0 || dy === 0 || (isWalkable({ x: from.x + dx, y: from.y }) && isWalkable({ x: from.x, y: from.y + dy }));
}

/** A tile reached by walking, and how many steps it takes. */
export interface Reach {
  pos: Pos;
  steps: number;
  /** The tile it is stepped onto from, on a shortest path (none for the start). */
  prev?: Pos;
}

/** The walk to `to` (start tile first, `to` last) found by reachableTiles; empty if it wasn't reached. */
export function pathTo(reach: Map<string, Reach>, to: Pos): Pos[] {
  const path: Pos[] = [];
  for (let r = reach.get(posKey(to)); r; r = r.prev && reach.get(posKey(r.prev))) path.push(r.pos);
  return path.reverse();
}

/**
 * Every tile reachable from `from` within `maxSteps` steps (the start included, at 0), by shortest path,
 * in order of distance. `isWalkable`: floor (not wall). `isBlocked`: walkable tiles the mover may not pass
 * through (e.g. enemies, for the party). Where a mover may END is the caller's choice (partyMoveTargets).
 */
export function reachableTiles(from: Pos, maxSteps: number, isWalkable: (p: Pos) => boolean, isBlocked: (p: Pos) => boolean = () => false): Map<string, Reach> {
  const reach = new Map<string, Reach>([[posKey(from), { pos: from, steps: 0 }]]);
  const queue: Reach[] = [reach.get(posKey(from))!];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur.steps >= maxSteps) continue;
    for (const [dx, dy] of STEPS) {
      const next = { x: cur.pos.x + dx, y: cur.pos.y + dy };
      const key = posKey(next);
      if (reach.has(key) || isBlocked(next) || !canStep(cur.pos, dx, dy, isWalkable)) continue;
      const r = { pos: next, steps: cur.steps + 1, prev: cur.pos };
      reach.set(key, r);
      queue.push(r);
    }
  }
  return reach;
}

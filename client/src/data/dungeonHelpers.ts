import type { AreaType } from './classes';

// ─── Shared grid geometry utilities ───────────────────────────────────────────

export type Pos = { x: number; y: number };

/** Map/set key for a tile: "x,y". */
export const posKey = (p: Pos) => `${p.x},${p.y}`;

export const samePos = (a: Pos, b: Pos) => a.x === b.x && a.y === b.y;

/** Scale each RGB channel of a hex color by `factor` (e.g. 1.4 to brighten). */
export function brightenHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((n & 0xff) * factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function chebyshev(a: Pos, b: Pos): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** One of the 8 tiles touching `a` (not `a` itself). */
export const isAdjacent = (a: Pos, b: Pos) => chebyshev(a, b) === 1;

/** Bresenham line from `a` to `b`, excluding `a`, including `b`. */
function bresenham(a: Pos, b: Pos): Pos[] {
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
export function hasLineOfSight(a: Pos, b: Pos, floors: Set<string>): boolean {
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
      const r = { pos: next, steps: cur.steps + 1 };
      reach.set(key, r);
      queue.push(r);
    }
  }
  return reach;
}

/**
 * Where a party member may move this turn: tile key -> steps it costs. Unwalkable tiles (walls, and
 * tiles a game object stands on, like the portal: see isWalkable) and enemies block the way; the mover
 * may pass other party members but can't stop on anyone.
 */
export function partyMoveTargets(
  from: Pos,
  movement: number,
  isWalkable: (p: Pos) => boolean,
  isEnemy: (p: Pos) => boolean,
  isOccupied: (p: Pos) => boolean,
): Map<string, number> {
  const out = new Map<string, number>();
  for (const [key, r] of reachableTiles(from, movement, isWalkable, isEnemy)) {
    if (r.steps > 0 && !isOccupied(r.pos)) out.set(key, r.steps);
  }
  return out;
}

// ─── Area-of-effect tile computation ──────────────────────────────────────────

/** Returns the floor tiles affected by an area ability aimed at `target`. */
export function getAffectedTiles(
  caster: Pos,
  target: Pos,
  area: AreaType | undefined,
  floors: Set<string>,
): Pos[] {
  if (area === 'blast1' || area === 'blast2') {
    const radius = area === 'blast1' ? 1 : 2;
    const tiles: Pos[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const p = { x: target.x + dx, y: target.y + dy };
        if (floors.has(posKey(p))) tiles.push(p);
      }
    }
    return tiles;
  }

  if (area === 'line') {
    // Line from the caster toward the target; a wall stops it
    const line = bresenham(caster, target);
    const firstWall = line.findIndex(p => !floors.has(posKey(p)));
    return firstWall === -1 ? line : line.slice(0, firstWall);
  }

  return [target];
}

/** Keys of the tiles an ability aimed at `target` affects — for "which units are hit" lookups. */
export const affectedKeys = (caster: Pos, target: Pos, area: AreaType | undefined, floors: Set<string>) =>
  new Set(getAffectedTiles(caster, target, area, floors).map(posKey));

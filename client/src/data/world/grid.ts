// Grid geometry, shared by everything on a map: tiles (Pos), distance, line of sight, and walking (one set of
// step rules for party members and creatures alike).

export type Pos = { x: number; y: number };

/** Map/set key for a tile: "x,y". */
export const posKey = (p: Pos) => `${p.x},${p.y}`;

/** The tile a posKey names: "x,y" → { x, y }. */
export const keyPos = (key: string): Pos => {
  const [x, y] = key.split(',').map(Number);
  return { x, y };
};

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

// ─── Bodies ───────────────────────────────────────────────────────────────────
// A unit fills a square of tiles: one (everyone, by default) or 2×2 (a large creature). Its `pos` is the square's
// top-left tile. Range, adjacency and sight are measured between whole bodies; a bare tile is a body of size 1.

/** A unit's square on the map: `pos` its top-left tile, `size` its side in tiles (default 1). */
export interface Body { pos: Pos; size?: number }

/** A tile or a body, as a body. */
const asBody = (b: Pos | Body): Body => ('pos' in b ? b : { pos: b });

/** The tiles a body covers (top-left first). */
export function footprint(b: Pos | Body): Pos[] {
  const { pos, size = 1 } = asBody(b);
  const out: Pos[] = [];
  for (let dy = 0; dy < size; dy++) for (let dx = 0; dx < size; dx++) out.push({ x: pos.x + dx, y: pos.y + dy });
  return out;
}

/** posKeys of the tiles a body covers. */
export const footprintKeys = (b: Pos | Body): string[] => footprint(b).map(posKey);

/** Whether a body covers tile `p`. */
export function covers(b: Body, p: Pos): boolean {
  const s = b.size ?? 1;
  return p.x >= b.pos.x && p.x < b.pos.x + s && p.y >= b.pos.y && p.y < b.pos.y + s;
}

/** The body's center, in tile coordinates (a 1-tile body's is its tile; a 2×2's the corner its 4 tiles share). */
export function bodyCenter(b: Body): Pos {
  const half = ((b.size ?? 1) - 1) / 2;
  return { x: b.pos.x + half, y: b.pos.y + half };
}

/** Chebyshev distance between two bodies: the gap between their squares (0: overlapping, 1: touching). */
export function bodyDistance(a: Pos | Body, b: Pos | Body): number {
  const A = asBody(a), B = asBody(b);
  const gap = (a0: number, as: number, b0: number, bs: number) => Math.max(0, b0 - (a0 + as - 1), a0 - (b0 + bs - 1));
  return Math.max(gap(A.pos.x, A.size ?? 1, B.pos.x, B.size ?? 1), gap(A.pos.y, A.size ?? 1, B.pos.y, B.size ?? 1));
}

/** True if any tile of `a` has line of sight to any tile of `b`. */
export function bodySight(a: Pos | Body, b: Pos | Body, floors: ReadonlySet<string>): boolean {
  const to = footprint(b);
  return footprint(a).some(p => to.some(q => samePos(p, q) || hasLineOfSight(p, q, floors)));
}

/**
 * True if `to` is within `range` tiles of `from` and in its sight, body to body: what aiming, aggro and reach all
 * ask.
 */
export const inRangeAndSight = (from: Pos | Body, to: Pos | Body, range: number, floors: ReadonlySet<string>) =>
  bodyDistance(from, to) <= range && bodySight(from, to, floors);

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
// diagonal step may not squeeze between two wall corners (at least one tile beside it must be walkable; past a
// single corner is fine). Units never count here: who may be passed is the mover's isBlocked.

/** The 8 steps to a neighbouring tile: the 4 straight ones first, then the diagonals. */
export const STEPS: readonly (readonly [number, number])[] = [[0, 1], [1, 0], [0, -1], [-1, 0], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** The 8 tiles around `p` (diagonals included). */
export const neighbors = (p: Pos): Pos[] => STEPS.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }));

/** True if one step from `from` by (dx, dy) is allowed: onto a walkable tile, never between two wall corners. */
export function canStep(from: Pos, dx: number, dy: number, isWalkable: (p: Pos) => boolean): boolean {
  if (!isWalkable({ x: from.x + dx, y: from.y + dy })) return false;
  return dx === 0 || dy === 0 || isWalkable({ x: from.x + dx, y: from.y }) || isWalkable({ x: from.x, y: from.y + dy });
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
 * Whether a body of `size` at `from` may step by (dx, dy). Size 1: canStep. Larger, it squeezes: some tile of it
 * makes the step by canStep (so a one-tile core slides through a 1-wide opening, never through a wall), no tile of
 * where it lands is blocked (it can't squeeze past those it may not pass), and the floor under it there isn't just
 * a diagonal pair (the core never cuts between two wall corners).
 */
function canBodyStep(from: Pos, dx: number, dy: number, size: number, isWalkable: (p: Pos) => boolean, isBlocked: (p: Pos) => boolean): boolean {
  if (size === 1) return !isBlocked({ x: from.x + dx, y: from.y + dy }) && canStep(from, dx, dy, isWalkable);
  const to = footprint({ pos: { x: from.x + dx, y: from.y + dy }, size });
  if (to.some(isBlocked)) return false;
  if (!footprint({ pos: from, size }).some(t => isWalkable(t) && canStep(t, dx, dy, isWalkable))) return false;
  const floor = to.filter(isWalkable);
  return !(floor.length === 2 && floor[0].x !== floor[1].x && floor[0].y !== floor[1].y);
}

/**
 * Every tile reachable from `from` within `maxSteps` steps (the start included, at 0), by shortest path,
 * in order of distance. `isWalkable`: floor (not wall). `isBlocked`: walkable tiles the mover may not pass
 * through (e.g. enemies, for the party). `size`: a large body's side (its tiles are its top-left's; it squeezes:
 * canBodyStep). Where a mover may END is the caller's choice (partyMoveTargets; for a large body, where it `fits`).
 */
export function reachableTiles(from: Pos, maxSteps: number, isWalkable: (p: Pos) => boolean, isBlocked: (p: Pos) => boolean = () => false, size = 1): Map<string, Reach> {
  const reach = new Map<string, Reach>([[posKey(from), { pos: from, steps: 0 }]]);
  const queue: Reach[] = [reach.get(posKey(from))!];
  for (let head = 0; head < queue.length; head++) {
    const cur = queue[head];
    if (cur.steps >= maxSteps) continue;
    for (const [dx, dy] of STEPS) {
      const next = { x: cur.pos.x + dx, y: cur.pos.y + dy };
      const key = posKey(next);
      if (reach.has(key) || !canBodyStep(cur.pos, dx, dy, size, isWalkable, isBlocked)) continue;
      const r = { pos: next, steps: cur.steps + 1, prev: cur.pos };
      reach.set(key, r);
      queue.push(r);
    }
  }
  return reach;
}

/** Whether a body fits with its top-left at `pos`: every tile of it `isOpen` (walkable, no one else on it). */
export const fits = (pos: Pos, size: number, isOpen: (p: Pos) => boolean): boolean =>
  footprint({ pos, size }).every(isOpen);

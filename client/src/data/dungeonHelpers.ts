import type { AreaType } from './classes';

// ─── Shared dungeon geometry utilities ────────────────────────────────────────

export function chebyshev(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/** Bresenham LOS: true if every tile between a and b (exclusive of endpoints) is floor. */
export function hasLineOfSight(
  a: { x: number; y: number },
  b: { x: number; y: number },
  floors: Set<string>,
): boolean {
  let x0 = a.x, y0 = a.y;
  const x1 = b.x, y1 = b.y;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if ((x0 !== a.x || y0 !== a.y) && (x0 !== b.x || y0 !== b.y)) {
      if (!floors.has(`${x0},${y0}`)) return false;
    }
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
  return true;
}

// ─── Area-of-effect tile computation ──────────────────────────────────────────

type Pos = { x: number; y: number };

/** Bresenham line from `from` to `to`, exclusive of `from`, inclusive of `to`. Stops at walls. */
function getLineTiles(from: Pos, to: Pos, floors: Set<string>): Pos[] {
  const tiles: Pos[] = [];
  let x = from.x, y = from.y;
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  const sx = from.x < to.x ? 1 : -1;
  const sy = from.y < to.y ? 1 : -1;
  let err = dx - dy;

  while (true) {
    if (x === to.x && y === to.y) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 < dx) { err += dx; y += sy; }
    if (!floors.has(`${x},${y}`)) break; // wall stops the line
    tiles.push({ x, y });
    if (x === to.x && y === to.y) break;
  }
  return tiles;
}

/** Returns the set of floor tiles affected by an area ability centred on `target`. */
export function getAffectedTiles(
  caster: Pos,
  target: Pos,
  area: AreaType | undefined,
  floors: Set<string>,
): Pos[] {
  if (!area || area === 'single') return [target];

  if (area === 'blast1' || area === 'blast2') {
    const radius = area === 'blast1' ? 1 : 2;
    const tiles: Pos[] = [];
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dy = -radius; dy <= radius; dy++) {
        const p = { x: target.x + dx, y: target.y + dy };
        if (floors.has(`${p.x},${p.y}`)) tiles.push(p);
      }
    }
    return tiles;
  }

  if (area === 'line') return getLineTiles(caster, target, floors);

  return [target];
}

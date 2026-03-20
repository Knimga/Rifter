import type { AreaType } from './classes';

// ─── Shared dungeon geometry utilities ────────────────────────────────────────

/** Scale each RGB channel of a hex color by `factor` (e.g. 1.4 to brighten). */
export function brightenHex(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 0xff) * factor));
  const g = Math.min(255, Math.round(((n >> 8) & 0xff) * factor));
  const b = Math.min(255, Math.round((n & 0xff) * factor));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

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

/**
 * Returns true if `pos` is a valid tile for the active mover to move to.
 * @param isWalkable  - tile is passable (floor, not wall)
 * @param isOccupied  - tile is blocked by an entity (enemy, NPC, party member)
 * @param isSpecialTile - tile is a special interactive tile that can't be moved onto (portal, etc.)
 */
export function isValidMoveTarget(
  pos: Pos,
  activeMoverPos: Pos,
  movement: number,
  isWalkable: (pos: Pos) => boolean,
  isOccupied: (pos: Pos) => boolean,
  isSpecialTile: (pos: Pos) => boolean = () => false,
): boolean {
  if (!isWalkable(pos)) return false;
  if (isSpecialTile(pos)) return false;
  if (pos.x === activeMoverPos.x && pos.y === activeMoverPos.y) return false;
  if (isOccupied(pos)) return false;
  if (chebyshev(activeMoverPos, pos) > movement) return false;
  return true;
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

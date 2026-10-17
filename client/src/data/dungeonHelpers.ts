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
  if (samePos(pos, activeMoverPos)) return false;
  if (isOccupied(pos)) return false;
  if (chebyshev(activeMoverPos, pos) > movement) return false;
  return true;
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

// What stands in a zone's rooms: wall islands and obstacles (decorative objects), and the tiles sight passes over.
import { chance, pick, randInt } from '../../random';
import { keyPos, neighbors, posKey, reachableTiles, type Pos } from '../grid';
import { decorObject } from '../decorObjects';
import { DIRS4, roomFloor } from './shared';
import type { GenOptions, IslandConfig, ObstacleConfig, Room, ZoneData } from './types';

// ─── Islands ─────────────────────────────────────────────────────────────────

/** True if every floor tile of the zone can be walked to from every other (by the movement rules). */
function allConnected(floors: Set<string>): boolean {
  const first = floors.values().next().value;
  if (first === undefined) return true;
  return reachableTiles(keyPos(first), Infinity, p => floors.has(posKey(p))).size === floors.size;
}

/**
 * Islands in a share of the rooms (IslandConfig): in each, blobs of wall grown from random floor tiles until
 * about `density` of its floor is island. An island tile needs all 8 tiles around it to be floor (or its own
 * island), so islands keep a gap of at least one tile from the walls and each other; an island is kept only if
 * every floor tile of the zone can still be walked to.
 */
export function placeIslands(zone: ZoneData, cfg: IslandConfig): Set<Room> {
  const { floors, islands } = zone;
  const filled = new Set<Room>();
  for (const room of zone.rooms) {
    if (!chance(cfg.roomChance)) continue;
    const roomTiles = roomFloor(zone, room);
    let left = Math.round(roomTiles.length * cfg.density);
    // Never smaller than the size range allows: once the room's share left is below it, the room is done
    for (let tries = 0; left >= cfg.size[0] && tries < 40; tries++) {
      const own = new Set<string>();
      const fits = (p: Pos) => floors.has(posKey(p)) && !own.has(posKey(p)) && neighbors(p).every(q => floors.has(posKey(q)) || own.has(posKey(q)));
      const seeds = roomTiles.filter(fits);
      if (seeds.length === 0) break;
      const target = Math.min(left, randInt(cfg.size[0], cfg.size[1]));
      const grown = [pick(seeds)];
      own.add(posKey(grown[0]));
      while (own.size < target) {
        const next = grown.flatMap(p => DIRS4.map(([dx, dy]) => ({ x: p.x + dx, y: p.y + dy }))).filter(fits);
        if (next.length === 0) break;
        const p = pick(next);
        grown.push(p);
        own.add(posKey(p));
      }
      // Too little room to grow to its minimum: not placed
      if (own.size < cfg.size[0]) continue;
      for (const k of own) floors.delete(k);
      if (!allConnected(floors)) {
        for (const k of own) floors.add(k);
        continue;
      }
      for (const k of own) islands.add(k);
      filled.add(room);
      left -= own.size;
    }
  }
  return filled;
}

// ─── Obstacles ───────────────────────────────────────────────────────────────

/** The four grid directions an obstacle can face. */
const FACINGS: readonly (readonly [number, number])[] = [[0, 1], [1, 0], [0, -1], [-1, 0]];

/**
 * Obstacles in a share of `rooms` (ObstacleConfig), skipping `skip` (rooms with islands): in each, objects picked at
 * random, each turned a random way, until about `density` of its floor is filled (at least one). Like an island, every
 * tile of an obstacle needs all 8 tiles around it to be floor (or its own), so obstacles keep a gap from the walls and
 * each other; one is kept only if every floor tile of the zone can still be walked to. Their tiles leave the floor.
 */
export function placeObstacles(zone: ZoneData, cfg: ObstacleConfig, rooms: Room[], skip: ReadonlySet<Room>, gen: GenOptions): void {
  const objects = cfg.objects.map(decorObject).filter(gen.placeable);
  if (!objects.length) return;
  const { floors } = zone;
  for (const room of rooms) {
    if (skip.has(room) || !chance(cfg.roomChance)) continue;
    const roomTiles = roomFloor(zone, room);
    let left = Math.max(1, Math.round(roomTiles.length * cfg.density));
    for (let tries = 0; left > 0 && tries < 40; tries++) {
      const object = pick(objects), facing = pick(FACINGS);
      const across = object.span ?? 1, deep = object.depth ?? 1;
      // Facing north or south, it is `across` wide along x; facing east or west, along y
      const size: [number, number] = facing[0] === 0 ? [across, deep] : [deep, across];
      const tilesAt = (o: Pos): Pos[] => {
        const out: Pos[] = [];
        for (let dx = 0; dx < size[0]; dx++) for (let dy = 0; dy < size[1]; dy++) out.push({ x: o.x + dx, y: o.y + dy });
        return out;
      };
      const fitsAt = (o: Pos) => {
        const own = new Set(tilesAt(o).map(posKey));
        return tilesAt(o).every(t => floors.has(posKey(t)) && neighbors(t).every(q => floors.has(posKey(q)) || own.has(posKey(q))));
      };
      const spots = roomTiles.filter(fitsAt);
      if (!spots.length) continue;
      const pos = pick(spots), tiles = tilesAt(pos);
      for (const t of tiles) floors.delete(posKey(t));
      if (!allConnected(floors)) {
        for (const t of tiles) floors.add(posKey(t));
        continue;
      }
      zone.obstacles.push({ id: `obstacle-${zone.id}-${zone.obstacles.length}`, object: object.id, pos, size, facing, tiles });
      left -= tiles.length;
    }
  }
}

/**
 * The tiles sight passes over in a zone: its floor, with the tiles of its obstacles that don't block sight. Set once
 * the zone is built (generateDungeon); its floor itself while it has none.
 */
export function sightOf(zone: ZoneData): ReadonlySet<string> {
  const seeThrough = zone.obstacles.filter(o => !decorObject(o.object).blocksSight).flatMap(o => o.tiles.map(posKey));
  return seeThrough.length ? new Set([...zone.floors, ...seeThrough]) : zone.floors;
}

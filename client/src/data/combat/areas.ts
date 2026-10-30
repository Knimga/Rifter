// Ability areas: which tiles an ability aimed at a tile affects (a single tile, a blast, a line).
import type { Ability, AreaType } from './abilities';
import { bresenham, chebyshev, covers, footprint, footprintKeys, posKey, type Body, type Pos } from '../world/grid';

/** Whether an ability hits an area (blast, line) rather than one unit. */
export const isArea = (a: { area?: AreaType }): boolean => !!a.area && a.area !== 'single';

/**
 * A burst from self: an area ability with range 0, so it can only be aimed at the caster's own tile and hits
 * the area around it (e.g. Cleave, Flame Belch: everything adjacent).
 */
export const isSelfBurst = (a: { area?: AreaType; range: number }): boolean => isArea(a) && a.range === 0;

/**
 * The floor tiles affected by an area ability aimed at `target`: a tile, or a body (areaCenter: a large creature
 * aimed at, or a large caster's own burst). A blast spreads around the whole of it (blast1 on a 2×2: it and the
 * ring of 12 around it); a line runs from the caster's tile nearest the aim.
 */
export function getAffectedTiles(
  caster: Pos | Body,
  target: Pos | Body,
  area: AreaType | undefined,
  floors: ReadonlySet<string>,
): Pos[] {
  const center = 'pos' in target ? target : { pos: target };
  if (area === 'blast1' || area === 'blast2') {
    const radius = area === 'blast1' ? 1 : 2;
    const size = center.size ?? 1;
    const tiles: Pos[] = [];
    for (let dx = -radius; dx < size + radius; dx++) {
      for (let dy = -radius; dy < size + radius; dy++) {
        const p = { x: center.pos.x + dx, y: center.pos.y + dy };
        if (floors.has(posKey(p))) tiles.push(p);
      }
    }
    return tiles;
  }

  if (area === 'line') {
    // Line from the caster toward the target; a wall stops it
    const from = footprint(caster).reduce((a, b) => (chebyshev(b, center.pos) < chebyshev(a, center.pos) ? b : a));
    const line = bresenham(from, center.pos);
    const firstWall = line.findIndex(p => !floors.has(posKey(p)));
    return firstWall === -1 ? line : line.slice(0, firstWall);
  }

  return footprint(center);
}

/** Keys of the tiles an ability aimed at `target` affects — for "which units are hit" lookups. */
export const affectedKeys = (caster: Pos | Body, target: Pos | Body, area: AreaType | undefined, floors: ReadonlySet<string>) =>
  new Set(getAffectedTiles(caster, target, area, floors).map(posKey));

/**
 * What an area aimed at tile `at` centers on: the large body standing there (its whole square), else the tile.
 * `units`: everyone on the map.
 */
export const areaCenter = (at: Pos, units: Body[]): Pos | Body =>
  units.find(u => (u.size ?? 1) > 1 && covers(u, at)) ?? at;

/**
 * Keys of the tiles an ability used by `caster` and aimed at tile `at` affects, with `units` (everyone else on the
 * map) in place: centered on the large body there, if any (areaCenter; the caster's own, for its burst). What
 * aiming, the AI, the hits and the map's preview all use.
 */
export const aimedArea = (caster: Body, at: Pos, area: AreaType | undefined, floors: ReadonlySet<string>, units: Body[]) =>
  affectedKeys(caster, areaCenter(at, [caster, ...units]), area, floors);

/**
 * What an ability's area does to those in it (the map tints it by this): harms (an enemy ability's effects on its
 * targets), helps (heals, buffs and HoTs on allies there, or on an ally ability's targets), or both ('mixed').
 */
export function areaTone(action: Ability): 'harm' | 'help' | 'mixed' {
  const helps = action.effects.some(e => (e.type === 'heal' || e.type === 'buff' || e.type === 'hot')
    && (e.appliesTo === 'allies' || (e.appliesTo === 'target' && action.target !== 'enemy')));
  const harms = action.target === 'enemy' && action.effects.some(e => e.appliesTo === 'target');
  return helps && harms ? 'mixed' : helps ? 'help' : 'harm';
}

/**
 * The units standing in an area (affectedKeys), any tile of them: e.g. the caster's allies an area ability's 'allies'
 * effects reach.
 */
export const unitsInArea = <T extends Body>(area: ReadonlySet<string>, units: T[]): T[] =>
  units.filter(u => footprintKeys(u).some(k => area.has(k)));

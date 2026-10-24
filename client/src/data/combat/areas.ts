// Ability areas: which tiles an ability aimed at a tile affects (a single tile, a blast, a line).
import type { Ability, AreaType } from './abilities';
import { bresenham, posKey, type Pos } from '../world/grid';

/** Whether an ability hits an area (blast, line) rather than one unit. */
export const isArea = (a: { area?: AreaType }): boolean => !!a.area && a.area !== 'single';

/**
 * A burst from self: an area ability with range 0, so it can only be aimed at the caster's own tile and hits
 * the area around it (e.g. Cleave, Flame Belch: everything adjacent).
 */
export const isSelfBurst = (a: { area?: AreaType; range: number }): boolean => isArea(a) && a.range === 0;

/** Returns the floor tiles affected by an area ability aimed at `target`. */
export function getAffectedTiles(
  caster: Pos,
  target: Pos,
  area: AreaType | undefined,
  floors: ReadonlySet<string>,
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
export const affectedKeys = (caster: Pos, target: Pos, area: AreaType | undefined, floors: ReadonlySet<string>) =>
  new Set(getAffectedTiles(caster, target, area, floors).map(posKey));

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

/** The units standing in an area (affectedKeys): e.g. the caster's allies an area ability's 'allies' effects reach. */
export const unitsInArea = <T extends { pos: Pos }>(area: ReadonlySet<string>, units: T[]): T[] =>
  units.filter(u => area.has(posKey(u.pos)));

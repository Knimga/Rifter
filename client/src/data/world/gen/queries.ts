// What the game asks of a generated dungeon while it is played: who may stand where, its rifts, its doors.
import type { EnemyInstance } from '../../units/enemies';
import { creatureTiles } from '../../units/enemies';
import { isBoss } from '../../units/bosses';
import { posKey, type Pos } from '../grid';
import type { Door, DungeonData, ZoneData } from './types';

/** Whether a door leads back to an earlier zone of its dungeon (the way the party entered its zone). */
export const leadsBack = (door: Door, zone: ZoneData) => door.to !== 'sanctum' && door.to.zoneId < zone.id;

/**
 * Tiles of a zone that a map object stands on (a rift, chests): nobody walks onto or through
 * them, party or enemy. They stay floor (drawn as floor; they don't block sight or AoE). The Sanctum's
 * blockers are handled the same way by isSanctumWalkable.
 */
export const objectTilesOf = (d: DungeonData, zone: ZoneData): Set<string> => new Set([
  ...d.rifts.filter(r => r.zoneId === zone.id).map(r => posKey(r.pos)),
  ...d.chests.filter(c => c.zoneId === zone.id).map(c => posKey(c.pos)),
]);

/** The zone's rift back to the Sanctum, if it has one. */
export const zoneRift = (d: DungeonData, zoneId: number): Pos | null => d.rifts.find(r => r.zoneId === zoneId)?.pos ?? null;

/**
 * Whether the zone's rift is still shut: the boss zone's opens only once its boss has fallen. Its tile stays taken
 * meanwhile (objectTilesOf), so nobody stands where it opens.
 */
export const riftShut = (d: DungeonData, zoneId: number, enemies: readonly EnemyInstance[]): boolean =>
  zoneId === d.endZoneId && enemies.some(e => e.zoneId === zoneId && isBoss(e) && e.currentHp > 0);

/** Walkable tiles of a zone: floor without a map object on it. */
export function zoneWalkable(d: DungeonData, zone: ZoneData): (p: Pos) => boolean {
  const objects = objectTilesOf(d, zone);
  return (p) => zone.floors.has(posKey(p)) && !objects.has(posKey(p));
}

/** A tile of `zone` where a party member can be placed: walkable, with no living enemy of that zone on it. */
export function isFreeFloor(d: DungeonData, zone: ZoneData, enemies: EnemyInstance[]): (p: Pos) => boolean {
  const walkable = zoneWalkable(d, zone);
  const taken = creatureTiles(enemies.filter(e => e.zoneId === zone.id && e.currentHp > 0));
  return (p) => walkable(p) && !taken.has(posKey(p));
}

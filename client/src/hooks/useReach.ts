// Where the acting party member can reach: the tiles it can move to now (with the steps each costs), and the
// tiles a 'tile' ability it has armed can be aimed at. The maps highlight exactly these, and the screen's move
// and action handlers accept only these.
import { useMemo } from 'react';
import type { DungeonData, ZoneData } from '../data/world/dungeonGen';
import { zoneWalkable } from '../data/world/dungeonGen';
import { isAlly, isHostile, type EnemyInstance } from '../data/units/enemies';
import { inRangeAndSight, keyPos, posKey, type Pos } from '../data/world/grid';
import { partyMoveTargets } from '../data/world/movement';
import { isSanctumWalkable } from '../data/world/sanctum';
import type { FogState } from './useFogOfWar';

export function useReach({ zone, dungeon, fog, partyTiles, zoneEnemies, mover, movement, combatActive, tileRange }: {
  /** The dungeon zone the party is in (null: the Sanctum). */
  zone: ZoneData | null;
  dungeon: DungeonData | null;
  fog: FogState | null;
  /** Where the party members on the map stand. */
  partyTiles: Pos[];
  /** Every creature of the zone. */
  zoneEnemies: EnemyInstance[];
  /** Who moves: where it stands, and how far it can go now (combat.ts moveBudget, or its movement out of combat). */
  mover: Pos;
  movement: number;
  combatActive: boolean;
  /** The armed 'tile' ability's range (null: none armed). */
  tileRange: number | null;
}): { moveTargets: Map<string, number>; tileTargets: Set<string> | null } {
  // Recomputed when someone moves (a key of every unit's tile), not on every render
  const living = zoneEnemies.filter(e => e.currentHp > 0);
  const unitTilesKey = [...partyTiles.map(posKey), '|', ...living.map(e => `${posKey(e.pos)}${isAlly(e) ? 'a' : ''}`)].join(';');
  const known = (key: string) => !fog || fog.visible.has(key) || fog.explored.has(key);

  // Where the mover can go this turn (tile key -> steps it costs), by the shared movement rules
  // (partyMoveTargets): walls, game objects (the rift, chests) and enemies block the way, and nobody stops on
  // an occupied tile (party members and summoned allies can be walked through). Never into unseen fog.
  const moveTargets = useMemo(() => {
    const isWalkable = zone && dungeon ? zoneWalkable(dungeon, zone) : isSanctumWalkable;
    const enemyTiles = new Set(living.filter(isHostile).map(e => posKey(e.pos)));
    const unitTiles = new Set([...living.map(e => posKey(e.pos)), ...partyTiles.map(posKey)]);
    const targets = partyMoveTargets(mover, movement, isWalkable, p => enemyTiles.has(posKey(p)), p => unitTiles.has(posKey(p)));
    for (const key of targets.keys()) if (!known(key)) targets.delete(key);
    return targets;
  }, [mover.x, mover.y, movement, zone, dungeon, unitTilesKey, fog]); // eslint-disable-line react-hooks/exhaustive-deps

  // A 'tile' ability (e.g. a summon placed at range): walkable floor in range and sight of the mover, that the
  // party sees now, with no one on it. In combat only.
  const tileTargets = useMemo(() => {
    if (tileRange === null || !combatActive || !zone || !dungeon) return null;
    const walkable = zoneWalkable(dungeon, zone);
    const taken = new Set([...partyTiles.map(posKey), ...living.map(e => posKey(e.pos))]);
    const out = new Set<string>();
    for (const key of zone.floors) {
      if (taken.has(key) || (fog && !fog.visible.has(key))) continue;
      const p = keyPos(key);
      if (walkable(p) && inRangeAndSight(mover, p, tileRange, zone.floors)) out.add(key);
    }
    return out;
  }, [tileRange, combatActive, zone, dungeon, mover.x, mover.y, unitTilesKey, fog]); // eslint-disable-line react-hooks/exhaustive-deps

  return { moveTargets, tileTargets };
}

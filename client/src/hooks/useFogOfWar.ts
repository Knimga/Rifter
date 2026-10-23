// Fog of war for the current zone: what the party sees now (visibleTiles) and what it has seen before
// (explored, remembered per zone until a new dungeon). Updated once per move, from where the party stands.
// No fog in the Sanctum (null).
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DungeonData } from '../data/world/dungeonGen';
import { posKey, type Pos } from '../data/world/grid';
import { visibleTiles } from '../data/world/visibility';

/** The fog of a zone: its size, and the tiles seen now and before (keys 'x,y'). Read by the map and its renderer. */
export interface FogState {
  cols: number;
  rows: number;
  visible: ReadonlySet<string>;
  explored: ReadonlySet<string>;
}

export function useFogOfWar({ location, dungeon, currentZone, viewers }: {
  location: 'sanctum' | 'dungeon';
  dungeon: DungeonData | null;
  currentZone: number;
  /** Where those who see for the party stand: the living members, and their summoned allies. */
  viewers: Pos[];
}): { fog: FogState | null; resetFog: () => void } {
  const zone = location === 'dungeon' ? dungeon?.zones[currentZone] ?? null : null;
  const viewersKey = viewers.map(posKey).join(';');
  // Recomputed only when someone moves (or the zone changes), not on every render
  const visible = useMemo(
    () => (zone ? visibleTiles(zone, viewers) : null),
    [zone?.id, zone?.floors, viewersKey], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Every tile each zone has shown, by zone id
  const [explored, setExplored] = useState<Record<number, ReadonlySet<string>>>({});
  useEffect(() => {
    if (!zone || !visible) return;
    setExplored(prev => {
      const seen = prev[zone.id];
      if (seen && [...visible].every(k => seen.has(k))) return prev; // nothing new: same state, no redraw
      return { ...prev, [zone.id]: new Set([...(seen ?? []), ...visible]) };
    });
  }, [zone?.id, visible]); // eslint-disable-line react-hooks/exhaustive-deps

  /** A new dungeon: everything is unseen again. */
  const resetFog = useCallback(() => setExplored({}), []);

  const zoneExplored = zone ? explored[zone.id] : undefined;
  const fog = useMemo<FogState | null>(() => {
    if (!zone || !visible) return null;
    // Visible tiles count as explored at once (the memory catches up a render later)
    return { cols: zone.width, rows: zone.height, visible, explored: zoneExplored ?? visible };
  }, [zone?.width, zone?.height, visible, zoneExplored]); // eslint-disable-line react-hooks/exhaustive-deps

  return { fog, resetFog };
}

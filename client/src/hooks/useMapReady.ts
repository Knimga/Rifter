// A new map (the Sanctum, a dungeon zone) shows its HTML floor a moment before its 3D layer has drawn (models,
// fog). Until it has, the screen hides the map under a dark cover, so it never shows bare or unfogged.
import { useCallback, useEffect, useState } from 'react';

/** Longest the map stays hidden waiting for its 3D layer (ms): if it never reports ready, show the map anyway. */
const MAP_READY_TIMEOUT_MS = 1500;

/**
 * Whether the map `mapKey` (which map is shown: a new key is a new map) is still loading, and the callback its
 * 3D layer calls once it has drawn (ModelLayer onReady).
 */
export function useMapReady(mapKey: string): { mapLoading: boolean; onMapReady: () => void } {
  const [readyMap, setReadyMap] = useState<string | null>(null);
  const mapLoading = readyMap !== mapKey;
  const onMapReady = useCallback(() => setReadyMap(mapKey), [mapKey]);
  useEffect(() => {
    if (!mapLoading) return;
    const id = setTimeout(() => setReadyMap(mapKey), MAP_READY_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [mapKey, mapLoading]);
  return { mapLoading, onMapReady };
}

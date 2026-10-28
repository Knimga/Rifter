// A new 3D scene (the Sanctum or a dungeon zone's map, character select's class models) shows its HTML a moment
// before its 3D layer has drawn (models, fog). Until it has, the screen hides it under a dark cover (LoadingCover),
// so it never shows bare or unfogged.
import { useCallback, useEffect, useState } from 'react';

/** Longest a scene stays hidden waiting for its 3D layer (ms): if it never reports ready, show it anyway. */
const SCENE_READY_TIMEOUT_MS = 1500;

/**
 * Whether the scene `sceneKey` (which one is shown: a new key is a new scene) is still loading, and the callback
 * its 3D layer calls once it has drawn (ModelLayer / ClassShowcase onReady).
 */
export function useSceneReady(sceneKey: string): { loading: boolean; onReady: () => void } {
  const [readyScene, setReadyScene] = useState<string | null>(null);
  const loading = readyScene !== sceneKey;
  const onReady = useCallback(() => setReadyScene(sceneKey), [sceneKey]);
  useEffect(() => {
    if (!loading) return;
    const id = setTimeout(() => setReadyScene(sceneKey), SCENE_READY_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [sceneKey, loading]);
  return { loading, onReady };
}

// Leaving a screen or a location: the screen fades to black (LoadingCover with fadeIn, COVER_FADE_MS or slower), and
// only then does the change happen; the next scene fades in once its 3D layer has drawn (useSceneReady).
import { useCallback, useEffect, useRef, useState } from 'react';
import { COVER_FADE_MS } from '../components/ui/LoadingCover';

/**
 * `fading`: the screen is fading to black, over `fadeMs`; `fadeOut(then, ms)`: start it (over `ms`, COVER_FADE_MS by
 * default), `then` runs once it is black.
 */
export function useFadeOut(): { fading: boolean; fadeMs: number; fadeOut: (then: () => void, ms?: number) => void } {
  const [fadeMs, setFadeMs] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const fadeOut = useCallback((then: () => void, ms = COVER_FADE_MS) => {
    if (timer.current !== undefined) return; // already leaving
    setFadeMs(ms);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setFadeMs(null);
      then();
    }, ms);
  }, []);
  return { fading: fadeMs !== null, fadeMs: fadeMs ?? COVER_FADE_MS, fadeOut };
}

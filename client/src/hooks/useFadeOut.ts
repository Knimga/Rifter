// Leaving a screen or a location: the screen fades to black (LoadingCover with fadeIn, COVER_FADE_MS), and only
// then does the change happen; the next scene fades in once its 3D layer has drawn (useSceneReady).
import { useCallback, useEffect, useRef, useState } from 'react';
import { COVER_FADE_MS } from '../components/ui/LoadingCover';

/** `fading`: the screen is fading to black; `fadeOut(then)`: start it, `then` runs once it is black. */
export function useFadeOut(): { fading: boolean; fadeOut: (then: () => void) => void } {
  const [fading, setFading] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const fadeOut = useCallback((then: () => void) => {
    if (timer.current !== undefined) return; // already leaving
    setFading(true);
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setFading(false);
      then();
    }, COVER_FADE_MS);
  }, []);
  return { fading, fadeOut };
}

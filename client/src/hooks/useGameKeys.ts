// The game screen's keyboard shortcuts: I toggles the party window (from a vendor's, switches to it); Escape backs out of whatever is on top.
import { useEffect } from 'react';
import { useLatest } from './useLatest';

export function useGameKeys(keys: {
  toggleSheet: () => void;
  /** Escape: close or cancel the topmost thing (the party window, then a chest window, then an armed ability). */
  escape: () => void;
}) {
  const latest = useLatest(keys);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'i' || e.key === 'I') latest.current.toggleSheet();
      else if (e.key === 'Escape') latest.current.escape();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [latest]);
}

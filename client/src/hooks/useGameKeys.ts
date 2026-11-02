// The game screen's keyboard shortcuts: I toggles the party window (from a vendor's, switches to it); Escape backs out of
// whatever is on top; Tab selects the next party member (Shift+Tab the one before), out of combat.
import { useEffect } from 'react';
import { useLatest } from './useLatest';

export function useGameKeys(keys: {
  toggleSheet: () => void;
  /** Escape: close or cancel the topmost thing (the party window, then a chest window, then an armed ability). */
  escape: () => void;
  /**
   * Tab (`back`: with Shift): select the next (or previous) party member. False when it doesn't apply now (in
   * combat, or with a window open), so Tab keeps its usual job of moving the keyboard focus.
   */
  cycleMember: (back: boolean) => boolean;
}) {
  const latest = useLatest(keys);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'i' || e.key === 'I') latest.current.toggleSheet();
      else if (e.key === 'Escape') latest.current.escape();
      else if (e.key === 'Tab' && latest.current.cycleMember(e.shiftKey)) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [latest]);
}

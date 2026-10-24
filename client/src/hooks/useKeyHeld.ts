// Whether a key is held down right now (e.g. Ctrl, to compare items). Released when the window loses focus,
// so it never sticks down after alt-tabbing away while holding it.
import { useEffect, useState } from 'react';

export function useKeyHeld(key: string): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === key) setHeld(true); };
    const up = (e: KeyboardEvent) => { if (e.key === key) setHeld(false); };
    const release = () => setHeld(false);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', release);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', release);
    };
  }, [key]);
  return held;
}

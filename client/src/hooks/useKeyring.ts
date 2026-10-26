// The party's keyring: its rift keys (data/world/rifts.ts), shared by the whole party like the inventory but apart
// from it. Keys are kept in the order obtained, never sold, dropped or used up. A newly obtained key marks the
// party window's Keys tab until the tab is opened (`hasNew`, `seeKeys`).
import { useCallback, useState } from 'react';
import { STARTING_KEYS } from '../data/world/rifts';
import type { DungeonKey } from '../data/world/dungeons';

export function useKeyring() {
  const [keys, setKeys] = useState<DungeonKey[]>([...STARTING_KEYS]);
  const [hasNew, setHasNew] = useState(false);

  /** Put a key on the keyring (once: a key the party has is never added again, and doesn't count as new). */
  const addKey = useCallback((key: DungeonKey) => {
    if (keys.includes(key)) return;
    setKeys([...keys, key]);
    setHasNew(true);
  }, [keys]);

  /** The Keys tab was opened: the new key has been seen. */
  const seeKeys = useCallback(() => setHasNew(false), []);

  return { keys, hasNew, addKey, seeKeys };
}

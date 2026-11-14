import { useState, useCallback, useRef } from 'react';
import type { Announcement } from '../components/hud/Announcement';

/**
 * The big text over the map for the events that must not go unseen (a level-up, a quest's news, a rift key received):
 * one shows at a time, in the order they came, each starting as the one before it ends. Not tied to a map or a tile, so
 * it carries on through a change of map.
 */
export function useAnnouncements() {
  const [queue, setQueue] = useState<Announcement[]>([]);
  const nextId = useRef(0);

  /** Announce `text` in `color` (a CSS color): it waits behind any announcement still showing. */
  const announce = useCallback((text: string, color: string) => {
    const id = nextId.current++;
    setQueue(prev => [...prev, { id, text, color }]);
  }, []);

  /** The announcement `id` has finished showing. */
  const endAnnouncement = useCallback((id: number) => {
    setQueue(prev => prev.filter(a => a.id !== id));
  }, []);

  return { announcement: queue[0] ?? null, announce, endAnnouncement };
}

/** Announce something over the map (useAnnouncements' announce), for the hooks that take it. */
export type Announce = ReturnType<typeof useAnnouncements>['announce'];

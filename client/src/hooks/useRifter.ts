// The Sanctum's Rifter (GameScreen): the key set in it and whether its rift is open (dormant whenever the party
// arrives), its window (open only while the leader stands by its receptacle), and what the party's quests say of it.
import { useCallback, useEffect, useRef, useState } from 'react';
import { isAdjacent, type Pos } from '../data/world/grid';
import { SANCTUM_RECEPTACLE } from '../data/world/sanctum';
import { currentStep, questHolds, type QuestLog } from '../data/world/quests';
import type { QuestMark } from '../data/world/dialogue';
import type { DungeonKey } from '../data/world/dungeons';
import { RIFTER_UNLOCK } from '../data/world/rifts';
import { DORMANT_RIFTER, type RifterState } from '../components/sanctumScene';
import { RIFT_CLOSE_MS } from '../forge/designs/_rifter';

export function useRifter({ location, playerPos, questLog }: {
  location: 'sanctum' | 'dungeon';
  /** The leader's tile: the window stays open only while it is beside the receptacle. */
  playerPos: Pos;
  questLog: QuestLog;
}) {
  const [rifter, setRifter] = useState<RifterState>(DORMANT_RIFTER);
  const [showRifter, setShowRifter] = useState(false);
  const reopenTimer = useRef<number | undefined>(undefined);

  /**
   * Open `key`'s rift (the window closes, so the device is seen). Dormant: it wakes. Awake with another key's rift:
   * the new key goes in the socket at once, the old rift closes, then (RIFT_CLOSE_MS later) the new one opens.
   */
  const openRift = (key: DungeonKey) => {
    setShowRifter(false);
    if (!rifter.rift) { setRifter({ key, rift: key, phase: 'activate' }); return; }
    if (key === rifter.key) return;
    window.clearTimeout(reopenTimer.current);
    // Mid-swap already: the rift still closing (or showing) stays the one that closes
    setRifter({ key, rift: rifter.rift, phase: 'close' });
    reopenTimer.current = window.setTimeout(() => setRifter((r) => (r.phase === 'close' ? { ...r, rift: r.key, phase: 'reopen' } : r)), RIFT_CLOSE_MS);
  };
  useEffect(() => () => window.clearTimeout(reopenTimer.current), []);

  useEffect(() => {
    if (showRifter && (location !== 'sanctum' || !isAdjacent(playerPos, SANCTUM_RECEPTACLE))) setShowRifter(false);
  }, [showRifter, location, playerPos]);

  /** The party arrives in the Sanctum: its rift closed after use, the Rifter is dormant again (and its window shut). */
  const reset = useCallback(() => {
    window.clearTimeout(reopenTimer.current);
    setRifter(DORMANT_RIFTER);
    setShowRifter(false);
  }, []);

  return {
    rifter,
    showRifter,
    setShowRifter,
    openRift,
    reset,
    /** The Rifter works once the party has been told how (RIFTER_UNLOCK). */
    usable: questHolds(questLog, RIFTER_UNLOCK),
    /** A quest step waiting on the Rifter marks its receptacle (?). */
    mark: (questLog.active.some(id => currentStep(questLog, id)?.marker === 'rifter') ? '?' : null) as QuestMark | null,
  };
}

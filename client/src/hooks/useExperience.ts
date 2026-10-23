// Experience: one pool for the whole party. Every enemy that dies (from a hit, a DoT tick, anything: useEnemyDeaths) gives
// everyone its XP, once, whoever is alive. Each level gained gives every member points to spend. The XP strip
// shows each award as "+N XP"; awards while the last one is still showing add up into it (and restart its fade).
import { useCallback, useRef, useState, type MutableRefObject } from 'react';
import { COMBAT_TEXT_COLOR } from '../data/constants';
import type { Pos } from '../data/world/grid';
import type { EnemyInstance } from '../data/units/enemies';
import { withLevelUps, type PartyMemberConfig } from '../data/units/party';
import { gainXp, killXp, type PartyProgress } from '../data/units/xp';
import type { XpGain } from '../components/hud/XpBar';
import type { SpawnFloat } from './useFloatingText';
import { useLatest } from './useLatest';

/** How long an XP award stays on the strip; another award within it adds up into the same "+N XP". */
const XP_GAIN_SHOWN_MS = 6000;

export function useExperience({ progress, setProgress, party, setParty, spawnFloat, leaderPosRef }: {
  progress: PartyProgress;
  setProgress: (progress: PartyProgress) => void;
  party: PartyMemberConfig[];
  setParty: (party: PartyMemberConfig[]) => void;
  spawnFloat: SpawnFloat;
  /** Where the leader stands now: "Level N!" shows over it. */
  leaderPosRef: MutableRefObject<Pos | undefined>;
}) {
  const [xpGain, setXpGain] = useState<(XpGain & { at: number }) | null>(null);
  // Updated at once by addXp, so two awards in one render add up
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const partyRef = useLatest(party);

  /** Give the party `amount` XP: level-ups give every member points, with "Level N!" over the leader. */
  const addXp = useCallback((amount: number) => {
    const { progress: next, levelsGained } = gainXp(progressRef.current, amount);
    progressRef.current = next;
    setProgress(next);
    const now = Date.now();
    setXpGain(prev => prev && now - prev.at < XP_GAIN_SHOWN_MS
      ? { amount: prev.amount + amount, seq: prev.seq + 1, at: now }
      : { amount, seq: (prev?.seq ?? 0) + 1, at: now });
    if (levelsGained > 0) {
      setParty(partyRef.current.map(m => withLevelUps(m, levelsGained)));
      const at = leaderPosRef.current;
      if (at) spawnFloat(at.x, at.y, `Level ${next.level}!`, COMBAT_TEXT_COLOR.levelUp);
    }
  }, [setProgress, setParty, spawnFloat, partyRef, leaderPosRef]);

  /** The XP for enemies just killed (useEnemyDeaths hands each one over once). */
  const awardKills = useCallback((dead: EnemyInstance[]) => {
    const gained = dead.reduce((sum, e) => sum + killXp(e.level, e.classData.xpMultiplier ?? 0, progressRef.current.level), 0);
    if (gained > 0) addXp(gained);
  }, [addXp]);

  return { xpGain, addXp, awardKills };
}

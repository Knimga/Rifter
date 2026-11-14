// Experience: one pool for the whole party. Every enemy that dies (from a hit, a DoT tick, anything: useEnemyDeaths) gives
// everyone its XP, once, whoever is alive. Each level gained gives every member points to spend. The XP strip
// shows each award as "+N XP"; awards while the last one is still showing add up into it (and restart its fade). A
// level-up announces "Level N!" over the map and pulses the screen's edge (levelUps counts them).
import { useCallback, useRef, useState } from 'react';
import { COMBAT_TEXT_COLOR } from '../data/constants';
import type { EnemyInstance } from '../data/units/enemies';
import { withLevelUps, type PartyMemberConfig } from '../data/units/party';
import { gainXp, killXp, type PartyProgress } from '../data/units/xp';
import type { XpGain } from '../components/hud/XpBar';
import type { Announce } from './useAnnouncements';
import { useLatest } from './useLatest';

/** How long an XP award stays on the strip; another award within it adds up into the same "+N XP". */
const XP_GAIN_SHOWN_MS = 6000;

export function useExperience({ progress, setProgress, party, setParty, announce }: {
  progress: PartyProgress;
  setProgress: (progress: PartyProgress) => void;
  party: PartyMemberConfig[];
  setParty: (party: PartyMemberConfig[]) => void;
  /** "Level N!" is announced over the map (useAnnouncements). */
  announce: Announce;
}) {
  const [xpGain, setXpGain] = useState<(XpGain & { at: number }) | null>(null);
  // How many times the party has leveled up (each one plays the screen-edge pulse: EdgePulse)
  const [levelUps, setLevelUps] = useState(0);
  // Updated at once by addXp, so two awards in one render add up
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const partyRef = useLatest(party);

  /** Give the party `amount` XP: level-ups give every member points, and announce "Level N!". */
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
      setLevelUps(n => n + 1);
      announce(`Level ${next.level}!`, COMBAT_TEXT_COLOR.levelUp);
    }
  }, [setProgress, setParty, announce, partyRef]);

  /** The XP for enemies just killed (useEnemyDeaths hands each one over once). */
  const awardKills = useCallback((dead: EnemyInstance[]) => {
    const gained = dead.reduce((sum, e) => sum + killXp(e.level, e.classData.xpMultiplier ?? 0, progressRef.current.level), 0);
    if (gained > 0) addXp(gained);
  }, [addXp]);

  return { xpGain, levelUps, addXp, awardKills };
}

// The party members' state in play (HP, MP, buffs, HoTs, DoTs; indexed like the party) and their effective
// stats, kept in step: HP and MP are clamped to their maxima whenever stats drop (a buff ending, a gear swap).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { freshMember, memberStats, type MemberState, type PartyMemberConfig } from '../data/units/party';
import type { PartyProgress } from '../data/units/xp';
import { useLatest } from './useLatest';

// Identity of a buff list. Lists are immutable (a change makes a new array), so a member's stats only need
// recomputing when one of these ids changes.
const listIds = new WeakMap<object, number>();
let nextListId = 0;
const listId = (list: object) => {
  let id = listIds.get(list);
  if (id === undefined) listIds.set(list, (id = nextListId++));
  return id;
};

export function usePartyMembers(party: PartyMemberConfig[], progress: PartyProgress) {
  // Starts at full HP/MP; nothing restores it when a fight ends (regen does, over time)
  const [members, setMembers] = useState<MemberState[]>(() => party.map(m => freshMember(m, progress.level)));

  /**
   * Apply `fn` to the listed members' state (others unchanged). When `fn` returns every member as it was,
   * the state stays the same array: React skips the redraw. A member it leaves at 0 HP (dead, whatever killed
   * it) loses every buff, debuff, HoT and DoT on it at once: it comes back from the dead clean.
   */
  const updateMembers = useCallback((fn: (m: MemberState, i: number) => MemberState, only?: (i: number) => boolean) =>
    setMembers(prev => {
      const next = prev.map((m, i) => {
        if (only && !only(i)) return m;
        const n = fn(m, i);
        return n.hp <= 0 && (n.buffs.length || n.hots.length || n.dots.length) ? { ...n, buffs: [], hots: [], dots: [] } : n;
      });
      return next.every((m, i) => m === prev[i]) ? prev : next;
    }), []);

  const partyHp = useMemo(() => members.map(m => m.hp), [members]);
  const partyBuffs = useMemo(() => members.map(m => m.buffs), [members]);
  const partyHots = useMemo(() => members.map(m => m.hots), [members]);
  const partyDots = useMemo(() => members.map(m => m.dots), [members]);

  // Each member's effective stats. Memoized: a full stat recompute per member is too costly to redo on every
  // render (or every HP change), so only when the party, its level or a buff list changes.
  const buffsKey = members.map(m => listId(m.buffs)).join(',');
  const partyAllStats = useMemo(
    () => party.map((m, i) => memberStats(m, progress.level, members[i]?.buffs ?? [])),
    [party, progress.level, buffsKey], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const statsRef = useLatest(partyAllStats);

  // Clamp HP/MP to the effective maxima whenever they change (buff expiry, gear swap)
  const maxKey = partyAllStats.map(s => `${s.hp}/${s.mp}`).join(',');
  useEffect(() => {
    updateMembers((m, i) => {
      const s = partyAllStats[i];
      return s && (m.hp > s.hp || m.mp > s.mp) ? { ...m, hp: Math.min(m.hp, s.hp), mp: Math.min(m.mp, s.mp) } : m;
    });
  }, [maxKey]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Bring any member at 0 HP/MP back to 10% (rift return, end of combat, out of combat). */
  const reviveDowned = useCallback(() => {
    const tenPercent = (max: number | undefined) => Math.max(1, Math.floor((max ?? 10) * 0.1));
    updateMembers((m, i) => m.hp > 0 && m.mp > 0 ? m : {
      ...m,
      hp: m.hp <= 0 ? tenPercent(statsRef.current[i]?.hp) : m.hp,
      mp: m.mp <= 0 ? tenPercent(statsRef.current[i]?.mp) : m.mp,
    });
  }, [updateMembers, statsRef]);

  /** Everyone at full HP and MP with no effects (after a party wipe). */
  const latest = useLatest({ party, level: progress.level });
  const restoreAll = useCallback(() => setMembers(latest.current.party.map(m => freshMember(m, latest.current.level))), [latest]);

  /** Every buff, HoT and DoT ends (leaving a location). */
  const clearEffects = useCallback(() => updateMembers(m => ({ ...m, buffs: [], hots: [], dots: [] })), [updateMembers]);

  return { members, updateMembers, partyHp, partyBuffs, partyHots, partyDots, partyAllStats, reviveDowned, restoreAll, clearEffects };
}

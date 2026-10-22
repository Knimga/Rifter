// The round tick, for party members and enemies alike (tickRound): regen, HoT heals, DoT damage after DR, and
// effect durations running down. In combat at the top of each round; out of combat on a timer.
import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { COMBAT_TEXT_COLOR, OUT_OF_COMBAT_REGEN_INTERVAL_MS } from '../data/constants';
import { applyTopOfRound, tickChangesNothing, tickRound, type CombatState, type RoundTick } from '../data/combat';
import { tickDurations } from '../data/abilityExecution';
import type { Pos } from '../data/dungeonHelpers';
import type { EnemyInstance } from '../data/enemies';
import type { MemberState } from '../data/party';
import type { Stats } from '../data/stats';
import type { SpawnFloat } from './useFloatingText';

export function useRoundTick({ combatActive, round, membersRef, updateMembers, partyStatsRef, partyPosRef, enemiesRef, setEnemies, setCombat, spawnFloat }: {
  combatActive: boolean;
  /** The combat round: each new one (after the first) ticks. */
  round: number;
  membersRef: MutableRefObject<MemberState[]>;
  updateMembers: (fn: (m: MemberState, i: number) => MemberState) => void;
  partyStatsRef: MutableRefObject<Stats[]>;
  partyPosRef: MutableRefObject<Pos[]>;
  enemiesRef: MutableRefObject<EnemyInstance[]>;
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>;
  setCombat: Dispatch<SetStateAction<CombatState>>;
  spawnFloat: SpawnFloat;
}) {
  const applyRoundTick = useCallback(() => {
    const threatGain = new Map<number, number>();
    const addThreat = (i: number, raw: number) => {
      if (raw > 0) threatGain.set(i, (threatGain.get(i) ?? 0) + raw * (partyStatsRef.current[i]?.threatMultiplier ?? 1));
    };
    const showTick = (pos: Pos, tick: RoundTick) => {
      if (tick.heal > 0) spawnFloat(pos.x, pos.y, `+${tick.heal}`, COMBAT_TEXT_COLOR.heal);
      if (tick.dotDamage > 0) spawnFloat(pos.x, pos.y, `-${tick.dotDamage}`, COMBAT_TEXT_COLOR.dot);
      if (tick.mpDotDamage > 0) spawnFloat(pos.x, pos.y, `-${tick.mpDotDamage} MP`, COMBAT_TEXT_COLOR.mpDamage);
      for (const [i, threat] of tick.dotSources) addThreat(i, threat);
    };

    // Dead members don't tick
    const ticks = membersRef.current.map((m, i) => {
      if (m.hp <= 0) return null;
      const tick = tickRound(partyStatsRef.current[i], m.hp, m.mp, m.hots, m.dots);
      showTick(partyPosRef.current[i], tick);
      addThreat(i, tick.heal * 1.5);
      return tick;
    });
    updateMembers((m, i) => {
      // A member the tick leaves as it was stays the same object (see tickChangesNothing): no redraw
      const tick = ticks[i];
      const effects = [m.buffs, m.hots, m.dots];
      if (tick ? tickChangesNothing(tick, m.hp, m.mp, effects) : effects.every(list => list.length === 0)) return m;
      return {
        hp: tick?.hp ?? m.hp,
        mp: tick?.mp ?? m.mp,
        buffs: tickDurations(m.buffs),
        hots: tickDurations(m.hots),
        dots: tickDurations(m.dots),
      };
    });

    // Unchanged enemies come back as the same array, which React ignores
    const { enemies: updated, events } = applyTopOfRound(enemiesRef.current);
    for (const { pos, tick } of events) showTick(pos, tick);
    setEnemies(updated);

    if (threatGain.size > 0) {
      setCombat(prev => ({ ...prev, partyThreat: prev.partyThreat.map((t, i) => t + (threatGain.get(i) ?? 0)) }));
    }
  }, [spawnFloat, updateMembers]); // eslint-disable-line react-hooks/exhaustive-deps

  // In combat: the top of each round after the first
  useEffect(() => {
    if (round > 1) applyRoundTick();
  }, [round]); // eslint-disable-line react-hooks/exhaustive-deps

  // Out of combat: on a timer
  useEffect(() => {
    if (combatActive) return;
    const id = setInterval(applyRoundTick, OUT_OF_COMBAT_REGEN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [combatActive, applyRoundTick]);
}

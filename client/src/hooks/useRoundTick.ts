// The round tick, for party members and enemies alike (tickRound): regen, HoT heals, DoT damage after DR, and
// effect durations running down. In combat at the top of each round; out of combat on a timer.
import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { COMBAT_TEXT_COLOR, OUT_OF_COMBAT_REGEN_INTERVAL_MS } from '../data/constants';
import { applyTopOfRound, tickChangesNothing, tickRound, type CombatState, type RoundTick } from '../data/combat/combat';
import { applyThreatChange, healThreat, tickDurations, unitKey } from '../data/combat/abilityExecution';
import { bodyCenter, type Pos } from '../data/world/grid';
import { bodyOf, isAlly, type EnemyInstance } from '../data/units/enemies';
import type { MemberState } from '../data/units/party';
import type { Stats } from '../data/units/stats';
import type { SpawnFloat } from './useFloatingText';

export function useRoundTick({ combatActive, round, membersRef, updateMembers, partyStatsRef, partyPosRef, enemiesRef, currentZoneRef, setEnemies, setCombat, spawnFloat }: {
  combatActive: boolean;
  /** The combat round: each new one (after the first) ticks. */
  round: number;
  membersRef: MutableRefObject<MemberState[]>;
  updateMembers: (fn: (m: MemberState, i: number) => MemberState) => void;
  partyStatsRef: MutableRefObject<Stats[]>;
  partyPosRef: MutableRefObject<Pos[]>;
  enemiesRef: MutableRefObject<EnemyInstance[]>;
  /** The zone the party is in: only its creatures tick (the rest wait, untouched). */
  currentZoneRef: MutableRefObject<number>;
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>;
  setCombat: Dispatch<SetStateAction<CombatState>>;
  spawnFloat: SpawnFloat;
}) {
  const applyRoundTick = useCallback(() => {
    // Threat gained this tick, by threatKey (party members and summoned allies)
    const threatGain = new Map<string, number>();
    const addThreat = (key: string, raw: number) => {
      if (raw > 0) threatGain.set(key, (threatGain.get(key) ?? 0) + raw);
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
      addThreat(unitKey({ side: 'party', idx: i }), healThreat(tick.heal));
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

    // The current zone's creatures (the others wait). Unchanged, they come back as the same array, which React
    // ignores. Summoned creatures (either side's) whose time is up vanish.
    const creatures = enemiesRef.current;
    const { enemies: updated, events, vanished } = applyTopOfRound(creatures, currentZoneRef.current);
    for (const { pos, tick } of events) showTick(pos, tick);
    for (const e of vanished) {
      const at = bodyCenter(bodyOf(e));
      spawnFloat(at.x, at.y, 'Vanished', COMBAT_TEXT_COLOR.stopped);
    }
    setEnemies(updated);

    // Threat only counts in a fight (out of combat there is none to keep)
    if (combatActive && threatGain.size > 0) {
      // Gains scale by the unit's own threatMultiplier: a party member's, or a summon's (by its threatKey)
      const multipliers = new Map<string, number>([
        ...partyStatsRef.current.map((s, i) => [unitKey({ side: 'party', idx: i }), s.threatMultiplier] as const),
        ...creatures.filter(isAlly).map(e => [e.id, e.stats.threatMultiplier] as const),
      ]);
      setCombat(prev => {
        if (!prev.active) return prev;
        const threat = { ...prev.threat };
        for (const [key, gain] of threatGain) threat[key] = applyThreatChange(threat[key] ?? 0, { gain }, multipliers.get(key) ?? 1);
        return { ...prev, threat };
      });
    }
  }, [combatActive, spawnFloat, updateMembers]); // eslint-disable-line react-hooks/exhaustive-deps

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

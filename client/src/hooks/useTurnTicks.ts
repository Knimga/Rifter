// The turn ticks (combat.ts "Turn ticks"), for party members and creatures alike: at the start of a unit's turn its
// regen, HoTs and DoTs tick (DoT damage after DR); at the end of it, its effects count down a turn, and a summoned
// creature's time with them. In combat they follow the turn order; out of combat a timer runs a whole turn for
// everyone at once.
import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { COMBAT_TEXT_COLOR, OUT_OF_COMBAT_REGEN_INTERVAL_MS } from '../data/constants';
import { applyRestTick, creatureTurnEnd, creatureTurnStart, tickChangesNothing, turnStartTick, type CombatState, type Combatant, type TurnTick } from '../data/combat/combat';
import { applyThreatChange, countDownTurns, healThreat, unitKey } from '../data/combat/abilityExecution';
import { bodyCenter, type Pos } from '../data/world/grid';
import { bodyOf, isAlly, type EnemyInstance } from '../data/units/enemies';
import type { MemberState } from '../data/units/party';
import { runsDown, type Stats } from '../data/units/stats';
import { record } from '../devtools/runRecorder'; // TEMP (testing only)
import type { SpawnFloat } from './useFloatingText';

export function useTurnTicks({ combatActive, round, currentCombatant, membersRef, updateMembers, partyStatsRef, partyPosRef, enemiesRef, currentZoneRef, setEnemies, setCombat, spawnFloat, glowVanishing }: {
  combatActive: boolean;
  /** The combat round and whose turn it is: each new turn ends the last unit's and starts this one's. */
  round: number;
  currentCombatant: Combatant | null;
  membersRef: MutableRefObject<MemberState[]>;
  updateMembers: (fn: (m: MemberState, i: number) => MemberState, only?: (i: number) => boolean) => void;
  partyStatsRef: MutableRefObject<Stats[]>;
  partyPosRef: MutableRefObject<Pos[]>;
  enemiesRef: MutableRefObject<EnemyInstance[]>;
  /** The zone the party is in: only its creatures tick (the rest wait, untouched). */
  currentZoneRef: MutableRefObject<number>;
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>;
  setCombat: Dispatch<SetStateAction<CombatState>>;
  spawnFloat: SpawnFloat;
  /** A summoned creature vanishing: its model glows where it stood (useActionOutcomes). */
  glowVanishing: (gone: EnemyInstance[]) => void;
}) {
  /** A unit's turn-start tick, for the run recorder (devtools/runRecorder.ts): its HP and MP before and after, and why. */
  const recordTick = (unit: string, hp: number, mp: number, t: TurnTick) => record('tick', () => ({
    unit, hp: `${hp} → ${t.hp}`, mp: `${mp} → ${t.mp}`,
    ...(t.heal ? { hotHeal: t.heal } : {}), ...(t.mpHeal ? { hotMpHeal: t.mpHeal } : {}),...(t.dotDamage ? { dotDamage: t.dotDamage } : {}), ...(t.mpDotDamage ? { mpDotDamage: t.mpDotDamage } : {}),
  }));

  /** A unit's tick as floating text over it. */
  const showTick = useCallback((pos: Pos, tick: TurnTick) => {
    if (tick.heal > 0) spawnFloat(pos.x, pos.y, `+${tick.heal}`, COMBAT_TEXT_COLOR.heal);
    if (tick.mpHeal > 0) spawnFloat(pos.x, pos.y, `+${tick.mpHeal} MP`, COMBAT_TEXT_COLOR.mpRestore);
    if (tick.dotDamage > 0) spawnFloat(pos.x, pos.y, `-${tick.dotDamage}`, COMBAT_TEXT_COLOR.dot);
    if (tick.mpDotDamage > 0) spawnFloat(pos.x, pos.y, `-${tick.mpDotDamage} MP`, COMBAT_TEXT_COLOR.mpDamage);
  }, [spawnFloat]);

  /**
   * Threat from a tick (in combat only): the healed unit's own, for its HoTs (`healed`: its threatKey, when a party-side
   * unit), and each DoT's source's. Each gain scales by its unit's threatMultiplier.
   */
  const gainTickThreat = useCallback((tick: TurnTick, healed?: string) => {
    const gains = new Map(tick.dotSources);
    // (an MP-restoring HoT builds threat like an HP one, as an MP heal does: executeAction)
    if (healed && tick.heal + tick.mpHeal > 0) gains.set(healed, (gains.get(healed) ?? 0) + healThreat(tick.heal + tick.mpHeal));
    if (![...gains.values()].some((g) => g > 0)) return;
    const multipliers = new Map<string, number>([
      ...partyStatsRef.current.map((s, i) => [unitKey({ side: 'party', idx: i }), s.threatMultiplier] as const),
      ...enemiesRef.current.filter(isAlly).map(e => [e.id, e.stats.threatMultiplier] as const),
    ]);
    setCombat(prev => {
      if (!prev.active) return prev;
      const threat = { ...prev.threat };
      for (const [key, gain] of gains) if (gain > 0) threat[key] = applyThreatChange(threat[key] ?? 0, { gain }, multipliers.get(key) ?? 1);
      return { ...prev, threat };
    });
  }, [partyStatsRef, enemiesRef, setCombat]);

  /** A party member's tick (turnStartTick), from its state now; null when it is down. */
  const memberTick = (i: number): TurnTick | null => {
    const m = membersRef.current[i];
    return m && m.hp > 0 ? turnStartTick(partyStatsRef.current[i], m.hp, m.mp, m.hots, m.dots) : null;
  };
  const countDown = (m: MemberState): MemberState =>
    ({ ...m, buffs: countDownTurns(m.buffs), hots: countDownTurns(m.hots), dots: countDownTurns(m.dots) });

  /** A unit's turn starting: its regen, HoTs and DoTs tick. */
  const startTurn = (c: Combatant) => {
    if (c.isPlayer) {
      const i = c.partyIndex ?? 0, m = membersRef.current[i], tick = memberTick(i);
      if (!m || !tick || tickChangesNothing(tick, m.hp, m.mp, [m.hots, m.dots])) return;
      recordTick(c.name, m.hp, m.mp, tick);
      showTick(partyPosRef.current[i], tick);
      gainTickThreat(tick, unitKey({ side: 'party', idx: i }));
      updateMembers(x => ({ ...x, hp: tick.hp, mp: tick.mp }), j => j === i);
      return;
    }
    const e = enemiesRef.current.find(x => x.id === c.id && x.currentHp > 0);
    const event = e && creatureTurnStart(e).event;
    if (!e || !event) return;
    recordTick(c.name, e.currentHp, e.currentMp, event.tick);
    showTick(event.pos, event.tick);
    gainTickThreat(event.tick, isAlly(e) ? e.id : undefined);
    setEnemies(prev => prev.map(x => (x.id === c.id ? creatureTurnStart(x).enemy : x)));
  };

  /** A unit's turn ending: its effects count down; a summoned creature whose time is up vanishes. */
  const endTurn = (c: Combatant) => {
    if (c.isPlayer) {
      updateMembers(countDown, j => j === (c.partyIndex ?? 0));
      return;
    }
    const e = enemiesRef.current.find(x => x.id === c.id && x.currentHp > 0);
    if (!e) return;
    if (creatureTurnEnd(e).vanished) {
      const at = bodyCenter(bodyOf(e));
      spawnFloat(at.x, at.y, 'Vanished', COMBAT_TEXT_COLOR.stopped);
      glowVanishing([e]);
    }
    setEnemies(prev => prev.flatMap(x => {
      if (x.id !== c.id) return [x];
      const end = creatureTurnEnd(x);
      return end.vanished ? [] : [end.enemy];
    }));
  };

  // In combat: each new turn ends the last unit's and starts this one's (the same unit next round is a new turn)
  const turnKey = combatActive && currentCombatant ? `${round}:${currentCombatant.id}` : null;
  const lastTurn = useRef<Combatant | null>(null);
  useEffect(() => {
    const last = lastTurn.current;
    lastTurn.current = turnKey ? currentCombatant : null;
    if (!turnKey || !currentCombatant) return;
    if (last) endTurn(last);
    record('turn', () => ({ round, unit: currentCombatant.name }));
    startTurn(currentCombatant);
  }, [turnKey]); // eslint-disable-line react-hooks/exhaustive-deps -- the turn, by its key

  /** Out of combat: a whole turn (its start, then its end) for everyone at once. */
  const restTick = useCallback(() => {
    // Dead members don't tick
    const ticks = membersRef.current.map((_, i) => memberTick(i));
    ticks.forEach((tick, i) => tick && showTick(partyPosRef.current[i], tick));
    updateMembers((m, i) => {
      // A member the tick leaves as it was stays the same object (see tickChangesNothing): no redraw
      const tick = ticks[i];
      const effects = [m.buffs, m.hots, m.dots];
      if (tick ? tickChangesNothing(tick, m.hp, m.mp, effects) : !effects.some(runsDown)) return m;
      return countDown({ ...m, hp: tick?.hp ?? m.hp, mp: tick?.mp ?? m.mp });
    });

    // The current zone's creatures (the others wait). Unchanged, they come back as the same array, which React
    // ignores. Summoned creatures (either side's) whose time is up vanish.
    const before = enemiesRef.current, zoneId = currentZoneRef.current;
    const { enemies: updated, events, vanished } = applyRestTick(before, zoneId);
    for (const { pos, tick } of events) showTick(pos, tick);
    for (const e of vanished) {
      const at = bodyCenter(bodyOf(e));
      spawnFloat(at.x, at.y, 'Vanished', COMBAT_TEXT_COLOR.stopped);
    }
    glowVanishing(vanished);
    // Onto the creatures as they are when it lands: an update queued since the ref was read (an aura sync) isn't lost
    if (updated !== before) setEnemies(prev => (prev === before ? updated : applyRestTick(prev, zoneId).enemies));
  }, [showTick, spawnFloat, updateMembers, glowVanishing]); // eslint-disable-line react-hooks/exhaustive-deps -- reads stable refs

  useEffect(() => {
    if (combatActive) return;
    const id = setInterval(restTick, OUT_OF_COMBAT_REGEN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [combatActive, restTick]);
}

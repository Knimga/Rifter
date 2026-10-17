import type { EnemyInstance } from './enemies';
import { withEnemyBuffs } from './enemies';
import type { ActiveDot, ActiveHot, Stats } from './stats';
import type { Pos } from './dungeonHelpers';
import { tickDots, tickDurations, tickHots } from './abilityExecution';
import { randInt } from './random';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Combatant {
  id: string;           // 'player-0' | 'player-1' | 'player-2' | enemy instance id
  name: string;
  initiativeRoll: number;
  isPlayer: boolean;
  partyIndex?: number;  // 0|1|2 for party members; absent for enemies
}

export interface CombatState {
  active: boolean;
  turnOrder: Combatant[];
  currentTurnIndex: number;
  round: number;
  playerActedThisTurn: boolean;
  movementRemaining: number;
  partyThreat: number[];  // indexed by partyIndex; resets to 0 each combat
}

// ─── Functions ───────────────────────────────────────────────────────────────

const d20 = () => randInt(1, 20);

export function startCombat(
  partyMembers: Array<{ stats: Stats; name: string }>,
  aggroedEnemies: EnemyInstance[],
): CombatState {
  const combatants: Combatant[] = [
    ...partyMembers.map((m, i) => ({
      id: `player-${i}`,
      name: m.name,
      initiativeRoll: d20() + m.stats.initiative,
      isPlayer: true,
      partyIndex: i,
    })),
    ...aggroedEnemies
      .filter(e => e.currentHp > 0)
      .map(e => ({
        id: e.id,
        name: e.classData.name,
        initiativeRoll: d20() + e.stats.initiative,
        isPlayer: false,
      })),
  ];

  combatants.sort((a, b) => {
    if (b.initiativeRoll !== a.initiativeRoll) return b.initiativeRoll - a.initiativeRoll;
    return a.isPlayer ? -1 : 1;
  });

  const first = combatants[0];
  return {
    active: true,
    turnOrder: combatants,
    currentTurnIndex: 0,
    round: 1,
    playerActedThisTurn: false,
    movementRemaining: first.isPlayer ? partyMembers[first.partyIndex ?? 0].stats.movement : 0,
    partyThreat: partyMembers.map(() => 0),
  };
}

/** Insert newly-aggroed enemies into an ongoing combat's turn order. */
export function joinCombat(state: CombatState, newEnemies: EnemyInstance[]): CombatState {
  if (newEnemies.length === 0) return state;

  const newCombatants: Combatant[] = newEnemies.map(e => ({
    id: e.id,
    name: e.classData.name,
    initiativeRoll: d20() + e.stats.initiative,
    isPlayer: false,
  }));

  // Build new turn order: merge existing + new, sorted by initiative
  const merged = [...state.turnOrder, ...newCombatants];
  merged.sort((a, b) => {
    if (b.initiativeRoll !== a.initiativeRoll) return b.initiativeRoll - a.initiativeRoll;
    return a.isPlayer ? -1 : 1;
  });

  // Find where the current combatant ended up in the new order
  const currentId = state.turnOrder[state.currentTurnIndex].id;
  const newIndex = merged.findIndex(c => c.id === currentId);

  return {
    ...state,
    turnOrder: merged,
    currentTurnIndex: newIndex,
  };
}

/** Party indices currently at 0 HP. */
export const deadPartyIndices = (partyHp: number[]) => new Set(partyHp.flatMap((hp, i) => hp <= 0 ? [i] : []));

export function advanceTurn(
  state: CombatState,
  enemies: EnemyInstance[],
  partyMovements: number[],
  deadPartyIndices?: Set<number>,
): CombatState {
  const len = state.turnOrder.length;
  let nextIndex = (state.currentTurnIndex + 1) % len;
  let wrapped = nextIndex === 0;

  // Skip dead combatants (enemies with 0 HP, or party members in deadPartyIndices)
  for (let i = 0; i < len; i++) {
    const combatant = state.turnOrder[nextIndex];
    if (combatant.isPlayer) {
      const isDead = deadPartyIndices?.has(combatant.partyIndex ?? 0) ?? false;
      if (!isDead) break; // alive — stop skipping
    } else {
      const enemy = enemies.find(e => e.id === combatant.id);
      if (enemy && enemy.currentHp > 0) break; // alive enemy — stop skipping
    }
    nextIndex = (nextIndex + 1) % len;
    if (nextIndex === 0) wrapped = true;
  }

  const next = state.turnOrder[nextIndex];
  return {
    ...state,
    currentTurnIndex: nextIndex,
    round: state.round + (wrapped ? 1 : 0),
    playerActedThisTurn: false,
    movementRemaining: next.isPlayer ? (partyMovements[next.partyIndex ?? 0] ?? partyMovements[0] ?? 0) : 0,
  };
}

/** One unit's top-of-round result: regen + HoT heals + DoT damage (after DR). Shared by party and enemies. */
export interface RoundTick {
  hp: number;
  mp: number;
  heal: number;                     // HoT healing this round
  dotDamage: number;                // DoT damage this round
  dotSources: Map<number, number>;  // partyIdx → DoT damage dealt, for threat
}

export function tickRound(stats: Stats, hp: number, mp: number, hots: ActiveHot[], dots: ActiveDot[]): RoundTick {
  const heal = tickHots(hots);
  const { damage, bySource } = tickDots(dots, stats);
  return {
    hp: Math.max(0, Math.min(stats.hp, hp + stats.hpRegen + heal) - damage),
    mp: Math.min(stats.mp, mp + stats.mpRegen),
    heal,
    dotDamage: damage,
    dotSources: bySource,
  };
}

/** Per-enemy tick event, used to spawn floating text and attribute DoT threat. */
export interface EnemyTickEvent {
  pos: Pos;
  tick: RoundTick;
}

/** Apply all top-of-round effects to enemies: buff expiry, regen, HoT and DoT ticks. */
export function applyTopOfRound(enemies: EnemyInstance[]): { enemies: EnemyInstance[]; events: EnemyTickEvent[] } {
  const events: EnemyTickEvent[] = [];

  const updated = enemies.map(e => {
    if (e.currentHp <= 0) return e;

    // Buff expiry first so regen/DR use the post-expiry stats
    const buffs = tickDurations(e.buffs);
    const next = buffs.length !== e.buffs.length ? withEnemyBuffs(e, buffs) : { ...e, buffs };

    const tick = tickRound(next.stats, e.currentHp, e.currentMp, e.hots, e.dots);
    events.push({ pos: e.pos, tick });
    return { ...next, currentHp: tick.hp, currentMp: tick.mp, hots: tickDurations(e.hots), dots: tickDurations(e.dots) };
  });

  return { enemies: updated, events };
}

export function getCurrentCombatant(state: CombatState): Combatant | null {
  if (!state.active || state.turnOrder.length === 0) return null;
  return state.turnOrder[state.currentTurnIndex];
}

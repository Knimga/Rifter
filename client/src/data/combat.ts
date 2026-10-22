import type { EnemyInstance } from './enemies';
import { withEnemyBuffs } from './enemies';
import type { ActiveDot, ActiveHot, Stats } from './stats';
import type { Pos } from './dungeonHelpers';
import { tickDots, tickDurations, tickHots, type ActionOutcome } from './abilityExecution';
import { COMBAT_TEXT_COLOR } from './constants';
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
  /** AP the current combatant has spent this turn; what it has left is apLeft (its live apMax minus this). */
  apSpent: number;
  /** Tiles the current combatant has paid for (1 AP buys `movement` of them) and not walked yet this turn. */
  paidTiles: number;
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

  return {
    active: true,
    turnOrder: combatants,
    currentTurnIndex: 0,
    round: 1,
    apSpent: 0,
    paidTiles: 0,
    partyThreat: partyMembers.map(() => 0),
  };
}

// ─── Action points ───────────────────────────────────────────────────────────
//
// Each turn a unit has its apMax in AP (read live, so a buff or debuff on it counts at once). Moving: 1 AP
// buys `movement` tiles, which stay usable for the rest of the turn (move, attack, move on). Abilities cost
// their apCost. Shared by the party and enemies (enemyAI spends its AP the same way).

/** A unit that starts its turn with no AP (stunned) loses it: this shows over it (for STUNNED_PAUSE_MS) before the next turn. */
export const stunnedOutcome = (pos: Pos): ActionOutcome => ({
  changes: [], threat: 0, floats: [{ pos, text: 'Stunned', color: COMBAT_TEXT_COLOR.stopped }],
});

/** AP left this turn for a unit with `apMax`. */
export const apLeft = (apMax: number, state: Pick<CombatState, 'apSpent'>) => Math.max(0, apMax - state.apSpent);

/** Farthest a unit can move this turn (steps): the tiles already paid for, plus `movement` per AP left. */
export const moveBudget = (paidTiles: number, ap: number, movement: number) => paidTiles + ap * movement;

/** What a move of `steps` costs: the AP to pay (only once the paid tiles run out) and the paid tiles left after. */
export function moveCost(steps: number, paidTiles: number, movement: number): { apSpent: number; tilesLeft: number } {
  const apSpent = Math.max(0, Math.ceil((steps - paidTiles) / movement));
  return { apSpent, tilesLeft: paidTiles + apSpent * movement - steps };
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
  deadPartyIndices?: Set<number>,
): CombatState {
  const len = state.turnOrder.length;
  // Combat may have ended before a queued advance runs (e.g. a party wipe resets it in the same render)
  if (!state.active || len === 0) return state;
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

  return {
    ...state,
    currentTurnIndex: nextIndex,
    round: state.round + (wrapped ? 1 : 0),
    apSpent: 0,
    paidTiles: 0,
  };
}

/** One unit's top-of-round result: regen + HoT heals + DoT damage (after DR). Shared by party and enemies. */
export interface RoundTick {
  hp: number;
  mp: number;
  heal: number;                     // HoT healing this round
  dotDamage: number;                // DoT damage to HP this round
  mpDotDamage: number;              // DoT damage to MP this round (damagesMP DoTs)
  dotSources: Map<number, number>;  // partyIdx → threat from the DoTs they applied
}

export function tickRound(stats: Stats, hp: number, mp: number, hots: ActiveHot[], dots: ActiveDot[]): RoundTick {
  const heal = tickHots(hots);
  const { damage, mpDamage, threatBySource } = tickDots(dots, stats);
  return {
    hp: Math.max(0, Math.min(stats.hp, hp + stats.hpRegen + heal) - damage),
    mp: Math.max(0, Math.min(stats.mp, mp + stats.mpRegen) - mpDamage),
    heal,
    dotDamage: damage,
    mpDotDamage: mpDamage,
    dotSources: threatBySource,
  };
}

/**
 * Whether a tick leaves a unit exactly as it was: no buffs, HoTs or DoTs to run down, and HP and MP already
 * full (or unchanged). Such a unit is kept as the same object, so a quiet tick (out of combat, everyone
 * full) changes no state and redraws nothing. Shared by party and enemies.
 */
export const tickChangesNothing = (tick: RoundTick, hp: number, mp: number, effects: { length: number }[]) =>
  tick.hp === hp && tick.mp === mp && effects.every(list => list.length === 0);

/** Per-enemy tick event, used to spawn floating text and attribute DoT threat. */
export interface EnemyTickEvent {
  pos: Pos;
  tick: RoundTick;
}

/** Apply all top-of-round effects to enemies: buff expiry, regen, HoT and DoT ticks. */
export function applyTopOfRound(enemies: EnemyInstance[]): { enemies: EnemyInstance[]; events: EnemyTickEvent[] } {
  const events: EnemyTickEvent[] = [];

  let changed = false;
  const updated = enemies.map(e => {
    if (e.currentHp <= 0) return e;

    // Buff expiry first so regen/DR use the post-expiry stats
    const buffs = tickDurations(e.buffs);
    const next = buffs.length !== e.buffs.length ? withEnemyBuffs(e, buffs) : { ...e, buffs };

    const tick = tickRound(next.stats, e.currentHp, e.currentMp, e.hots, e.dots);
    if (tickChangesNothing(tick, e.currentHp, e.currentMp, [e.buffs, e.hots, e.dots])) return e;
    changed = true;
    events.push({ pos: e.pos, tick });
    return { ...next, currentHp: tick.hp, currentMp: tick.mp, hots: tickDurations(e.hots), dots: tickDurations(e.dots) };
  });

  // Nothing ticked: the same array, so the caller's state doesn't change
  return { enemies: changed ? updated : enemies, events };
}

export function getCurrentCombatant(state: CombatState): Combatant | null {
  if (!state.active || state.turnOrder.length === 0) return null;
  return state.turnOrder[state.currentTurnIndex];
}

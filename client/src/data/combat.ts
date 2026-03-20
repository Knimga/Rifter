import type { EnemyInstance } from './enemies';
import type { Stats } from './stats';
import { recomputeStats } from './stats';
import { applyDR } from './attackResolution';

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

const d20 = () => 1 + Math.floor(Math.random() * 20);

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

/** Per-enemy DoT tick result, used to spawn floating text and attribute threat. */
export interface DotTickEvent {
  enemyId: string;
  pos: { x: number; y: number };
  damage: number;
  threatSources: Array<{ partyIdx: number; damage: number }>;
}

/** Apply all top-of-round effects to enemies (regen, DoT ticks, etc.). */
export function applyTopOfRound(enemies: EnemyInstance[]): { enemies: EnemyInstance[]; dotTicks: DotTickEvent[] } {
  const dotTicks: DotTickEvent[] = [];

  const updated = enemies.map(e => {
    if (e.currentHp <= 0) return e;

    // Buff expiry — decrement duration, remove expired, recompute stats if anything changed
    const newBuffs = e.buffs
      .map(b => ({ ...b, roundsRemaining: b.roundsRemaining - 1 }))
      .filter(b => b.roundsRemaining > 0);
    const buffsChanged = newBuffs.length !== e.buffs.length;
    const s = buffsChanged ? recomputeStats({ mode: 'enemy', classData: e.classData, pointsSpent: e.pointsSpent, level: e.level }, newBuffs) : e.stats;

    // Regen (using current effective stats)
    let hp = Math.min(s.hp, e.currentHp + s.hpRegen);
    const mp = Math.min(s.mp, e.currentMp + s.mpRegen);

    // Tick HoTs
    const remainingHots = e.hots
      .map(h => ({ ...h, roundsRemaining: h.roundsRemaining - 1 }))
      .filter(h => h.roundsRemaining > 0);
    if (e.hots.length > 0) {
      const hotHeal = e.hots.reduce((sum, h) => sum + h.healPerRound + Math.floor(s.healing / 2), 0);
      hp = Math.min(s.hp, hp + hotHeal);
    }

    // Tick DoTs
    let totalDotDamage = 0;
    const threatSourceMap = new Map<number, number>();
    const remainingDots = e.dots
      .map(dot => {
        const tickDamage = applyDR(dot.damagePerRound, dot.damageElement, s.armor, s.magicResistance, undefined, dot.armorPenetration, dot.elementPenetration);
        totalDotDamage += tickDamage;
        if (dot.sourcePartyIdx !== undefined) {
          threatSourceMap.set(dot.sourcePartyIdx, (threatSourceMap.get(dot.sourcePartyIdx) ?? 0) + tickDamage);
        }
        return dot.roundsRemaining > 1
          ? { ...dot, roundsRemaining: dot.roundsRemaining - 1 }
          : null;
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    if (totalDotDamage > 0) {
      hp = Math.max(0, hp - totalDotDamage);
      dotTicks.push({
        enemyId: e.id,
        pos: e.pos,
        damage: totalDotDamage,
        threatSources: Array.from(threatSourceMap.entries()).map(([partyIdx, damage]) => ({ partyIdx, damage })),
      });
    }

    return { ...e, currentHp: hp, currentMp: mp, dots: remainingDots, hots: remainingHots, buffs: newBuffs, stats: s };
  });

  return { enemies: updated, dotTicks };
}

export function getCurrentCombatant(state: CombatState): Combatant | null {
  if (!state.active || state.turnOrder.length === 0) return null;
  return state.turnOrder[state.currentTurnIndex];
}

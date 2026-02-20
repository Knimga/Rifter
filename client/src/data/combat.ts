import type { EnemyInstance } from './enemies';
import type { Stats } from './classes';
import { applyDR } from './attackResolution';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Combatant {
  id: string;           // 'player' or enemy instance id
  name: string;
  initiativeRoll: number;
  isPlayer: boolean;
}

export interface CombatState {
  active: boolean;
  turnOrder: Combatant[];
  currentTurnIndex: number;
  round: number;
  playerActedThisTurn: boolean;
  movementRemaining: number;
}

// ─── Functions ───────────────────────────────────────────────────────────────

const d20 = () => 1 + Math.floor(Math.random() * 20);

export function startCombat(playerStats: Stats, aggroedEnemies: EnemyInstance[]): CombatState {
  const combatants: Combatant[] = [
    {
      id: 'player',
      name: 'You',
      initiativeRoll: d20() + playerStats.initiative,
      isPlayer: true,
    },
    ...aggroedEnemies
      .filter(e => e.currentHp > 0)
      .map(e => ({
        id: e.id,
        name: e.type.name,
        initiativeRoll: d20() + e.type.stats.initiative,
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
    movementRemaining: first.isPlayer ? playerStats.movement : 0,
  };
}

/** Insert newly-aggroed enemies into an ongoing combat's turn order. */
export function joinCombat(state: CombatState, newEnemies: EnemyInstance[]): CombatState {
  if (newEnemies.length === 0) return state;

  const newCombatants: Combatant[] = newEnemies.map(e => ({
    id: e.id,
    name: e.type.name,
    initiativeRoll: d20() + e.type.stats.initiative,
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
  playerMovement: number
): CombatState {
  const len = state.turnOrder.length;
  let nextIndex = (state.currentTurnIndex + 1) % len;
  let wrapped = nextIndex === 0;

  // Skip dead enemies
  for (let i = 0; i < len; i++) {
    const combatant = state.turnOrder[nextIndex];
    if (combatant.isPlayer) break;
    const enemy = enemies.find(e => e.id === combatant.id);
    if (enemy && enemy.currentHp > 0) break;
    nextIndex = (nextIndex + 1) % len;
    if (nextIndex === 0) wrapped = true;
  }

  const next = state.turnOrder[nextIndex];
  return {
    ...state,
    currentTurnIndex: nextIndex,
    round: state.round + (wrapped ? 1 : 0),
    playerActedThisTurn: false,
    movementRemaining: next.isPlayer ? playerMovement : 0,
  };
}

/** Per-enemy DoT tick result, used to spawn floating text. */
export interface DotTickEvent {
  enemyId: string;
  pos: { x: number; y: number };
  damage: number;
}

/** Apply all top-of-round effects to enemies (regen, DoT ticks, etc.). */
export function applyTopOfRound(enemies: EnemyInstance[]): { enemies: EnemyInstance[]; dotTicks: DotTickEvent[] } {
  const dotTicks: DotTickEvent[] = [];

  const updated = enemies.map(e => {
    if (e.currentHp <= 0) return e;

    // Regen
    let hp = Math.min(e.type.stats.hp, e.currentHp + e.type.stats.hpRegen);
    const mp = Math.min(e.type.stats.mp, e.currentMp + e.type.stats.mpRegen);

    // Tick DoTs
    let totalDotDamage = 0;
    const remainingDots = e.dots
      .map(dot => {
        const tickDamage = applyDR(dot.damagePerRound, dot.damageElement, e.type.stats.armor, e.type.stats.magicResistance);
        totalDotDamage += tickDamage;
        return dot.roundsRemaining > 1
          ? { ...dot, roundsRemaining: dot.roundsRemaining - 1 }
          : null;
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    if (totalDotDamage > 0) {
      hp = Math.max(0, hp - totalDotDamage);
      dotTicks.push({ enemyId: e.id, pos: e.pos, damage: totalDotDamage });
    }

    return { ...e, currentHp: hp, currentMp: mp, dots: remainingDots };
  });

  return { enemies: updated, dotTicks };
}

export function getCurrentCombatant(state: CombatState): Combatant | null {
  if (!state.active || state.turnOrder.length === 0) return null;
  return state.turnOrder[state.currentTurnIndex];
}

import { bodyOf, creatureName, isAlly, withEnemyBuffs, type EnemyInstance } from '../units/enemies';
import { regenAmount, runsDown, type ActiveDot, type ActiveHot, type Stats } from '../units/stats';
import { bodyCenter, inRangeAndSight, type Pos } from '../world/grid';
import { countDownTurns, tickDots, tickHots, type ActionOutcome } from './abilityExecution';
import { AGGRO_RANGE, COMBAT_TEXT_COLOR } from '../constants';
import { randInt } from '../random';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Combatant {
  id: string;           // 'player-0' | 'player-1' | 'player-2' | enemy instance id
  name: string;
  initiativeRoll: number;
  isPlayer: boolean;
  partyIndex?: number;  // 0|1|2 for party members; absent for enemies
  isAlly?: boolean;     // a creature summoned by the party (not a player: the AI runs it)
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
  /** Threat of each party-side unit (party members, summoned allies), by threatKey; none = 0. Resets each combat. */
  threat: Record<string, number>;
}

/** No fight going on. */
export const INITIAL_COMBAT: CombatState = {
  active: false,
  turnOrder: [],
  currentTurnIndex: 0,
  round: 0,
  apSpent: 0,
  paidTiles: 0,
  threat: {},
};

// ─── Functions ───────────────────────────────────────────────────────────────

const d20 = () => randInt(1, 20);

/** A creature's place in the turn order (an enemy, or a creature summoned by either side), its initiative rolled. */
const creatureCombatant = (e: EnemyInstance): Combatant => ({
  id: e.id,
  name: creatureName(e),
  initiativeRoll: d20() + e.stats.initiative,
  isPlayer: false,
  ...(isAlly(e) ? { isAlly: true } : {}),
});

/** Turn order: highest initiative first, the party first on a tie. */
const byInitiative = (a: Combatant, b: Combatant) =>
  b.initiativeRoll - a.initiativeRoll || Number(b.isPlayer) - Number(a.isPlayer);

/**
 * The enemies a party member at `pos` stirs: every unaggroed group with a living member within AGGRO_RANGE of it
 * and in sight, whole (`zoneEnemies`: the creatures of its zone; `sight`: the tiles sight passes over, ZoneData.sight).
 */
export function aggroedBy(pos: Pos, zoneEnemies: EnemyInstance[], sight: ReadonlySet<string>): EnemyInstance[] {
  const spotted = new Set(zoneEnemies
    .filter(e => e.currentHp > 0 && !e.aggroed && inRangeAndSight(pos, bodyOf(e), AGGRO_RANGE, sight))
    .map(e => e.groupId));
  return spotted.size ? zoneEnemies.filter(e => e.currentHp > 0 && !e.aggroed && spotted.has(e.groupId)) : [];
}

/**
 * A fight beginning: everyone rolls initiative, the party's members and `creatures` (the enemies it stirred, and the
 * party's forever summons there, which join every fight: isForeverSummon).
 */
export function startCombat(
  partyMembers: Array<{ stats: Stats; name: string }>,
  creatures: EnemyInstance[],
): CombatState {
  const combatants: Combatant[] = [
    ...partyMembers.map((m, i) => ({
      id: `player-${i}`,
      name: m.name,
      initiativeRoll: d20() + m.stats.initiative,
      isPlayer: true,
      partyIndex: i,
    })),
    ...creatures.filter(e => e.currentHp > 0).map(creatureCombatant),
  ];
  combatants.sort(byInitiative);

  return {
    active: true,
    turnOrder: combatants,
    currentTurnIndex: 0,
    round: 1,
    apSpent: 0,
    paidTiles: 0,
    threat: {},
  };
}

// ─── Action points ───────────────────────────────────────────────────────────
//
// Each turn a unit has its apMax in AP (read live, so a buff or debuff on it counts at once). Moving: 1 AP
// buys `movement` tiles, which stay usable for the rest of the turn (move, attack, move on). Abilities cost
// their apCost. Shared by the party and enemies (enemyAI spends its AP the same way).

/** A unit that starts its turn with no AP (stunned) loses it: this shows over it (for STUNNED_PAUSE_MS) before the next turn. */
export const stunnedOutcome = (pos: Pos): ActionOutcome => ({
  changes: [], threat: [], floats: [{ pos, text: 'Stunned', color: COMBAT_TEXT_COLOR.stopped }],
});

/** AP left this turn for a unit with `apMax`. */
export const apLeft = (apMax: number, state: Pick<CombatState, 'apSpent'>) => Math.max(0, apMax - state.apSpent);

/**
 * Farthest a unit can move this turn (steps): the tiles already paid for, plus `movement` per AP left. None
 * while it is rooted (isRooted).
 */
export const moveBudget = (paidTiles: number, ap: number, movement: number, rooted: boolean) =>
  rooted ? 0 : paidTiles + ap * movement;

/** What a move of `steps` costs: the AP to pay (only once the paid tiles run out) and the paid tiles left after. */
export function moveCost(steps: number, paidTiles: number, movement: number): { apSpent: number; tilesLeft: number } {
  const apSpent = Math.max(0, Math.ceil((steps - paidTiles) / movement));
  return { apSpent, tilesLeft: paidTiles + apSpent * movement - steps };
}

/** Insert creatures into an ongoing combat's turn order: newly-aggroed enemies, or newly summoned creatures (either side). */
export function joinCombat(state: CombatState, newEnemies: EnemyInstance[]): CombatState {
  if (newEnemies.length === 0) return state;

  // Build new turn order: merge existing + new, sorted by initiative
  const merged = [...state.turnOrder, ...newEnemies.map(creatureCombatant)].sort(byInitiative);

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

// ─── Turn ticks ──────────────────────────────────────────────────────────────
//
// Every effect runs on its bearer's own turns: at the start of a unit's turn its regen, HoTs and DoTs tick
// (turnStartTick); at the end, its effects count down a turn (countDownTurns), and a summon's time with them. So a
// 1-turn debuff always weighs on its target's next turn, and a 1-turn self-buff lasts through everyone else's.
// Out of combat (no turns), a timer runs a whole turn for everyone at once (useTurnTicks).

/** One unit's start-of-turn tick: regen + HoT heals + DoT damage (after DR). Shared by party and creatures. */
export interface TurnTick {
  hp: number;
  mp: number;
  heal: number;                     // HoT healing this turn
  mpHeal: number;                   // HoT MP restored this turn (restoresMP HoTs)
  dotDamage: number;                // DoT damage to HP this turn
  mpDotDamage: number;              // DoT damage to MP this turn (damagesMP DoTs)
  dotSources: Map<string, number>;  // threatKey → threat from the DoTs that unit applied
}

export function turnStartTick(stats: Stats, hp: number, mp: number, hots: ActiveHot[], dots: ActiveDot[]): TurnTick {
  const { heal, mpHeal } = tickHots(hots, stats);
  const { damage, mpDamage, threatBySource } = tickDots(dots, stats);
  return {
    hp: Math.max(0, Math.min(stats.hp, hp + regenAmount(stats.hp, stats.hpRegen) + heal) - damage),
    mp: Math.max(0, Math.min(stats.mp, mp + regenAmount(stats.mp, stats.mpRegen) + mpHeal) - mpDamage),
    heal,
    mpHeal,
    dotDamage: damage,
    mpDotDamage: mpDamage,
    dotSources: threatBySource,
  };
}

/**
 * Whether a tick leaves a unit exactly as it was: no buffs, HoTs or DoTs to run down (an aura's effects, which last
 * while their unit is inside, don't: runsDown), and HP and MP already full (or unchanged). Such a unit is kept as the
 * same object, so a quiet tick (out of combat, everyone full) changes no state and redraws nothing. Shared by party
 * and enemies.
 */
export const tickChangesNothing = (tick: TurnTick, hp: number, mp: number, effects: readonly (readonly { turnsLeft: number }[])[]) =>
  tick.hp === hp && tick.mp === mp && !effects.some(runsDown);

/** A creature's tick, used to spawn floating text and attribute DoT threat. */
export interface CreatureTickEvent {
  pos: Pos;
  tick: TurnTick;
}

/** A creature's turn starting: its regen, HoTs and DoTs (turnStartTick). The same creature when nothing changes. */
export function creatureTurnStart(e: EnemyInstance): { enemy: EnemyInstance; event: CreatureTickEvent | null } {
  const tick = turnStartTick(e.stats, e.currentHp, e.currentMp, e.hots, e.dots);
  if (tickChangesNothing(tick, e.currentHp, e.currentMp, [e.hots, e.dots])) return { enemy: e, event: null };
  return { enemy: { ...e, currentHp: tick.hp, currentMp: tick.mp }, event: { pos: bodyCenter(bodyOf(e)), tick } };
}

/**
 * A creature's turn ending: its effects count down (countDownTurns; its stats follow its buffs), and a summoned
 * creature's time with them (either side's): one whose time runs out `vanished` (the caller removes it).
 */
export function creatureTurnEnd(e: EnemyInstance): { enemy: EnemyInstance; vanished: boolean } {
  // (a forever summon's time never runs out: it counts down like any creature's effects only)
  const left = e.summon?.turnsLeft;
  const timed = typeof left === 'number' ? left : null;
  if (timed !== null && timed <= 1) return { enemy: e, vanished: true };
  if (timed === null && ![e.buffs, e.hots, e.dots].some(runsDown)) return { enemy: e, vanished: false };
  const buffs = countDownTurns(e.buffs);
  const next = buffs.length !== e.buffs.length ? withEnemyBuffs(e, buffs) : { ...e, buffs };
  return {
    enemy: { ...next, hots: countDownTurns(e.hots), dots: countDownTurns(e.dots), ...(e.summon && timed !== null && { summon: { ...e.summon, turnsLeft: timed - 1 } }) },
    vanished: false,
  };
}

/**
 * Out of combat, on a timer: a whole turn (its start, then its end) for every creature of zone `zoneId` (where the
 * party is; the others wait, untouched). Vanished summons are removed and listed.
 */
export function applyRestTick(enemies: EnemyInstance[], zoneId: number): { enemies: EnemyInstance[]; events: CreatureTickEvent[]; vanished: EnemyInstance[] } {
  const events: CreatureTickEvent[] = [], vanished: EnemyInstance[] = [];
  let changed = false;
  const updated = enemies.flatMap(e => {
    if (e.zoneId !== zoneId || e.currentHp <= 0) return [e];
    const start = creatureTurnStart(e);
    if (start.event) events.push(start.event);
    const end = creatureTurnEnd(start.enemy);
    if (end.vanished) { vanished.push(e); changed = true; return []; }
    if (end.enemy !== e) changed = true;
    return [end.enemy];
  });
  // Nothing ticked: the same array, so the caller's state doesn't change
  return { enemies: changed ? updated : enemies, events, vanished };
}

export function getCurrentCombatant(state: CombatState): Combatant | null {
  if (!state.active || state.turnOrder.length === 0) return null;
  return state.turnOrder[state.currentTurnIndex];
}

// Movement abilities (Ability.move): where a caster may move to by one, and resolving it. The caster moves to the
// aimed square first (planAbilityMove), then the ability resolves as usual from where it landed (executeAction).
// Shared by the party and the creatures: the party aims them by hand (moveAims), the enemy AI picks an aim with
// planAbilityMove (enemyAI.ts); both resolve through executeMoveAction, and useActionOutcomes lands the move.
import type { Ability } from './abilities';
import { areaCenter, isArea } from './areas';
import { executeAction, type ActionOutcome, type ActionWorld, type CombatUnit } from './abilityExecution';
import { isRooted, type ActiveBuff } from '../units/stats';
import { bresenham, canStep, chebyshev, covers, fits, footprint, footprintKeys, inRangeAndSight, keyPos, samePos, type Body, type Pos } from '../world/grid';

/** Where a movement ability takes its caster: the tiles it passes (the start excluded, the landing last), and where it lands. */
export interface MovePlan {
  /** The caster's top-left tile after each step; empty when it is already where it would land (a charge on a neighbour). */
  path: Pos[];
  /** The caster's top-left tile once it has moved. */
  landing: Pos;
}

/** What planning a move needs to know of the fight and the map (the caster itself excluded from the unit lists). */
export interface MoveWorld {
  /** The tiles sight passes over (ZoneData.sight): range and sight of the aim, and the tiles `throughObstacles` may cross. */
  sight: ReadonlySet<string>;
  /** Floor a unit may stand on (zoneWalkable: no walls, obstacles or map objects). */
  isWalkable: (p: Pos) => boolean;
  /** Units hostile to the caster: they block the path unless `throughEnemies`, and nobody lands on one. */
  hostiles: Body[];
  /** Every other unit (the caster's side): they never block the path, but nobody lands on one. */
  allies: Body[];
}

const overlaps = (a: Body, b: Body) => footprint(a).some(t => covers(b, t));

/** A movement ability can't be used while its caster is rooted (a root stops every kind of movement). */
export const rootBlocks = (ability: Pick<Ability, 'move'>, buffs: ActiveBuff[]): boolean => !!ability.move && isRooted(buffs);

/**
 * Where `caster` would move by `ability` (a movement ability) aimed at tile `at`; null if it can't be aimed there:
 * - what it may be aimed at follows its target kind, as aimPartyAction does: a 'tile' ability, an empty tile; a single
 *   'enemy' / 'ally' one, a unit of that kind; an area one, any tile or unit; 'self' never.
 * - the aim (a unit's whole body, if one is there) is in range and sight of the caster;
 * - the path is the straight line from the caster's tile nearest the aim to it (the line area's); it ends on the aimed
 *   empty tile, or on the last tile before the aimed unit's body;
 * - a hostile unit on the path blocks it unless `throughEnemies`; allies never do. Without `throughObstacles` every
 *   tile of it (and each step) is walkable floor; with it, anything sight passes over will do;
 * - it lands on walkable floor with no other unit on it; else the aim is invalid (it never stops short).
 * The caster may be a large body (the offsets of its tiles from the line are kept), though only the party uses this so far.
 */
export function planAbilityMove(caster: Body, at: Pos, ability: Ability, world: MoveWorld): MovePlan | null {
  const move = ability.move;
  if (!move || ability.target === 'self' || covers(caster, at)) return null;
  const size = caster.size ?? 1;

  const hostile = world.hostiles.find(u => covers(u, at));
  const unit = hostile ?? world.allies.find(u => covers(u, at));
  const area = isArea(ability);
  if (ability.target === 'tile' ? unit
    : !area && (ability.target === 'enemy' ? !hostile : !unit || hostile)) return null;
  // A unit aimed at is aimed at all of it
  const aim = unit ? areaCenter(at, [unit]) : at;
  if (!inRangeAndSight(caster, aim, ability.range, world.sight)) return null;

  // The line from the caster's tile nearest the aim, taken as steps of the caster's own top-left tile
  const aimPos = 'pos' in aim ? aim.pos : aim;
  const from = footprint(caster).reduce((a, b) => (chebyshev(b, aimPos) < chebyshev(a, aimPos) ? b : a));
  const offset = { x: caster.pos.x - from.x, y: caster.pos.y - from.y };
  let route = bresenham(from, aimPos).map(t => ({ x: t.x + offset.x, y: t.y + offset.y }));
  if (unit) {
    // Stops beside the unit, short of its body
    const hit = route.findIndex(p => overlaps({ pos: p, size }, unit));
    if (hit !== -1) route = route.slice(0, hit);
  }

  const key = (p: Pos) => footprintKeys({ pos: p, size });
  let prev = caster.pos;
  for (let i = 0; i < route.length; i++) {
    const p = route[i];
    const body = { pos: p, size };
    const landing = i === route.length - 1;
    // Standing there: floor, with no one on it
    if (landing) {
      if (!fits(p, size, world.isWalkable) || [...world.hostiles, ...world.allies].some(u => overlaps(body, u))) return null;
    } else if (!move.throughEnemies && world.hostiles.some(u => overlaps(body, u))) return null;
    // Passing through (the landing tile is already known to be floor)
    if (move.throughObstacles) {
      if (!key(p).every(k => world.sight.has(k))) return null;
    } else if (!fits(p, size, world.isWalkable) || !canStep(prev, p.x - prev.x, p.y - prev.y, world.isWalkable)) return null;
    prev = p;
  }
  return { path: route, landing: route.length ? route[route.length - 1] : caster.pos };
}

/**
 * Every tile `ability` (a movement ability) may be aimed at among `candidates` (tile keys: e.g. the floor the party sees
 * now), with the move each one makes. The caster's own tile is never one.
 */
export function moveAims(caster: Body, ability: Ability, world: MoveWorld, candidates: Iterable<string>): Map<string, MovePlan> {
  const out = new Map<string, MovePlan>();
  for (const k of candidates) {
    const plan = planAbilityMove(caster, keyPos(k), ability, world);
    if (plan) out.set(k, plan);
  }
  return out;
}

/**
 * Resolve a movement ability: its caster moves along `plan`, then the ability resolves from the landing tile
 * (executeAction, with `targets` and `allies` as aimed: see aimPartyAction). The outcome says where the caster went
 * (ActionOutcome.move) for whoever lands it to place it and show the move; none if it didn't move.
 */
export function executeMoveAction(
  caster: CombatUnit, action: Ability, plan: MovePlan,
  targets: CombatUnit[], aimAt: Pos | undefined, allies: CombatUnit[], world: ActionWorld,
): ActionOutcome {
  const moved = samePos(plan.landing, caster.pos) ? caster : { ...caster, pos: plan.landing };
  const outcome = executeAction(moved, action, targets, aimAt, allies, world);
  if (moved === caster) return outcome;
  const element = action.displayElement ?? action.effects.find(e => e.damageElement)?.damageElement;
  return { ...outcome, move: { ref: caster.ref, to: plan.landing, tiles: plan.path.length, style: action.move?.style ?? 'dash', ...(element && { element }) } };
}

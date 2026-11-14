// Aiming a party member's action: who it lands on when used on a tile, or that it can't be used there.
import type { Ability, AreaType } from './abilities';
import { affectedKeys, areaAim, areaCenter, isArea, unitsInArea } from './areas';
import { unitKey, type CombatUnit } from './abilityExecution';
import type { MovePlan } from './abilityMoves';
import { inRangeAndSight, posKey, samePos, type Pos } from '../world/grid';

/** Who an action lands on: `targets` (its target effects), `allies` (its 'allies' effects, the caster's side in its area). */
export interface AimedAction {
  targets: CombatUnit[];
  allies: CombatUnit[];
  /** A movement ability's move: the caster goes along it first (executeMoveAction). */
  move?: MovePlan;
}

/**
 * Who `action`, used by a party member at `casterPos` on tile `at`, lands on; null if it can't be used there:
 * - self: only on the caster's own tile.
 * - tile: only on one of `tileTargets` (an empty tile in range and sight; the outcome gets the tile).
 * - ally (in or out of combat, in range and sight): the party member or summoned ally on the tile (`allyAt`), or,
 *   for an area ability, every unit of the party's side in its area. Nobody there: null. A summons-only ability
 *   (action.summonsOnly) takes only the caster's own summons among them.
 * - enemy (in combat only, in range and sight): the hostile units in its area (never the party's allies), with
 *   the party's side in the area as `allies`. A single-target attack on an empty tile: null.
 * A movement ability (action.move) can only be aimed at one of `moveAims` (where it may go: planAbilityMove), whatever
 * its target kind; the result carries its move, and the caster counts as standing on the landing tile.
 */
export function aimPartyAction(action: Ability, o: {
  casterPos: Pos;
  at: Pos;
  /** The tiles sight passes over on the map (ZoneData.sight), for sight and areas. */
  sight: ReadonlySet<string>;
  inCombat: boolean;
  /** The party's side: its living members and summoned allies. */
  partySide: () => CombatUnit[];
  /** The party member or summoned ally on a tile (any tile of a large one), if any. */
  allyAt: (p: Pos) => CombatUnit | null;
  /** The living hostile creatures of the zone. */
  hostiles: CombatUnit[];
  /** The tiles a 'tile' ability can be aimed at now (null: none). */
  tileTargets: ReadonlySet<string> | null;
  /** For a movement ability: where it may be aimed now, with the move each makes (null: nowhere). */
  moveAims?: ReadonlyMap<string, MovePlan> | null;
  /** The caster: whose summons a summons-only ability takes; for a movement ability, it stands on the landing tile for the units its area takes in. */
  caster: CombatUnit;
}): AimedAction | null {
  const none: AimedAction = { targets: [], allies: [] };
  if (action.target === 'self') return samePos(o.at, o.casterPos) ? none : null;
  const move = action.move ? o.moveAims?.get(posKey(o.at)) : undefined;
  if (action.move && !move) return null;
  const found = (a: AimedAction): AimedAction => (move ? { ...a, move } : a);
  if (action.target === 'tile') return action.move ? found(none) : o.tileTargets?.has(posKey(o.at)) ? none : null;
  if (action.target === 'enemy' && !o.inCombat) return null;
  // The party's side, with a mover on the tile it lands on
  const partySide = () => {
    const side = o.partySide();
    const mover = move ? unitKey(o.caster.ref) : null;
    return mover ? side.map(u => (unitKey(u.ref) === mover ? { ...u, pos: move!.landing } : u)) : side;
  };
  // Aimed at any tile of a large creature, it is aimed at all of it: in range and sight of any of its tiles, and an
  // a non-blast area centered on its whole square (areaCenter; a blast stays round the aimed tile: areaAim)
  const units = [...partySide(), ...o.hostiles];
  if (!inRangeAndSight(o.casterPos, areaCenter(o.at, units), action.range, o.sight)) return null;
  const areaOf = (area: AreaType | undefined) => affectedKeys(o.casterPos, areaAim(o.casterPos, o.at, area, units), area, o.sight);
  if (action.target === 'ally') {
    // A summons-only ability takes only the caster's own summons
    const casterKey = unitKey(o.caster.ref);
    const takes = (u: CombatUnit) => !action.summonsOnly || (!!u.allied && u.owner === casterKey);
    const ally = isArea(action) ? null : o.allyAt(o.at);
    const targets = isArea(action) ? unitsInArea(areaOf(action.area), partySide().filter(takes)) : ally && takes(ally) ? [ally] : [];
    // An area one's units are its targets and its 'allies' both (its 'allies' effects land on them too)
    return targets.length ? found({ targets, allies: isArea(action) ? targets : [] }) : null;
  }
  const area = action.area ?? 'single';
  const affected = areaOf(area);
  const targets = unitsInArea(affected, o.hostiles);
  if (area === 'single' && targets.length === 0) return null;
  return found({ targets, allies: unitsInArea(affected, partySide()) });
}

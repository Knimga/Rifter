// Aiming a party member's action: who it lands on when used on a tile, or that it can't be used there.
import type { Ability } from './abilities';
import { affectedKeys, isArea, unitsInArea } from './areas';
import type { CombatUnit } from './abilityExecution';
import { chebyshev, hasLineOfSight, posKey, samePos, type Pos } from '../world/grid';

/** Who an action lands on: `targets` (its target effects), `allies` (its 'allies' effects, the caster's side in its area). */
export interface AimedAction {
  targets: CombatUnit[];
  allies: CombatUnit[];
}

/**
 * Who `action`, used by a party member at `casterPos` on tile `at`, lands on; null if it can't be used there:
 * - self: only on the caster's own tile.
 * - tile: only on one of `tileTargets` (an empty tile in range and sight; the outcome gets the tile).
 * - ally (in or out of combat, in range and sight): the party member or summoned ally on the tile (`allyAt`), or,
 *   for an area ability, every unit of the party's side in its area. Nobody there: null.
 * - enemy (in combat only, in range and sight): the hostile units in its area (never the party's allies), with
 *   the party's side in the area as `allies`. A single-target attack on an empty tile: null.
 */
export function aimPartyAction(action: Ability, o: {
  casterPos: Pos;
  at: Pos;
  /** The map's floor, for range areas and sight. */
  floors: ReadonlySet<string>;
  inCombat: boolean;
  /** The party's side: its living members and summoned allies. */
  partySide: () => CombatUnit[];
  /** The party member or summoned ally on a tile, if any. */
  allyAt: (p: Pos) => CombatUnit | null;
  /** The living hostile creatures of the zone. */
  hostiles: CombatUnit[];
  /** The tiles a 'tile' ability can be aimed at now (null: none). */
  tileTargets: ReadonlySet<string> | null;
}): AimedAction | null {
  const none: AimedAction = { targets: [], allies: [] };
  if (action.target === 'self') return samePos(o.at, o.casterPos) ? none : null;
  if (action.target === 'tile') return o.tileTargets?.has(posKey(o.at)) ? none : null;
  if (action.target === 'enemy' && !o.inCombat) return null;
  if (chebyshev(o.casterPos, o.at) > action.range || !hasLineOfSight(o.casterPos, o.at, o.floors)) return null;
  if (action.target === 'ally') {
    const ally = isArea(action) ? null : o.allyAt(o.at);
    const targets = isArea(action) ? unitsInArea(affectedKeys(o.casterPos, o.at, action.area, o.floors), o.partySide()) : ally ? [ally] : [];
    return targets.length ? { targets, allies: [] } : null;
  }
  const area = action.area ?? 'single';
  const affected = affectedKeys(o.casterPos, o.at, area, o.floors);
  const targets = o.hostiles.filter(u => affected.has(posKey(u.pos)));
  if (area === 'single' && targets.length === 0) return null;
  return { targets, allies: unitsInArea(affected, o.partySide()) };
}

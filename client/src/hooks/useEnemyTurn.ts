import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { EnemyInstance } from '../data/enemies';
import type { ZoneData } from '../data/dungeonGen';
import type { Stats } from '../data/stats';
import { advanceTurn, apLeft, deadPartyIndices, stunnedOutcome, type CombatState, type Combatant } from '../data/combat';
import { ENEMY_FOLLOWUP_PAUSE_MS, ENEMY_STEP_PAUSE_MS, STUNNED_PAUSE_MS } from '../data/constants';
import { computeEnemyTurn } from '../data/enemyAI';
import { affectedKeys, isArea, posKey, type Pos } from '../data/dungeonHelpers';
import { executeAction, type ActionOutcome, type CombatUnit } from '../data/abilityExecution';

type Refs = {
  enemies: MutableRefObject<EnemyInstance[]>;
  partyPos: MutableRefObject<Pos[]>;
  partyStats: MutableRefObject<Stats[]>;
  partyHp: MutableRefObject<number[]>;
  partyNames: MutableRefObject<string[]>;
  partyThreat: MutableRefObject<number[]>;
  zone: MutableRefObject<ZoneData | null>;
  currentZone: MutableRefObject<number>;
  /** Tiles of the zone a game object stands on (objectTilesOf): not walkable. */
  zoneObjects: MutableRefObject<Set<string>>;
  /**
   * `aimAt`: the tile the ability was aimed at (the caster's model turns to face it first). Returns the
   * delay (ms) before the outcome lands.
   */
  applyOutcome: MutableRefObject<(outcome: ActionOutcome, caster: CombatUnit, aimAt?: Pos) => number>;
};

export type EnemyAoePreview = { tiles: Set<string> };


export function useEnemyTurn(
  combat: CombatState,
  currentCombatant: Combatant | null,
  refs: Refs,
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>,
  setCombat: Dispatch<SetStateAction<CombatState>>,
  setEnemyAoePreview: Dispatch<SetStateAction<EnemyAoePreview | null>>,
  setEnemyTargetPartyIdx: Dispatch<SetStateAction<number | null>>,
) {
  useEffect(() => {
    if (!combat.active || !currentCombatant || currentCombatant.isPlayer) return;

    const z = refs.zone.current;
    if (!z) return;

    const zoneEnemies = () => refs.enemies.current.filter(e => e.zoneId === z.id);
    const liveEnemy = () => zoneEnemies().find(e => e.id === currentCombatant.id && e.currentHp > 0);
    if (!liveEnemy()) {
      setCombat(prev => advanceTurn(prev, zoneEnemies()));
      return;
    }

    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (ms: number, fn: () => void) => timers.push(setTimeout(() => { if (!cancelled) fn(); }, ms));

    const advanceTurnNow = () => {
      const latestZoneEnemies = refs.enemies.current.filter(e => e.zoneId === refs.currentZone.current);
      // partyHp may not reflect this turn's damage yet; GameScreen also skips a member who died mid-round
      setCombat(prev => advanceTurn(prev, latestZoneEnemies, deadPartyIndices(refs.partyHp.current)));
    };

    /**
     * One step of its turn (enemyAI computeEnemyTurn: a move and/or an ability), then the next, until it has
     * no AP left or nothing useful to do. Each step plays out in three beats (move, show its target, land);
     * the first at ENEMY_STEP_PAUSE_MS each, follow-ups faster. Planned when the step starts, not when the
     * turn does: the top-of-round tick (buffs running out, e.g. a stun on its AP) has landed by then, and
     * each step sees where everyone is after the last.
     */
    const step = (apSpent: number, paidTiles: number) => {
      const pause = apSpent === 0 && paidTiles === 0 ? ENEMY_STEP_PAUSE_MS : ENEMY_FOLLOWUP_PAUSE_MS;
      later(pause, () => {
        const enemy = liveEnemy();
        const currentZoneEnemies = zoneEnemies();
        if (!enemy) { advanceTurnNow(); return; }
        const caster = (pos: Pos, stats = enemy.stats): CombatUnit => ({ ref: { side: 'enemy', id: enemy.id }, name: enemy.classData.name, stats, pos });

        // No AP at the start of its turn (stunned): it loses the turn
        if (apSpent === 0 && enemy.stats.apMax <= 0) {
          refs.applyOutcome.current(stunnedOutcome(enemy.pos), caster(enemy.pos));
          later(STUNNED_PAUSE_MS, advanceTurnNow);
          return;
        }

        const partyMembers = refs.partyPos.current.map((pos, i) => ({
          pos,
          hp: refs.partyHp.current[i] ?? 0,
        }));
        const action = computeEnemyTurn(enemy, partyMembers, currentZoneEnemies, z.floors, refs.partyThreat.current, refs.zoneObjects.current,
          { ap: apLeft(enemy.stats.apMax, { apSpent }), paidTiles });
        const ability = action.abilityUsed;
        // Nothing left worth doing: its turn ends
        if (!action.moveTo && !ability) { advanceTurnNow(); return; }
        const next = () => step(apSpent + action.apSpent, action.tilesLeft);

        const finalPos = action.moveTo ?? enemy.pos;
        if (action.moveTo) {
          setEnemies(prev => prev.map(e =>
            e.id === enemy.id ? { ...e, pos: action.moveTo! } : e
          ));
        }
        // A move alone: on to its next step
        if (!ability) { next(); return; }

        // Determine target party indices (AoE may hit multiple members)
        const aoeTiles = isArea(ability) && action.abilityTargetPos
          ? affectedKeys(finalPos, action.abilityTargetPos, ability.area, z.floors)
          : null;
        const targetPartyIndices: number[] =
          ability.target !== 'enemy' ? []
          : aoeTiles ? refs.partyPos.current.flatMap((pos, i) => aoeTiles.has(posKey(pos)) ? [i] : [])
          : action.targetPartyIdx !== null ? [action.targetPartyIdx]
          : [];

        // Show its target: the single-target highlight or the AoE preview
        later(pause, () => {
          if (action.targetPartyIdx !== null && ability.target === 'enemy') setEnemyTargetPartyIdx(action.targetPartyIdx);
          if (aoeTiles && targetPartyIndices.length > 0) setEnemyAoePreview({ tiles: aoeTiles });

          // Then it lands
          later(pause, () => {
            setEnemyTargetPartyIdx(null);
            setEnemyAoePreview(null);

            const latest = refs.enemies.current.find(e => e.id === enemy.id) ?? enemy;
            const targets: CombatUnit[] = targetPartyIndices.map(i => ({
              ref: { side: 'party', idx: i },
              name: refs.partyNames.current[i] ?? `Party[${i}]`,
              stats: refs.partyStats.current[i],
              pos: refs.partyPos.current[i],
            }));
            // Aimed at the AoE's target tile, else the targeted member
            const aimAt = action.abilityTargetPos ?? targets[0]?.pos;
            // The enemy turns to face its target, the attack lands, then its next step
            const by = caster(finalPos, latest.stats);
            const landsIn = refs.applyOutcome.current(executeAction(by, ability, targets), by, aimAt);
            if (landsIn > 0) later(landsIn, next);
            else next();
          });
        });
      });
    };
    step(0, 0);

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      setEnemyAoePreview(null);
      setEnemyTargetPartyIdx(null);
    };
  }, [combat.active, combat.currentTurnIndex, currentCombatant, refs, setCombat, setEnemies, setEnemyAoePreview, setEnemyTargetPartyIdx]);
}

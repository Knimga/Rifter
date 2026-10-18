import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { EnemyInstance } from '../data/enemies';
import type { ZoneData } from '../data/dungeonGen';
import type { Stats } from '../data/stats';
import { advanceTurn, deadPartyIndices, type CombatState, type Combatant } from '../data/combat';
import { computeEnemyTurn } from '../data/enemyAI';
import { affectedKeys, posKey, type Pos } from '../data/dungeonHelpers';
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
  /** `aimAt`: the tile the ability was aimed at (the caster's model turns to face it). */
  applyOutcome: MutableRefObject<(outcome: ActionOutcome, caster: CombatUnit, aimAt?: Pos) => void>;
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

    const currentZoneEnemies = refs.enemies.current.filter(e => e.zoneId === z.id);
    const enemy = currentZoneEnemies.find(e => e.id === currentCombatant.id && e.currentHp > 0);
    if (!enemy) {
      const partyMovements = refs.partyStats.current.map(s => s.movement);
      setCombat(prev => advanceTurn(prev, currentZoneEnemies, partyMovements));
      return;
    }

    const partyMembers = refs.partyPos.current.map((pos, i) => ({
      pos,
      hp: refs.partyHp.current[i] ?? 0,
    }));

    const action = computeEnemyTurn(enemy, partyMembers, currentZoneEnemies, z.floors, refs.partyThreat.current);
    const ability = action.abilityUsed;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Phase 1 (T=1s): Execute movement
    timers.push(setTimeout(() => {
      if (cancelled) return;

      const finalPos = action.moveTo ?? enemy.pos;

      if (action.moveTo) {
        setEnemies(prev => prev.map(e =>
          e.id === enemy.id ? { ...e, pos: action.moveTo! } : e
        ));
      }

      // Determine target party indices (AoE may hit multiple members)
      const isAoe = !!ability?.area && ability.area !== 'single';
      const aoeTiles = isAoe && action.abilityTargetPos
        ? affectedKeys(finalPos, action.abilityTargetPos, ability!.area, z.floors)
        : null;
      const targetPartyIndices: number[] =
        !ability || ability.target !== 'enemy' ? []
        : aoeTiles ? refs.partyPos.current.flatMap((pos, i) => aoeTiles.has(posKey(pos)) ? [i] : [])
        : action.targetPartyIdx !== null ? [action.targetPartyIdx]
        : [];

      const advanceTurnNow = () => {
        const latestZoneEnemies = refs.enemies.current.filter(e => e.zoneId === refs.currentZone.current);
        const partyMovements = refs.partyStats.current.map(s => s.movement);
        // partyHp may not reflect this turn's damage yet; GameScreen also skips a member who died mid-round
        setCombat(prev => advanceTurn(prev, latestZoneEnemies, partyMovements, deadPartyIndices(refs.partyHp.current)));
      };

      // Phase 2 (T=2s): Show targeting indicators
      timers.push(setTimeout(() => {
        if (cancelled) return;

        if (!ability) {
          // No attack — advance immediately
          advanceTurnNow();
          return;
        }

        // Show single-target highlight or AoE preview
        if (action.targetPartyIdx !== null && ability.target === 'enemy') {
          setEnemyTargetPartyIdx(action.targetPartyIdx);
        }
        if (aoeTiles && targetPartyIndices.length > 0) {
          setEnemyAoePreview({ tiles: aoeTiles });
        }

        // Phase 3 (T=3s): Execute and advance
        timers.push(setTimeout(() => {
          if (cancelled) return;
          setEnemyTargetPartyIdx(null);
          setEnemyAoePreview(null);

          const latest = refs.enemies.current.find(e => e.id === enemy.id) ?? enemy;
          const caster: CombatUnit = { ref: { side: 'enemy', id: enemy.id }, name: enemy.classData.name, stats: latest.stats, pos: finalPos };
          const targets: CombatUnit[] = targetPartyIndices.map(i => ({
            ref: { side: 'party', idx: i },
            name: refs.partyNames.current[i] ?? `Party[${i}]`,
            stats: refs.partyStats.current[i],
            pos: refs.partyPos.current[i],
          }));
          // Aimed at the AoE's target tile, else the targeted member
          const aimAt = action.abilityTargetPos ?? targets[0]?.pos;
          refs.applyOutcome.current(executeAction(caster, ability, targets), caster, aimAt);
          advanceTurnNow();
        }, 1000));
      }, 1000));
    }, 1000));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      setEnemyAoePreview(null);
      setEnemyTargetPartyIdx(null);
    };
  }, [combat.active, combat.currentTurnIndex, currentCombatant, refs, setCombat, setEnemies, setEnemyAoePreview, setEnemyTargetPartyIdx]);
}

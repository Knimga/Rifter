import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import { isAlly, isHostile, type EnemyInstance } from '../data/units/enemies';
import type { ZoneData } from '../data/world/dungeonGen';
import type { Stats } from '../data/units/stats';
import { advanceTurn, apLeft, deadPartyIndices, stunnedOutcome, type CombatState, type Combatant } from '../data/combat/combat';
import { ENEMY_FOLLOWUP_PAUSE_MS, ENEMY_STEP_PAUSE_MS, STUNNED_PAUSE_MS } from '../data/constants';
import { computeEnemyTurn, type Foe, type Friend } from '../data/combat/enemyAI';
import type { Ability } from '../data/combat/abilities';
import { affectedKeys, isArea, unitsInArea } from '../data/combat/areas';
import { posKey, type Pos } from '../data/world/grid';
import { creatureUnit, executeAction, memberUnit, unitKey, type ActionOutcome, type CombatUnit } from '../data/combat/abilityExecution';
import { isOnMap } from '../data/units/party';

type Refs = {
  enemies: MutableRefObject<EnemyInstance[]>;
  partyPos: MutableRefObject<Pos[]>;
  partyStats: MutableRefObject<Stats[]>;
  partyHp: MutableRefObject<number[]>;
  partyNames: MutableRefObject<string[]>;
  /** CombatState.threat: party members' and summoned allies' threat, by key. */
  threat: MutableRefObject<Record<string, number>>;
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

/**
 * The turns of every creature the AI runs: enemies (summoned ones too), and the party's summoned allies. All
 * use the same AI (computeEnemyTurn) and steps; they differ only in who their foes and friends are (an
 * enemy's foes: the party and its allies; an ally's: the aggroed enemies).
 */
export function useEnemyTurn(
  combat: CombatState,
  currentCombatant: Combatant | null,
  refs: Refs,
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>,
  setCombat: Dispatch<SetStateAction<CombatState>>,
  setEnemyAoePreview: Dispatch<SetStateAction<EnemyAoePreview | null>>,
  /** The unit (unitKey) a creature is about to hit, highlighted on the map; null when none. */
  setEnemyTargetKey: Dispatch<SetStateAction<string | null>>,
  /** The ability the acting creature is using (from when it shows its target until its next step); null when none. */
  setEnemyAbility: Dispatch<SetStateAction<Ability | null>>,
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
        setEnemyAbility(null);
        const enemy = liveEnemy();
        const currentZoneEnemies = zoneEnemies();
        if (!enemy) { advanceTurnNow(); return; }
        const caster = (pos: Pos, stats = enemy.stats): CombatUnit => ({ ...creatureUnit(enemy), stats, pos });

        // No AP at the start of its turn (stunned): it loses the turn
        if (apSpent === 0 && enemy.stats.apMax <= 0) {
          refs.applyOutcome.current(stunnedOutcome(enemy.pos), caster(enemy.pos));
          later(STUNNED_PAUSE_MS, advanceTurnNow);
          return;
        }

        // Its foes, as units: an enemy's are the party and its summoned allies; an ally's, the enemies in the fight
        const livingCreatures = currentZoneEnemies.filter(e => e.currentHp > 0);
        const ally = isAlly(enemy);
        const partyUnits = refs.partyPos.current.map((pos, i): CombatUnit & { hp: number; maxHp: number } => ({
          ...memberUnit(i, refs.partyNames.current[i], refs.partyStats.current[i], pos),
          hp: refs.partyHp.current[i] ?? 0,
          maxHp: refs.partyStats.current[i]?.hp ?? 1,
        }));
        const creatureFoes = livingCreatures
          .filter(e => (ally ? isHostile(e) && e.aggroed : isAlly(e)))
          .map(e => ({ ...creatureUnit(e), hp: e.currentHp }));
        const foeUnits = ally ? creatureFoes : [...partyUnits, ...creatureFoes];
        const foes: Foe[] = foeUnits.map(u => ({ key: unitKey(u.ref), pos: u.pos, hp: u.hp }));
        // Its side, for its heals (itself aside): an enemy's, the other enemies in the fight; an ally's, the party
        // and the other allies
        const friendUnits = [
          ...(ally ? partyUnits.filter(u => u.hp > 0) : []),
          ...livingCreatures.filter(e => e.id !== enemy.id && isAlly(e) === ally && (ally || e.aggroed))
            .map(e => ({ ...creatureUnit(e), hp: e.currentHp, maxHp: e.stats.hp })),
        ];
        const friends: Friend[] = friendUnits.map(u => ({ key: unitKey(u.ref), pos: u.pos, hp: u.hp, maxHp: u.maxHp }));
        // Its summons out, by the ability that summoned them
        const summonsOut: Record<string, number> = {};
        for (const c of livingCreatures) if (c.summon?.owner === enemy.id) summonsOut[c.summon.ability] = (summonsOut[c.summon.ability] ?? 0) + 1;
        // Everyone else on the map blocks its way (not a fallen party member: isOnMap)
        const partyOnMap = refs.partyPos.current.filter((_, i) => isOnMap(refs.partyHp.current[i] ?? 0));
        const occupied = [...partyOnMap, ...livingCreatures.filter(e => e.id !== enemy.id).map(e => e.pos)];

        const action = computeEnemyTurn(enemy, foes, occupied, z.floors, refs.threat.current, refs.zoneObjects.current,
          { ap: apLeft(enemy.stats.apMax, { apSpent }), paidTiles }, { friends, summonsOut });
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

        // Its targets: the foes in the area (AoE), else the one it aims at (a foe, or the ally it heals)
        const aoeTiles = isArea(ability) && action.abilityTargetPos
          ? affectedKeys(finalPos, action.abilityTargetPos, ability.area, z.floors)
          : null;
        const targetKeys: string[] =
          ability.target === 'ally' ? (!aoeTiles && action.targetKey !== null ? [action.targetKey] : [])
          : ability.target !== 'enemy' ? []
          : aoeTiles ? foes.filter(f => aoeTiles.has(posKey(f.pos))).map(f => f.key)
          : action.targetKey !== null ? [action.targetKey]
          : [];

        // Show its target: the single-target highlight or the AoE preview
        later(pause, () => {
          setEnemyAbility(ability);
          if (action.targetKey !== null && ability.target === 'enemy') setEnemyTargetKey(action.targetKey);
          if (aoeTiles && targetKeys.length > 0) setEnemyAoePreview({ tiles: aoeTiles });

          // Then it lands
          later(pause, () => {
            setEnemyTargetKey(null);
            setEnemyAoePreview(null);

            const latest = refs.enemies.current.find(e => e.id === enemy.id) ?? enemy;
            // The caster where it now stands, with its latest stats
            const by = caster(finalPos, latest.stats);
            // Its own side in the area (itself where it now stands, and the rest as they are now): its 'allies'
            // effects, and an ally area ability's targets. An enemy's side is the other enemies; an ally's, the party
            // and its fellow allies.
            const sideUnits = (): CombatUnit[] => {
              const creatures = refs.enemies.current.filter(c => c.zoneId === z.id && c.currentHp > 0 && c.id !== enemy.id && isHostile(c) === isHostile(enemy));
              const party = ally ? partyUnits.filter(u => u.hp > 0) : [];
              return [by, ...party, ...creatures.map(creatureUnit)];
            };
            // As they are now (a creature's latest stats, after anything that landed meanwhile)
            const unitFor = (key: string): CombatUnit[] => {
              if (key === enemy.id) return [by];
              const u = [...foeUnits, ...friendUnits].find(f => unitKey(f.ref) === key);
              if (!u) return [];
              if (u.ref.side === 'party') return [{ ...u, stats: refs.partyStats.current[u.ref.idx] }];
              const id = u.ref.id;
              const e = refs.enemies.current.find(c => c.id === id && c.currentHp > 0);
              return e ? [creatureUnit(e)] : [];
            };
            const targets = ability.target === 'ally' && aoeTiles ? unitsInArea(aoeTiles, sideUnits()) : targetKeys.flatMap(unitFor);
            // Aimed at the AoE's target tile, else the targeted member
            const aimAt = action.abilityTargetPos ?? targets[0]?.pos;
            // The creature turns to face its target, the ability lands (a 'tile' one on its aimed tile, e.g. where a
            // summon appears), then its next step
            const allies = ability.target === 'enemy' && aoeTiles ? unitsInArea(aoeTiles, sideUnits()) : [];
            const landsIn = refs.applyOutcome.current(executeAction(by, ability, targets, action.abilityTargetPos ?? undefined, allies), by, aimAt);
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
      setEnemyTargetKey(null);
      setEnemyAbility(null);
    };
  }, [combat.active, combat.currentTurnIndex, currentCombatant, refs, setCombat, setEnemies, setEnemyAoePreview, setEnemyTargetKey, setEnemyAbility]);
}

// What the active party member does: walking (in a fight on its AP; out of one the leader, the others trailing it),
// using the armed ability, ending its turn, and its turn ending by itself once it has nothing left to spend (or it
// died, or it is stunned).
import { useCallback, useEffect, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { Ability } from '../data/combat/abilities';
import { mpCostAt, summonsForever } from '../data/combat/abilities';
import { AUTO_END_TURN_DELAY_MS, COMBAT_TEXT_COLOR, STUNNED_PAUSE_MS } from '../data/constants';
import { bodyOf, creatureTiles, isHostile, type EnemyInstance } from '../data/units/enemies';
import type { ActiveBuff } from '../data/units/stats';
import { aimPartyAction } from '../data/combat/targeting';
import { executeMoveAction, rootBlocks } from '../data/combat/abilityMoves';
import { creatureUnit, executeAction, unitKey, type ActionWorld, type CombatUnit } from '../data/combat/abilityExecution';
import { summonsOf } from '../data/units/summons';
import { advanceTurn, deadPartyIndices, moveCost, stunnedOutcome, type CombatState, type Combatant } from '../data/combat/combat';
import { covers, posKey, samePos, type Pos } from '../data/world/grid';
import { marchParty, partyWalk } from '../data/world/movement';
import { isSanctumWalkable, SANCTUM_FLOORS } from '../data/world/sanctum';
import { zoneWalkable, type DungeonData, type ZoneData } from '../data/world/gen';
import type { PartyMemberConfig } from '../data/units/party';
import type { ApplyOutcome } from './useActionOutcomes';
import type { SpawnFloat } from './useFloatingText';
import { useLatest } from './useLatest';
import type { useReach } from './useReach';

type Reach = ReturnType<typeof useReach>;

export function usePartyTurn({
  combat, setCombat, currentCombatant, isPlayerTurn, location, party, partyHp, partyBuffs, partyPositions, partyLevel,
  activePartyIdx, activePartyPos, activeAction, activeMp, activeAp, activeMovement, clearActiveSlot,
  playerPos, setPlayerPos, setFollowerPositions, followerPositionsRef, placeMember, pickUpLoot,
  zone, dungeon, zoneEnemies, zoneSummons, zoneForever, setEnemies,
  reach: { moveTargets, tileTargets, moveAims }, partyUnit, actionWorld, applyActionOutcome, spawnFloat, triggerAggro,
}: {
  combat: CombatState;
  setCombat: Dispatch<SetStateAction<CombatState>>;
  currentCombatant: Combatant | null | undefined;
  isPlayerTurn: boolean;
  location: 'sanctum' | 'dungeon';
  party: PartyMemberConfig[];
  partyHp: number[];
  partyBuffs: ActiveBuff[][];
  /** Where each member stands (the leader first). */
  partyPositions: Pos[];
  partyLevel: number;
  /** The acting member (in a fight) or the selected one (out of it), where it stands, and its armed action (toAction). */
  activePartyIdx: number;
  activePartyPos: Pos;
  activeAction: Ability | null;
  activeMp: number;
  /** Its AP left (in a fight) and tiles per AP. */
  activeAp: number;
  activeMovement: number;
  /** Disarm the active member's slot. */
  clearActiveSlot: () => void;
  playerPos: Pos;
  setPlayerPos: Dispatch<SetStateAction<Pos>>;
  setFollowerPositions: Dispatch<SetStateAction<Pos[]>>;
  followerPositionsRef: MutableRefObject<Pos[]>;
  /** Put a member on a tile at once, in a fight (the leader picks up what lies there). */
  placeMember: (idx: number, pos: Pos) => void;
  /** The leader picks up what lies on a tile (useLoot). */
  pickUpLoot: MutableRefObject<(pos: Pos) => void>;
  zone: ZoneData | null;
  dungeon: DungeonData | null;
  zoneEnemies: EnemyInstance[];
  /** The party's living summoned allies in the zone, and those of them that march with it (followsParty). */
  zoneSummons: EnemyInstance[];
  zoneForever: EnemyInstance[];
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>;
  /** Where the active member can walk and aim (useReach). */
  reach: Reach;
  partyUnit: (i: number, pos?: Pos) => CombatUnit;
  actionWorld: () => ActionWorld;
  applyActionOutcome: ApplyOutcome;
  spawnFloat: SpawnFloat;
  /** Wake the groups that see `pos` (starting or joining a fight): true if any did. */
  triggerAggro: (pos: Pos, zoneEnemies: EnemyInstance[], sight: ReadonlySet<string>, inCombat: boolean) => boolean;
}) {
  /** Move the active member to `newPos`. True if it moved and no fight began (a click that walks to an object then uses it). */
  const handleMove = useCallback((newPos: Pos): boolean => {
    const steps = moveTargets.get(posKey(newPos));
    if (steps === undefined) return false; // not reachable this turn (walls, enemies or too far)
    if (combat.active) {
      if (!isPlayerTurn) return false;

      placeMember(activePartyIdx, newPos);

      // Walks the tiles already paid for first, then pays 1 AP per `movement` tiles more
      const movement = activeMovement;
      setCombat(prev => {
        const { apSpent, tilesLeft } = moveCost(steps, prev.paidTiles, movement);
        return { ...prev, apSpent: prev.apSpent + apSpent, paidTiles: tilesLeft };
      });
    } else {
      // Followers trail the leader along the way it walked, in an unbroken line behind it, its forever summons last
      // (marchParty), over walkable floor, never onto an enemy or a map object
      const enemyTiles = creatureTiles(zoneEnemies.filter(e => e.currentHp > 0 && isHostile(e)));
      const walkable = zone && dungeon ? zoneWalkable(dungeon, zone) : isSanctumWalkable;
      const isEnemy = (p: Pos) => enemyTiles.has(posKey(p));
      const walk = partyWalk(playerPos, newPos, steps, walkable, isEnemy);
      const march = marchParty(walk, followerPositionsRef.current, zoneForever.map(bodyOf), p => walkable(p) && !isEnemy(p));
      setPlayerPos(newPos);
      setFollowerPositions(march.followers);
      if (zoneForever.length) {
        const to = new Map(zoneForever.map((e, i) => [e.id, march.summons[i]]));
        setEnemies(prev => prev.map(e => (to.has(e.id) ? { ...e, pos: to.get(e.id)! } : e)));
      }
      pickUpLoot.current(newPos);
    }

    return !(zone && triggerAggro(newPos, zoneEnemies, zone.sight, combat.active));
  }, [combat.active, moveTargets, isPlayerTurn, activePartyIdx, activeMovement, playerPos, zoneEnemies, zoneForever, zone, dungeon, triggerAggro]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleEndTurn = useCallback(() => {
    if (!combat.active || !isPlayerTurn) return;
    clearActiveSlot();
    setCombat(prev => advanceTurn(prev, zoneEnemies, deadPartyIndices(partyHp)));
  }, [combat.active, isPlayerTurn, activePartyIdx, zoneEnemies, partyHp]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Use the armed action on `targetPos`. */
  const handlePlayerAttack = useCallback((targetPos: Pos) => {
    if (combat.active && !isPlayerTurn) return;

    const action = activeAction;
    if (!action || activeMp < mpCostAt(action, partyLevel)) return;
    // A summoned creature only lasts the fight: no summoning out of combat; movement abilities are for fights too.
    // A forever summon outlasts fights, so it can be called up out of one, but only in a dungeon (it stays there)
    const summons = action.effects.some(e => e.type === 'summon');
    const forever = summons && summonsForever(action);
    // A forever summon can't be called up again while it stands (its max of them: recasting would trade it for a
    // fresh, full-HP one), in a fight or out of one: only once it is slain
    const foreverMax = Math.max(0, ...action.effects.flatMap(e => (e.type === 'summon' && e.turns === 'forever' ? [e.max ?? 1] : [])));
    const foreverOut = forever && summonsOf(zoneEnemies, unitKey({ side: 'party', idx: activePartyIdx }), action.name).length >= foreverMax;
    const refusal = foreverOut ? 'Already summoned'
      : combat.active ? null
      : action.move || (summons && !forever) ? 'Only in combat'
      : forever && location !== 'dungeon' ? 'Only in a dungeon'
      : null;
    if (refusal) {
      spawnFloat(activePartyPos.x, activePartyPos.y, refusal, COMBAT_TEXT_COLOR.warn);
      clearActiveSlot();
      return;
    }
    // A rooted member can't move by an ability either
    if (rootBlocks(action, partyBuffs[activePartyIdx] ?? [])) {
      spawnFloat(activePartyPos.x, activePartyPos.y, 'Rooted', COMBAT_TEXT_COLOR.warn);
      clearActiveSlot();
      return;
    }
    // In combat it also takes AP
    if (combat.active && activeAp < action.apCost) {
      spawnFloat(activePartyPos.x, activePartyPos.y, 'Not enough AP', COMBAT_TEXT_COLOR.warn);
      clearActiveSlot();
      return;
    }

    // Who it lands on (aimPartyAction); used where it can't be, it is just put away
    const caster = partyUnit(activePartyIdx);
    const aimed = aimPartyAction(action, {
      casterPos: activePartyPos, at: targetPos, sight: zone?.sight ?? SANCTUM_FLOORS, inCombat: combat.active,
      partySide: () => [...party.flatMap((_, i) => (partyHp[i] ?? 0) > 0 ? [partyUnit(i)] : []), ...zoneSummons.map(creatureUnit)],
      allyAt: (p) => {
        const i = partyPositions.findIndex(q => samePos(q, p));
        const summon = zoneSummons.find(e => covers(bodyOf(e), p));
        return i >= 0 ? partyUnit(i) : summon ? creatureUnit(summon) : null;
      },
      hostiles: zoneEnemies.filter(e => e.currentHp > 0 && isHostile(e)).map(creatureUnit),
      tileTargets, moveAims, caster,
    });
    if (!aimed) { clearActiveSlot(); return; }

    // A movement ability moves its caster first, then resolves from where it lands
    const outcome = aimed.move
      ? executeMoveAction(caster, action, aimed.move, aimed.targets, targetPos, aimed.allies, actionWorld())
      : executeAction(caster, action, aimed.targets, targetPos, aimed.allies, actionWorld());
    applyActionOutcome(outcome, caster, targetPos);
    clearActiveSlot();
    if (combat.active) setCombat(prev => ({ ...prev, apSpent: prev.apSpent + action.apCost }));
    // Landing near sleeping enemies wakes them, as walking there would
    if (aimed.move && zone) triggerAggro(aimed.move.landing, zoneEnemies, zone.sight, combat.active);
  }, [combat.active, isPlayerTurn, activeAp, activePartyIdx, activeAction, zoneEnemies, activePartyPos, activeMp, partyPositions, partyHp, partyBuffs, party, zone, zoneSummons, location, tileTargets, moveAims, triggerAggro, applyActionOutcome, spawnFloat, partyLevel]); // eslint-disable-line react-hooks/exhaustive-deps

  // A party member who died since the turn order was built gets skipped
  useEffect(() => {
    if (!combat.active || !currentCombatant?.isPlayer) return;
    if ((partyHp[currentCombatant.partyIndex ?? 0] ?? 1) > 0) return;
    if (partyHp.every(hp => hp <= 0)) return; // a wipe: the death check (GameScreen) ends combat
    clearActiveSlot();
    setCombat(prev => advanceTurn(prev, zoneEnemies, deadPartyIndices(partyHp)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat.active, currentCombatant, partyHp]);

  // A member's turn ends by itself once it has nothing left to spend (no AP, no paid tiles). One that starts
  // its turn with no AP (stunned) loses it, the same as an enemy (useEnemyTurn). Waits a moment first, and
  // rechecks whenever its AP changes (its buffs may still be landing).
  const outOfAp = combat.active && isPlayerTurn && (partyHp[activePartyIdx] ?? 0) > 0 && activeAp === 0 && combat.paidTiles === 0;
  const stunned = outOfAp && combat.apSpent === 0;
  // The timers below fire after a delay: they end the turn with the handler as it is then, not when they were set
  const endTurnRef = useLatest(handleEndTurn);
  useEffect(() => {
    if (!outOfAp) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => {
      if (!stunned) { endTurnRef.current(); return; }
      const caster = partyUnit(activePartyIdx);
      applyActionOutcome(stunnedOutcome(caster.pos), caster);
      timers.push(setTimeout(() => endTurnRef.current(), STUNNED_PAUSE_MS));
    }, AUTO_END_TURN_DELAY_MS));
    return () => timers.forEach(clearTimeout);
  }, [outOfAp, stunned, combat.currentTurnIndex, combat.round]); // eslint-disable-line react-hooks/exhaustive-deps

  return { handleMove, handleEndTurn, handlePlayerAttack };
}

// The game: the Sanctum or a dungeon, the party moving and fighting in it, and the HUD. Each concern lives in
// its own hook (party member state, inventory, chests, experience, round ticks, action outcomes, keys, the
// enemy turn); this screen holds where everyone is and the fight, wires the hooks together, and draws it all.
import { useState, useEffect, useCallback, useMemo } from 'react';

import { CLASSES } from '../data/classes';
import { isWeaponItem, type Item } from '../data/gear';
import { partyCanUseItem } from '../data/inventory';
import { AGGRO_RANGE, AUTO_END_TURN_DELAY_MS, COMBAT_TEXT_COLOR, STUNNED_PAUSE_MS } from '../data/constants';
import { hasPointsToSpend, type PartyMemberConfig } from '../data/party';
import { xpToNext, type PartyProgress } from '../data/xp';
import type { EnemyInstance } from '../data/enemies';
import { affectedKeys, chebyshev, findOpenTilesNear, hasLineOfSight, partyMoveTargets, posKey, samePos, type Pos } from '../data/dungeonHelpers';
import { SANCTUM, isSanctumWalkable } from '../data/sanctum';
import { gameObjectName } from '../data/gameObjects';
import { generateDungeon, isFreeFloor, objectTilesOf, spawnDungeonEnemies, zoneWalkable, type DungeonData, type ZoneData } from '../data/dungeonGen';
import { DUNGEON_PRESETS, type DungeonKey } from '../data/dungeonPresets';
import { startCombat, joinCombat, advanceTurn, apLeft, moveBudget, moveCost, stunnedOutcome, getCurrentCombatant, deadPartyIndices, type CombatState } from '../data/combat';
import { executeAction, toAction, type CombatUnit } from '../data/abilityExecution';
import { findFollowerSpawns, computeFollowerPositions } from '../data/movementHelpers';
import { useEnemyTurn, type EnemyAoePreview } from '../hooks/useEnemyTurn';
import { useFloatingText } from '../hooks/useFloatingText';
import { useLatest } from '../hooks/useLatest';
import { usePartyMembers } from '../hooks/usePartyMembers';
import { useInventory } from '../hooks/useInventory';
import { useChests } from '../hooks/useChests';
import { useExperience } from '../hooks/useExperience';
import { usePendingPoints } from '../hooks/usePendingPoints';
import { useGameKeys } from '../hooks/useGameKeys';
import { useRoundTick } from '../hooks/useRoundTick';
import { useActionOutcomes } from '../hooks/useActionOutcomes';

import CharacterSheet from '../components/CharacterSheet';
import ContainerWindow from '../components/ContainerWindow';
import SanctumMap from '../components/SanctumMap';
import DungeonMap from '../components/DungeonMap';
import PanView, { type Insets } from '../components/PanView';
import type { PartyTokenData } from '../components/mapParts';
import Backdrop from '../components/ui/Backdrop';
import RiftButton from '../components/ui/RiftButton';
import ActionDock, { type SlotContent } from '../components/hud/ActionDock';
import { apState } from '../components/hud/ApTracker';
import PartyRows from '../components/hud/PartyRows';
import { heldGear } from '../components/characterModel';
import TurnOrderStrip from '../components/hud/TurnOrderStrip';
import { XpStrip } from '../components/hud/XpBar';

interface Props {
  party: PartyMemberConfig[];
  setParty: (party: PartyMemberConfig[]) => void;
  /** The party's shared level and XP. */
  progress: PartyProgress;
  setProgress: (progress: PartyProgress) => void;
}

/** Screen space the HUD covers on each side (px): the map pans only within the area inside it. */
const HUD_INSETS: Insets = { top: 84, right: 24, bottom: 164, left: 300 };

const INITIAL_COMBAT: CombatState = {
  active: false,
  turnOrder: [],
  currentTurnIndex: 0,
  round: 0,
  apSpent: 0,
  paidTiles: 0,
  partyThreat: [],
};

export default function GameScreen({ party, setParty, progress, setProgress }: Props) {
  const [location, setLocation] = useState<'sanctum' | 'dungeon'>('sanctum');
  const [playerPos, setPlayerPos] = useState<Pos>(SANCTUM.playerStart);
  const [enemies, setEnemies] = useState<EnemyInstance[]>([]);
  const [combat, setCombat] = useState<CombatState>(INITIAL_COMBAT);
  const { floatingTexts, spawnFloat, removeFloat, clearFloats } = useFloatingText();
  const [showCharSheet, setShowCharSheet] = useState(false);
  const [dungeon, setDungeon] = useState<DungeonData | null>(null);
  // Which dungeon the party is in (or last entered): its preset gives the map's colors, doors and exit portal
  const [dungeonKey, setDungeonKey] = useState<DungeonKey>('crypt');
  const preset = DUNGEON_PRESETS[dungeonKey];
  const [enemyAoePreview, setEnemyAoePreview] = useState<EnemyAoePreview | null>(null);
  const [enemyTargetPartyIdx, setEnemyTargetPartyIdx] = useState<number | null>(null);
  const [currentZone, setCurrentZone] = useState(0);
  const [followerPositions, setFollowerPositions] = useState<Pos[]>([...SANCTUM.followerStarts]);

  // ─── Party ───────────────────────────────────────────────────────────────

  // Each member's HP/MP/effects and effective stats
  const { members, updateMembers, partyHp, partyBuffs, partyHots, partyDots, partyAllStats, reviveDowned, restoreAll, clearEffects } = usePartyMembers(party, progress);
  // Each member's action bar, and which of its slots is armed
  const [partySlots, setPartySlots] = useState<SlotContent[][]>(() =>
    party.map(m => {
      const abilities = CLASSES[m.selectedClass].abilities;
      const slots: SlotContent[] = ['weapon-attack', null, null, null, null];
      abilities.slice(0, 4).forEach((ability, i) => { slots[i + 1] = ability; });
      return slots;
    })
  );
  const [partyActiveSlot, setPartyActiveSlot] = useState<(number | null)[]>(() => party.map(() => null));
  const [barViewIdx, setBarViewIdx] = useState(0);
  // The unit under a hovered turn-order pill (enemy id or player-N), outlined on the map
  const [hoveredCombatant, setHoveredCombatant] = useState<string | null>(null);

  // Active party member: whose turn it is in combat, the selected one (their action bar) out of it
  const currentCombatant = getCurrentCombatant(combat);
  const isPlayerTurn = combat.active && currentCombatant?.isPlayer === true;
  const activePartyIdx = combat.active ? (currentCombatant?.partyIndex ?? 0) : barViewIdx;
  const activePartyPos = activePartyIdx === 0 ? playerPos : (followerPositions[activePartyIdx - 1] ?? playerPos);
  const activeGear = party[activePartyIdx].gear;
  const activeWeapon = activeGear.mainhand && isWeaponItem(activeGear.mainhand) ? activeGear.mainhand : null;
  const activeMp = members[activePartyIdx]?.mp ?? 0;

  // Active slot / ability for the currently acting member
  const activeSlot = partyActiveSlot[activePartyIdx] ?? null;
  const activeAbility = activeSlot !== null ? (partySlots[activePartyIdx]?.[activeSlot] ?? null) : null;
  const clearActiveSlot = () => setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s));

  // Current zone data
  const zone = dungeon?.zones[currentZone] ?? null;
  const zoneEnemies = enemies.filter(e => e.zoneId === currentZone);
  const portalPos = dungeon && currentZone === dungeon.endZoneId ? dungeon.portalPos : null;

  // Party members as drawn on the maps: the leader always, followers only while alive
  const partyPositions = [playerPos, ...followerPositions].slice(0, party.length);
  const memberTokens: PartyTokenData[] = party.map((m, i) => ({
    pos: partyPositions[i],
    classKey: m.selectedClass,
    hp: members[i].hp,
    maxHp: partyAllStats[i].hp,
    mp: members[i].mp,
    maxMp: partyAllStats[i].mp,
    partyIndex: i,
    active: i === activePartyIdx,
    // Equipped items, as the member's 3D model holds them
    ...heldGear(m.gear),
  }));
  // On the map: the leader always, followers only while alive (the HUD's party rows show everyone)
  const partyTokens = memberTokens.filter(t => t.partyIndex === 0 || t.hp > 0);

  // Where the active mover can go this turn (tile key -> steps it costs), by the shared movement rules
  // (partyMoveTargets): walls, game objects (the portal, chests) and enemies block the way, and nobody stops
  // on an occupied tile. The maps highlight exactly these; handleMove accepts only these.
  // In combat the active member moves on its AP (moveBudget: tiles already paid for, plus `movement` per AP left)
  const activeStats = partyAllStats[activePartyIdx];
  const activeAp = combat.active ? apLeft(activeStats.apMax, combat) : 0;
  const moverPos = combat.active ? activePartyPos : playerPos;
  const moverMovement = combat.active ? moveBudget(combat.paidTiles, activeAp, activeStats.movement) : partyAllStats[0].movement;
  const unitTilesKey = [...partyTokens.map(t => posKey(t.pos)), '|', ...zoneEnemies.filter(e => e.currentHp > 0).map(e => posKey(e.pos))].join(';');
  const moveTargets = useMemo(() => {
    const isWalkable = zone && dungeon ? zoneWalkable(dungeon, zone) : isSanctumWalkable;
    const enemyTiles = new Set(zoneEnemies.filter(e => e.currentHp > 0).map(e => posKey(e.pos)));
    const unitTiles = new Set([...enemyTiles, ...partyTokens.map(t => posKey(t.pos))]);
    return partyMoveTargets(moverPos, moverMovement, isWalkable, p => enemyTiles.has(posKey(p)), p => unitTiles.has(posKey(p)));
  }, [moverPos.x, moverPos.y, moverMovement, zone, dungeon, unitTilesKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // What a move of `steps` costs the active member now (the map shows it on the hovered tile)
  const moveApCost = combat.active
    ? (steps: number) => moveCost(steps, combat.paidTiles, activeStats.movement).apSpent
    : undefined;

  // Selected action, normalised (weapon folded in) — drives map targeting and range
  const activeAction = activeAbility ? toAction(activeAbility, activeWeapon) : null;

  // ─── Latest values, for callbacks, timers and the enemy turn ─────────────

  const enemiesRef = useLatest(enemies);
  const zoneRef = useLatest(zone);
  const currentZoneRef = useLatest(currentZone);
  const membersRef = useLatest(members);
  const followerPositionsRef = useLatest(followerPositions);
  const partyPosRef = useLatest(partyPositions);
  const partyStatsRef = useLatest(partyAllStats);
  const partyHpRef = useLatest(partyHp);
  const partyRef = useLatest(party);
  const partyNamesRef = useLatest(party.map(m => m.characterName));
  const partyThreatRef = useLatest(combat.partyThreat);
  const dungeonRef = useLatest(dungeon);
  const leaderPosRef = useLatest(playerPos);
  // Tiles of the current zone a game object stands on (the portal, chests): enemies can't walk there either
  const zoneObjectsRef = useLatest(dungeon && zone ? objectTilesOf(dungeon, zone) : new Set<string>());

  // Preload the 3D model layer (three.js, a separate chunk) while the party is still in the sanctum
  useEffect(() => { void import('../components/ModelLayer'); }, []);

  // Sync barViewIdx to active party member during combat
  useEffect(() => {
    if (combat.active) setBarViewIdx(activePartyIdx);
  }, [combat.active, activePartyIdx]);

  // ─── Loot, inventory and chests ──────────────────────────────────────────

  /** Whether someone in the party can use an item (proficient): loot favours it, and windows fade what no one can use. */
  const partyCanUse = useCallback((item: Item) => partyCanUseItem(partyRef.current, item), [partyRef]);

  const { inventory, takeLoot, equipItem, unequipItem } = useInventory({ party, setParty, spawnFloat });
  const chests = useChests({ location, dungeon, currentZone, combatActive: combat.active, playerPos, partyCanUse, takeLoot });

  /** Replace the current zone's data in the dungeon (e.g. its dropped items). */
  const updateCurrentZone = useCallback((fn: (z: ZoneData) => ZoneData) => {
    setDungeon(prev => prev ? { ...prev, zones: prev.zones.map((z, i) => i === currentZoneRef.current ? fn(z) : z) } : null);
  }, [currentZoneRef]);

  /** Pick up the loot pile on `pos` (walking onto it), as much as fits. */
  const handleLootPickup = useCallback((pos: Pos) => {
    if (!zone) return;
    const key = posKey(pos);
    const items = zone.droppedItems[key];
    if (!items?.length) return;

    const remaining = takeLoot(items, pos);
    if (!remaining) return;
    updateCurrentZone(z => ({
      ...z,
      droppedItems: remaining.length > 0
        ? { ...z.droppedItems, [key]: remaining }
        : Object.fromEntries(Object.entries(z.droppedItems).filter(([k]) => k !== key)),
    }));
  }, [zone, takeLoot, updateCurrentZone]);
  const lootPickupRef = useLatest(handleLootPickup);

  // ─── Actions, ticks, experience, keys ────────────────────────────────────

  const { unitAims, applyActionOutcome, applyOutcomeRef, cancelPendingOutcomes } = useActionOutcomes({
    spawnFloat, updateMembers, partyStatsRef, enemiesRef, dungeonRef, setEnemies, setCombat, updateCurrentZone, partyCanUse,
  });
  useRoundTick({
    combatActive: combat.active, round: combat.round, membersRef, updateMembers, partyStatsRef, partyPosRef,
    enemiesRef, setEnemies, setCombat, spawnFloat,
  });
  const { xpGain, addXp, resetAwarded } = useExperience({ enemies, progress, setProgress, party, setParty, spawnFloat, leaderPosRef });
  const { pendingPoints, setMemberPending, confirmPoints, anyoneLeveling } = usePendingPoints(party, setParty);

  useGameKeys({
    toggleSheet: () => setShowCharSheet(prev => !prev),
    escape: () => {
      if (showCharSheet) { setShowCharSheet(false); return; }
      if (chests.openChest) { chests.closeChest(); return; }
      if (activeSlot !== null) clearActiveSlot();
    },
  });

  // ─── Location transitions ──────────────────────────────────────────────

  /** Go back to the Sanctum, or into a dungeon (a fresh one, generated from its preset). */
  const handleLocationChange = (next: 'sanctum' | DungeonKey) => {
    cancelPendingOutcomes();
    reviveDowned();
    setLocation(next === 'sanctum' ? 'sanctum' : 'dungeon');
    setCombat(INITIAL_COMBAT);
    clearFloats();
    clearEffects();
    resetAwarded(); // enemy ids repeat between dungeons
    chests.resetChests(); // so do chest ids: a new dungeon's chests start full

    if (next !== 'sanctum') {
      const config = DUNGEON_PRESETS[next];
      setDungeonKey(next);
      const d = generateDungeon(config);
      setDungeon(d);
      setCurrentZone(d.startZoneId);
      setPlayerPos(d.playerStart);
      const spawned = spawnDungeonEnemies(d, config);
      setEnemies(spawned);
      setFollowerPositions(findFollowerSpawns(d.playerStart, isFreeFloor(d, d.zones[d.startZoneId], spawned), 2));
    } else {
      setDungeon(null);
      setCurrentZone(0);
      setPlayerPos(SANCTUM.playerStart);
      setFollowerPositions([...SANCTUM.followerStarts]);
      setEnemies([]);
    }
  };

  // ─── Death checks ────────────────────────────────────────────────────────

  useEffect(() => {
    // A party wipe: everyone wakes in the Sanctum at full HP and MP
    if (partyHp.every(hp => hp <= 0)) {
      handleLocationChange('sanctum');
      restoreAll();
      return;
    }
    // Out of combat: revive any individual dead members to 10%
    if (!combat.active && partyHp.some(hp => hp <= 0)) reviveDowned();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyHp, combat.active]);

  // A party member who died since the turn order was built gets skipped
  useEffect(() => {
    if (!combat.active || !currentCombatant?.isPlayer) return;
    if ((partyHp[currentCombatant.partyIndex ?? 0] ?? 1) > 0) return;
    if (partyHp.every(hp => hp <= 0)) return; // a wipe: the death check above ends combat
    clearActiveSlot();
    setCombat(prev => advanceTurn(prev, zoneEnemies, deadPartyIndices(partyHp)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [combat.active, currentCombatant, partyHp]);

  // ─── Aggro detection ─────────────────────────────────────────────────────

  /**
   * Aggro every unaggroed group with a member visible from `pos`, then start combat with them
   * (or add them to the combat already running).
   */
  const triggerAggro = useCallback((pos: Pos, zoneEnemyList: EnemyInstance[], floors: Set<string>, inCombat: boolean) => {
    const spotted = zoneEnemyList.filter(e =>
      e.currentHp > 0 && !e.aggroed &&
      chebyshev(pos, e.pos) <= AGGRO_RANGE &&
      hasLineOfSight(pos, e.pos, floors)
    );
    if (spotted.length === 0) return;

    const aggroGroupIds = new Set(spotted.map(e => e.groupId));
    const newlyAggroed = zoneEnemyList.filter(e => e.currentHp > 0 && !e.aggroed && aggroGroupIds.has(e.groupId));
    const aggroIds = new Set(newlyAggroed.map(e => e.id));
    setEnemies(prev => prev.map(e => aggroIds.has(e.id) ? { ...e, aggroed: true } : e));
    setCombat(prev => inCombat
      ? joinCombat(prev, newlyAggroed)
      : startCombat(party.map((m, i) => ({ stats: partyStatsRef.current[i], name: m.characterName })), newlyAggroed));
  }, [party, partyStatsRef]);

  // ─── Door transitions ─────────────────────────────────────────────────

  const handleDoorClick = useCallback((doorId: string) => {
    if (!zone || !dungeon || combat.active) return;

    const door = zone.doors.find(d => d.id === doorId);
    if (!door) return;

    const targetZone = dungeon.zones[door.targetZoneId];
    const pairedDoor = targetZone.doors.find(d => d.id === door.targetDoorId);
    if (!pairedDoor) return;

    // Arrive on the free floor tile closest to the paired door (never on an enemy), followers around it
    const isFree = isFreeFloor(dungeon, targetZone, enemies);
    const spawnPos = findOpenTilesNear(pairedDoor.pos, isFree, 1, 4)[0];
    if (!spawnPos) return;

    setCurrentZone(door.targetZoneId);
    setPlayerPos(spawnPos);
    setFollowerPositions(findFollowerSpawns(spawnPos, isFree, 2));
    clearFloats();

    triggerAggro(spawnPos, enemies.filter(e => e.zoneId === door.targetZoneId), targetZone.floors, false);
  }, [zone, dungeon, combat.active, enemies, triggerAggro, clearFloats]);

  // ─── Movement handler ────────────────────────────────────────────────────

  const handleMove = useCallback((newPos: Pos) => {
    const steps = moveTargets.get(posKey(newPos));
    if (steps === undefined) return; // not reachable this turn (walls, enemies or too far)
    if (combat.active) {
      if (!isPlayerTurn) return;

      if (activePartyIdx === 0) {
        setPlayerPos(newPos);
        lootPickupRef.current(newPos);
      } else {
        setFollowerPositions(prev => prev.map((p, i) => i === activePartyIdx - 1 ? newPos : p));
      }

      // Walks the tiles already paid for first, then pays 1 AP per `movement` tiles more
      const movement = activeStats.movement;
      setCombat(prev => {
        const { apSpent, tilesLeft } = moveCost(steps, prev.paidTiles, movement);
        return { ...prev, apSpent: prev.apSpent + apSpent, paidTiles: tilesLeft };
      });
    } else {
      // Followers trail the leader over walkable floor, never onto (or through) an enemy or a game object
      const enemyTiles = new Set(zoneEnemies.filter(e => e.currentHp > 0).map(e => posKey(e.pos)));
      const walkable = zone && dungeon ? zoneWalkable(dungeon, zone) : isSanctumWalkable;
      const { f1, f2 } = computeFollowerPositions(
        newPos,
        playerPos,
        followerPositionsRef.current[0],
        followerPositionsRef.current[1],
        partyStatsRef.current[1]?.movement ?? 3,
        partyStatsRef.current[2]?.movement ?? 3,
        p => walkable(p) && !enemyTiles.has(posKey(p)),
      );
      setPlayerPos(newPos);
      setFollowerPositions([f1, f2]);
      lootPickupRef.current(newPos);
    }

    if (zone) triggerAggro(newPos, zoneEnemies, zone.floors, combat.active);
  }, [combat.active, moveTargets, isPlayerTurn, activePartyIdx, activeStats.movement, playerPos, zoneEnemies, zone, dungeon, triggerAggro]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── End turn ────────────────────────────────────────────────────────────

  const handleEndTurn = useCallback(() => {
    if (!combat.active || !isPlayerTurn) return;
    clearActiveSlot();
    setCombat(prev => advanceTurn(prev, zoneEnemies, deadPartyIndices(partyHp)));
  }, [combat.active, isPlayerTurn, activePartyIdx, zoneEnemies, partyHp]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Player action ───────────────────────────────────────────────────────

  const handlePlayerAttack = useCallback((targetPos: Pos) => {
    if (combat.active && !isPlayerTurn) return;

    const action = activeAction;
    if (!action || activeMp < action.mpCost) return;
    // In combat it also takes AP
    if (combat.active && activeAp < action.apCost) {
      spawnFloat(activePartyPos.x, activePartyPos.y, 'Not enough AP', COMBAT_TEXT_COLOR.warn);
      clearActiveSlot();
      return;
    }

    const isAt = (p: Pos) => samePos(p, targetPos);
    const partyUnit = (i: number): CombatUnit => ({
      ref: { side: 'party', idx: i },
      name: party[i]?.characterName ?? `Party[${i}]`,
      stats: partyAllStats[i],
      pos: partyPosRef.current[i],
    });
    const caster = partyUnit(activePartyIdx);
    let targets: CombatUnit[] = [];

    if (action.target === 'self') {
      // Only fire when the player clicks their own tile
      if (!isAt(activePartyPos)) { clearActiveSlot(); return; }
    } else if (action.target === 'ally') {
      // Fire on any party member tile, in or out of combat
      const allyIdx = partyPositions.findIndex(isAt);
      if (allyIdx < 0) { clearActiveSlot(); return; }
      targets = [partyUnit(allyIdx)];
    } else {
      // Enemy-targeting: only works in combat with a loaded zone, in range and LOS
      if (!combat.active) { clearActiveSlot(); return; }
      if (!zone) return;
      if (chebyshev(activePartyPos, targetPos) > action.range || !hasLineOfSight(activePartyPos, targetPos, zone.floors)) {
        clearActiveSlot();
        return;
      }
      const area = action.area ?? 'single';
      const affected = affectedKeys(activePartyPos, targetPos, area, zone.floors);
      const hit = zoneEnemies.filter(e => e.currentHp > 0 && affected.has(posKey(e.pos)));
      if (area === 'single' && hit.length === 0) { clearActiveSlot(); return; }
      targets = hit.map(e => ({
        ref: { side: 'enemy', id: e.id },
        name: `${e.classData.name} (lv${e.level})`,
        stats: e.stats,
        pos: e.pos,
      }));
    }

    applyActionOutcome(executeAction(caster, action, targets), caster, targetPos);
    clearActiveSlot();
    if (combat.active) setCombat(prev => ({ ...prev, apSpent: prev.apSpent + action.apCost }));
  }, [combat.active, isPlayerTurn, activeAp, activePartyIdx, activeAction, zoneEnemies, activePartyPos, activeMp, partyAllStats, partyPositions, party, zone, applyActionOutcome, spawnFloat]); // eslint-disable-line react-hooks/exhaustive-deps

  // A member's turn ends by itself once it has nothing left to spend (no AP, no paid tiles). One that starts
  // its turn with no AP (stunned) loses it, the same as an enemy (useEnemyTurn). Waits a moment first, and
  // rechecks whenever its AP changes: the top-of-round tick may still be ending a stun.
  const outOfAp = combat.active && isPlayerTurn && (partyHp[activePartyIdx] ?? 0) > 0 && activeAp === 0 && combat.paidTiles === 0;
  const stunned = outOfAp && combat.apSpent === 0;
  useEffect(() => {
    if (!outOfAp) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => {
      if (!stunned) { handleEndTurn(); return; }
      const pos = partyPosRef.current[activePartyIdx];
      const caster: CombatUnit = { ref: { side: 'party', idx: activePartyIdx }, name: party[activePartyIdx]?.characterName ?? '', stats: partyStatsRef.current[activePartyIdx], pos };
      applyActionOutcome(stunnedOutcome(pos), caster);
      timers.push(setTimeout(handleEndTurn, STUNNED_PAUSE_MS));
    }, AUTO_END_TURN_DELAY_MS));
    return () => timers.forEach(clearTimeout);
  }, [outOfAp, stunned, combat.currentTurnIndex, combat.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Enemy AI turn ───────────────────────────────────────────────────────

  const enemyTurnRefs = useMemo(() => ({
    enemies: enemiesRef,
    partyPos: partyPosRef,
    partyStats: partyStatsRef,
    partyHp: partyHpRef,
    partyNames: partyNamesRef,
    partyThreat: partyThreatRef,
    zone: zoneRef,
    currentZone: currentZoneRef,
    zoneObjects: zoneObjectsRef,
    applyOutcome: applyOutcomeRef,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEnemyTurn(
    combat, currentCombatant,
    enemyTurnRefs,
    setEnemies, setCombat, setEnemyAoePreview, setEnemyTargetPartyIdx,
  );

  // ─── Combat end detection ────────────────────────────────────────────────

  useEffect(() => {
    if (!combat.active) return;
    const allAggroedDead = zoneEnemies.filter(e => e.aggroed).every(e => e.currentHp <= 0);
    if (!allAggroedDead) return;
    reviveDowned();
    setCombat(INITIAL_COMBAT);
  }, [combat.active, zoneEnemies]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Render ──────────────────────────────────────────────────────────────

  const activeTarget = activeAction?.target ?? null;
  const isSupportAction = !!activeAction?.effects.some(e => e.type === 'heal' || e.type === 'buff' || e.type === 'hot');

  // ─── HUD state ───────────────────────────────────────────────────────────
  const enemyActing = combat.active && !!currentCombatant && !currentCombatant.isPlayer;
  // The action bar's member: the acting one in combat (none on an enemy's turn), the selected one out of it
  const dockIdx = combat.active ? (isPlayerTurn ? activePartyIdx : null) : barViewIdx;
  const dockSlotContent = dockIdx !== null ? partySlots[dockIdx]?.[partyActiveSlot[dockIdx] ?? -1] ?? null : null;
  const armedName = dockSlotContent === 'weapon-attack' ? (activeWeapon?.name ?? 'Attack') : dockSlotContent?.name;
  const locationName = location === 'sanctum' ? 'The Sanctum' : zone ? `${preset.name} · Zone ${zone.id + 1}` : '';

  return (
    <Backdrop variant="game" className="h-screen">

      {/* The map, full screen: drag with the right mouse button to pan (kept within the area the HUD leaves free) */}
      <div className="absolute inset-0">
        <PanView resetKey={`${location}:${zone?.id ?? ''}`} insets={HUD_INSETS}>
          {location === 'sanctum' && (
            <SanctumMap
              playerPos={playerPos}
              activeMoverPos={playerPos}
              party={partyTokens}
              aims={unitAims}
              moveTargets={moveTargets}
              onMove={handleMove}
              onEnterDungeon={handleLocationChange}
              activeTarget={activeTarget}
              onAbilityUse={handlePlayerAttack}
              onAbilityDeselect={clearActiveSlot}
              onMemberSelect={setBarViewIdx}
            />
          )}
          {location === 'dungeon' && zone && (
            <DungeonMap
              playerPos={playerPos}
              activeMoverPos={combat.active ? activePartyPos : playerPos}
              party={partyTokens}
              aims={unitAims}
              moveTargets={moveTargets}
              moveApCost={moveApCost}
              onMove={handleMove}
              onLocationChange={handleLocationChange}
              onDoorClick={handleDoorClick}
              chests={chests.zoneChests}
              emptiedChests={chests.emptiedChests}
              onOpenChest={chests.openChestWindow}
              activeTarget={activeTarget}
              activeAbilityArea={activeAction?.area}
              areaTone={isSupportAction ? 'help' : 'harm'}
              actionRange={activeAction?.range ?? 0}
              onAbilityUse={handlePlayerAttack}
              onAbilityDeselect={clearActiveSlot}
              onMemberSelect={setBarViewIdx}
              enemies={zoneEnemies}
              inCombat={combat.active}
              isPlayerTurn={isPlayerTurn}
              activeCombatantId={currentCombatant?.id ?? null}
              floatingTexts={floatingTexts}
              onFloatingTextComplete={removeFloat}
              zone={zone}
              portalPos={portalPos}
              partyBuffs={partyBuffs}
              partyHots={partyHots}
              partyDots={partyDots}
              floorColor={preset.floorColor}
              wallColor={preset.wallColor}
              doorObject={preset.doorObject}
              portalObject={preset.portalObject}
              enemyAoePreviewTiles={enemyAoePreview?.tiles}
              enemyTargetPartyIdx={enemyTargetPartyIdx}
              droppedItems={zone?.droppedItems}
              onLootClick={handleLootPickup}
              highlightUnitId={hoveredCombatant}
            />
          )}
        </PanView>
      </div>

      {/* ─── HUD ─── */}

      {/* Where the party is */}
      <div className="absolute top-5 left-6 z-30 rf-label pointer-events-none">{locationName}</div>

      {/* Turn order */}
      {combat.active && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-30" style={{ maxWidth: 'calc(100% - 520px)' }}>
          <TurnOrderStrip
            round={combat.round}
            turnOrder={combat.turnOrder}
            currentTurnIndex={combat.currentTurnIndex}
            enemies={zoneEnemies}
            partyNames={party.map(m => m.characterName)}
            onHover={setHoveredCombatant}
          />
        </div>
      )}

      {/* Menus */}
      <div className="absolute top-5 right-6 z-30 flex gap-2">
        {/* TEMP (testing): gain exactly enough XP for the next level. Dev builds only. */}
        {import.meta.env.DEV && (
          <RiftButton size="sm" onClick={() => addXp(xpToNext(progress.level) - progress.xp)}>Level +1</RiftButton>
        )}
        <RiftButton size="sm" aria-label={anyoneLeveling ? 'Party (I), level up available' : 'Party (I)'} className={anyoneLeveling ? 'is-levelup' : ''} onClick={() => setShowCharSheet(true)}>Party</RiftButton>
      </div>
      {/* The party's XP, under the top buttons */}
      <div className="absolute top-[72px] right-6 z-30">
        <XpStrip progress={progress} gain={xpGain} />
      </div>

      {/* The party */}
      <div className="absolute left-6 bottom-6 z-30">
        <PartyRows
          rows={memberTokens.map((t, i) => ({ token: t, name: party[i].characterName, levelUp: hasPointsToSpend(party[i]) }))}
          selectedIdx={activePartyIdx}
          canSelect={!combat.active}
          onSelect={setBarViewIdx}
        />
      </div>

      {/* An ability is armed: how to use or cancel it */}
      {armedName && (
        <div role="status" className="rf-hud absolute left-1/2 -translate-x-1/2 bottom-[144px] z-30 px-4 py-2 whitespace-nowrap text-xs tracking-[0.04em] text-rift-soft">
          {armedName} — choose a target. Click it again or press Esc to cancel.
        </div>
      )}

      {/* The action bar, or on an enemy's turn, who is acting */}
      {dockIdx !== null && party[dockIdx] && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-30">
          <ActionDock
            member={party[dockIdx]}
            stats={partyAllStats[dockIdx]}
            mp={members[dockIdx]?.mp ?? 0}
            slots={partySlots[dockIdx] ?? []}
            onSlotsChange={slots => setPartySlots(prev => prev.map((s, idx) => idx === dockIdx ? slots : s))}
            armedSlot={partyActiveSlot[dockIdx] ?? null}
            onArmedSlotChange={slot => setPartyActiveSlot(prev => prev.map((s, idx) => idx === dockIdx ? slot : s))}
            inCombat={combat.active}
            canAct={!combat.active || (isPlayerTurn && activeAp > 0)}
            ap={combat.active ? apState(partyAllStats[dockIdx].apMax, members[dockIdx]?.buffs ?? [], dockIdx === activePartyIdx ? activeAp : 0) : null}
            paidTiles={combat.active && dockIdx === activePartyIdx ? combat.paidTiles : 0}
            onEndTurn={combat.active ? handleEndTurn : undefined}
          />
        </div>
      )}
      {enemyActing && currentCombatant && (
        <div role="status" className="rf-hud absolute left-1/2 -translate-x-1/2 bottom-6 z-30 flex items-baseline gap-3.5 px-8 py-5">
          <span className="font-display text-lg tracking-[0.06em] text-rift-ink">{currentCombatant.name}</span>
          <span className="text-xs text-rift-muted">is acting</span>
        </div>
      )}

      {chests.openChest && (
        // On the right, clear of the map's middle (where the chest and the party are)
        <div className="absolute right-6 top-[26%] z-40">
          <ContainerWindow name={gameObjectName(chests.openChest.object)} items={chests.openChestItems} usable={partyCanUse}
            onLoot={chests.lootChest} onClose={chests.closeChest} />
        </div>
      )}

      {showCharSheet && (
        <CharacterSheet
          party={party}
          partyHp={partyHp}
          partyMp={members.map(m => m.mp)}
          partyStats={partyAllStats}
          inventory={inventory}
          onClose={() => setShowCharSheet(false)}
          onEquipItem={equipItem}
          onUnequipItem={unequipItem}
          progress={progress}
          pending={pendingPoints}
          onPendingChange={setMemberPending}
          onConfirmPoints={confirmPoints}
        />
      )}
    </Backdrop>
  );
}

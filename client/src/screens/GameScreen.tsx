// The game: the Sanctum or a dungeon, the party moving and fighting in it, and the HUD. Each concern lives in// its own hook (party member state, inventory, chests, loot, experience, turn ticks, action outcomes, keys, the// Rifter, dialogue and quests, travel between maps, the enemy turn); this screen holds where everyone is and the// fight, wires the hooks together, and draws it all.
import { useState, useEffect, useCallback, useMemo } from 'react';

import { CLASSES } from '../data/units/classes';
import { heldWeapon, type Item } from '../data/gear';
import { mpCostAt, summonsForever } from '../data/combat/abilities';
import { partyCanUseItem } from '../data/gear/inventory';
import { AUTO_END_TURN_DELAY_MS, COMBAT_TEXT_COLOR, STUNNED_PAUSE_MS } from '../data/constants';
import { hasPointsToSpend, isOnMap, type PartyMemberConfig } from '../data/units/party';
import { xpToNext, type PartyProgress } from '../data/units/xp';
import { bodyOf, creatureTiles, isAlly, isForeverSummon, isHostile, type EnemyInstance } from '../data/units/enemies';
import { areaTone } from '../data/combat/areas';
import { aimPartyAction } from '../data/combat/targeting';
import { executeMoveAction, rootBlocks } from '../data/combat/abilityMoves';
import { covers, footprint, footprintKeys, posKey, samePos, type Pos } from '../data/world/grid';
import { partyWalk, marchParty, spreadOut } from '../data/world/movement';
import { SANCTUM, SANCTUM_FLOORS, isSanctumWalkable } from '../data/world/sanctum';
import { npc } from '../data/world/npcs';
import { useQuests } from '../hooks/useQuests';
import QuestTracker from '../components/hud/QuestTracker';
import { interactiveObjectName } from '../data/world/interactiveObjects';
import { isFreeFloor, objectTilesOf, riftShut, zoneRift, zoneWalkable, type DungeonData } from '../data/world/gen';
import { areaLook, DUNGEONS, OPENING_PASSAGE, type AreaKey } from '../data/world/dungeons';
import { ARRIVAL_LINES } from '../data/world/opening';
import { INITIAL_COMBAT, aggroedBy, startCombat, joinCombat, advanceTurn, apLeft, moveBudget, moveCost, stunnedOutcome, getCurrentCombatant, deadPartyIndices, type CombatState } from '../data/combat/combat';
import { isRooted } from '../data/units/stats';
import { creatureUnit, executeAction, memberUnit, toAction, unitKey, type ActionWorld, type CombatUnit } from '../data/combat/abilityExecution';
import { useEnemyTurn, type EnemyActivity, type EnemyAoePreview } from '../hooks/useEnemyTurn';
import { useFloatingText } from '../hooks/useFloatingText';
import { useLatest } from '../hooks/useLatest';
import { useKeyring } from '../hooks/useKeyring';
import { useShards } from '../hooks/useShards';
import { useEnchanter } from '../hooks/useEnchanter';
import RifterWindow from '../components/RifterWindow';
import VendorWindow from '../components/VendorWindow';
import EnchanterWindow from '../components/EnchanterWindow';
import EdgePulse from '../components/hud/EdgePulse';
import { arrivalPortal } from '../components/zoneScenery';
import NpcDialogue, { DIALOGUE_PORTRAIT } from '../components/NpcDialogue';
import Narration from '../components/Narration';
import { KeyPortrait } from '../components/Keyring';
import { RIFTER_READY_START } from '../data/world/rifts';
import { usePartyMembers } from '../hooks/usePartyMembers';
import { useInventory } from '../hooks/useInventory';
import { useVendor } from '../hooks/useVendor';
import { useChests } from '../hooks/useChests';
import { useExperience } from '../hooks/useExperience';
import { useEnemyDeaths } from '../hooks/useEnemyDeaths';
import { usePendingPoints } from '../hooks/usePendingPoints';
import { useGameKeys } from '../hooks/useGameKeys';
import { useAuras } from '../hooks/useAuras';
import { useTurnTicks } from '../hooks/useTurnTicks';
import { useActionOutcomes } from '../hooks/useActionOutcomes';
import { useFogOfWar } from '../hooks/useFogOfWar';
import { useReach } from '../hooks/useReach';
import { useSceneReady } from '../hooks/useSceneReady';
import { useRifter } from '../hooks/useRifter';
import { useDialogue } from '../hooks/useDialogue';
import { useLoot } from '../hooks/useLoot';
import { useTravel } from '../hooks/useTravel';
import { useScenes } from '../hooks/useScenes';
import { useHints } from '../hooks/useHints';
import HintPane from '../components/hud/HintPane';
import { OPENING_FADE_MS } from './OpeningScreen';
import LoadingCover from '../components/ui/LoadingCover';

import CharacterSheet from '../components/CharacterSheet';
import ContainerWindow from '../components/ContainerWindow';
import SanctumMap from '../components/SanctumMap';
import DungeonMap from '../components/DungeonMap';
import PanView, { type Insets } from '../components/PanView';
import { boardLayout } from '../viewEngine/board';
import type { PartyTokenData } from '../components/mapParts';
import Backdrop from '../components/ui/Backdrop';
import RiftButton from '../components/ui/RiftButton';
import DevToolsWindow from '../components/DevToolsWindow'; // TEMP (testing only)
import ActionDock, { type SlotContent } from '../components/hud/ActionDock';
import ActingStatus from '../components/hud/ActingStatus';
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
  /** TEMP (testing only): begin in the Sanctum, the opening skipped, at the quest "Use the Rifter", "Enter the Rift". */
  skipOpening?: boolean;
}

/** Screen space the HUD covers on each side (px): the map pans only within the area inside it. */
const HUD_INSETS: Insets = { top: 84, right: 24, bottom: 164, left: 300 };

export default function GameScreen({ party, setParty, progress, setProgress, skipOpening = false }: Props) {
  // The game begins in a dungeon: the opening's passage, the party arriving there (scene 'arrival', below)
  const [location, setLocation] = useState<'sanctum' | 'dungeon'>(skipOpening ? 'sanctum' : 'dungeon');
  const [playerPos, setPlayerPos] = useState<Pos>(SANCTUM.playerStart);
  const [enemies, setEnemies] = useState<EnemyInstance[]>([]);
  const [combat, setCombat] = useState<CombatState>(INITIAL_COMBAT);
  const { floatingTexts, spawnFloat, announce, removeFloat, clearFloats } = useFloatingText();
  const [showCharSheet, setShowCharSheet] = useState(false);
  const [dungeon, setDungeon] = useState<DungeonData | null>(null);
  // Which dungeon or passage the party is in (or last entered): its preset gives the map's look and doors
  const [dungeonKey, setDungeonKey] = useState<AreaKey>('crypt');
  const preset = areaLook(dungeonKey);
  const [enemyAoePreview, setEnemyAoePreview] = useState<EnemyAoePreview | null>(null);
  // The unit (unitKey) a creature is about to hit, highlighted on the map
  const [enemyTargetKey, setEnemyTargetKey] = useState<string | null>(null);
  // What the acting creature is doing (moving, using an ability): the status box at the bottom says it. `seq`
  // counts activities, so the box can tell a new one from the same (the same ability used again)
  const [enemyActivity, setEnemyActivity] = useState<{ activity: EnemyActivity; seq: number }>({ activity: null, seq: 0 });
  const showEnemyActivity = useCallback((activity: EnemyActivity) => setEnemyActivity(prev => ({ activity, seq: prev.seq + 1 })), []);
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
  const activeWeapon = heldWeapon(party[activePartyIdx].gear);
  const activeMp = members[activePartyIdx]?.mp ?? 0;

  // Active slot / ability for the currently acting member
  const activeSlot = partyActiveSlot[activePartyIdx] ?? null;
  const activeAbility = activeSlot !== null ? (partySlots[activePartyIdx]?.[activeSlot] ?? null) : null;
  const clearActiveSlot = () => setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s));

  // Current zone data
  const zone = dungeon?.zones[currentZone] ?? null;
  // Every creature of the zone: hostile enemies (summoned ones too), and the party's summoned allies (isAlly)
  const zoneEnemies = enemies.filter(e => e.zoneId === currentZone);
  const zoneSummons = zoneEnemies.filter(e => isAlly(e) && e.currentHp > 0);
  // Its forever summons: they march with the party out of combat and join every fight (isForeverSummon)
  const zoneForever = zoneSummons.filter(isForeverSummon);
  const riftPos = dungeon ? zoneRift(dungeon, currentZone) : null;

  // ─── Scenes ──────────────────────────────────────────────────────────────

  // The map stays under a dark cover until its 3D layer has drawn (useSceneReady), after fading to black before a
  // change of map (useFadeOut, below)
  const mapKey = `${location}:${zone?.id ?? ''}`;
  const { loading: mapLoading, onReady: onMapReady } = useSceneReady(mapKey);
  // A moment the party watches (useScenes): the opening's arrival, a found key's words, the greeting at the Sanctum's
  // door. The party can't act until it is over
  const scenes = useScenes({ location, mapLoading, opening: !skipOpening });
  const { scene, locked, arrival, finding, turnBack, faces: facesOnArrival } = scenes;

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
    faces: facesOnArrival ?? undefined,
    fadeIn: scene === 'arrival',
  }));
  // On the map: the living members (isOnMap; the HUD's party rows show everyone); while arriving, those come through yet
  const partyTokens = memberTokens.filter(t => isOnMap(t.hp) && (scene !== 'arrival' || t.partyIndex < arrival.shown));
  // The opening's portals, each on its member's tile (useArrival)
  const portalKey = arrival.portals.map(p => `${p.member}:${p.closing}`).join('|');
  const portalObjects = useMemo(
    () => arrival.portals.map(p => arrivalPortal(`arrival-portal-${p.member}`, partyPositions[p.member], p.closing)),
    [portalKey], // eslint-disable-line react-hooks/exhaustive-deps -- the portals by their key; the party stands still meanwhile
  );

  // Fog of war (dungeons only): what the living members see now, and what the party has seen before. Only
  // known tiles can be walked to, and only enemies in sight are on the map (drawn, targetable).
  // Summoned allies see for the party too (and are always shown)
  const viewers = [...memberTokens.filter(t => t.hp > 0).map(t => t.pos), ...zoneSummons.flatMap(e => footprint(bodyOf(e)))];
  const { fog, resetFog } = useFogOfWar({ location, dungeon, currentZone, viewers });
  // A creature is in sight when any tile of it is (a large one's corner round a wall shows it)
  const seenEnemies = fog ? zoneEnemies.filter(e => isAlly(e) || footprintKeys(bodyOf(e)).some(k => fog.visible.has(k))) : zoneEnemies;

  // The active mover: in combat the acting member, on its AP (moveBudget: tiles already paid for, plus `movement`
  // per AP left); out of combat the leader. Where it can move, and aim a 'tile' ability: useReach
  const activeStats = partyAllStats[activePartyIdx];
  const activeAp = combat.active ? apLeft(activeStats.apMax, combat) : 0;

  // What a move of `steps` costs the active member now (the map shows it on the hovered tile)
  const moveApCost = combat.active
    ? (steps: number) => moveCost(steps, combat.paidTiles, activeStats.movement).apSpent
    : undefined;

  // Selected action, normalised (weapon folded in) — drives map targeting and range
  const activeAction = activeAbility ? toAction(activeAbility, activeWeapon) : null;

  // A movement ability armed (a rooted mover can't use one: rootBlocks): where it can be aimed comes from useReach too
  const moveAbility = activeAction?.move && !rootBlocks(activeAction, partyBuffs[activePartyIdx] ?? []) ? activeAction : null;

  const { moveTargets, tileTargets, moveAims } = useReach({
    zone, dungeon, fog, zoneEnemies, combatActive: combat.active,
    partyTiles: partyTokens.map(t => t.pos),
    mover: combat.active ? activePartyPos : playerPos,
    movement: combat.active ? moveBudget(combat.paidTiles, activeAp, activeStats.movement, isRooted(partyBuffs[activePartyIdx] ?? [])) : partyAllStats[0].movement,
    // (in a fight; out of one, only a forever summon's)
    tileRange: activeAction?.target === 'tile' && !activeAction.move && (combat.active || summonsForever(activeAction)) ? activeAction.range : null,
    moveAbility,
  });

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
  const threatRef = useLatest(combat.threat);
  const partyLevelRef = useLatest(progress.level);
  const dungeonRef = useLatest(dungeon);
  const leaderPosRef = useLatest(playerPos);
  // Tiles of the current zone a map object stands on (the rift, chests): enemies can't walk there either
  const zoneObjectsRef = useLatest(dungeon && zone ? objectTilesOf(dungeon, zone) : new Set<string>());

  // The fight's units as they are now, for executeAction: a unit's HP, buffs and weapon drive its triggers
  /** Party member `i` as a combat unit (where it stands, or at `pos`). */
  const partyUnit = useCallback((i: number, pos: Pos = partyPosRef.current[i]): CombatUnit => {
    const m = partyRef.current[i];
    const weapon = m ? heldWeapon(m.gear) : null;
    return memberUnit(i, m?.characterName, partyStatsRef.current[i], pos,
      { hp: partyHpRef.current[i] ?? 0, buffs: membersRef.current[i]?.buffs ?? [], hots: membersRef.current[i]?.hots, dots: membersRef.current[i]?.dots, weapon });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** What executeAction needs of the fight: what sight passes over on the map, and a living unit by unitKey. */
  const actionWorld = useCallback((): ActionWorld => ({
    sight: zoneRef.current?.sight ?? SANCTUM_FLOORS,
    unitByKey: (key) => {
      const i = partyRef.current.findIndex((_, j) => unitKey({ side: 'party', idx: j }) === key);
      if (i >= 0) return (partyHpRef.current[i] ?? 0) > 0 ? partyUnit(i) : undefined;
      const e = enemiesRef.current.find(c => c.id === key && c.currentHp > 0);
      return e && creatureUnit(e);
    },
  }), [partyUnit]); // eslint-disable-line react-hooks/exhaustive-deps

  // Preload the 3D model layer (three.js, a separate chunk) while the party is still in the sanctum
  useEffect(() => { void import('../components/ModelLayer'); }, []);

  // Sync barViewIdx to active party member during combat
  useEffect(() => {
    if (combat.active) setBarViewIdx(activePartyIdx);
  }, [combat.active, activePartyIdx]);

  // ─── Loot, inventory and chests ──────────────────────────────────────────

  /** Whether someone in the party can use an item (proficient): loot favours it, and windows fade what no one can use. */
  const partyCanUse = useCallback((item: Item) => partyCanUseItem(partyRef.current, item), [partyRef]);

  const { inventory, setInventory, takeLoot, equipItem, unequipItem, swapGearSlots, moveInventoryItem, sortItems, gold, setGold, addGold } = useInventory({ party, setParty, spawnFloat, gearLocked: combat.active });
  // The Sanctum vendor's wares and this visit's trades
  const vendor = useVendor({ partyLevel: progress.level, partyCanUse, inventory, setInventory, gold, setGold });
  const { endVisit, restock: restockVendor } = vendor;
  // The rift keys (shared, apart from the inventory, never lost)
  const keyring = useKeyring(skipOpening ? RIFTER_READY_START.keys : undefined);
  const { addKey } = keyring;
  const { shards, hasNew: hasNewShards, addShard, gainShards, pickUpShards, spendShard, seeShards } = useShards();
  // The Sanctum enchanter's services on the party's items, gold and shards (and the shards sold to her this session)
  const enchanter = useEnchanter({ partyLevel: progress.level, party, setParty, inventory, setInventory, gold, addGold, shards, addShard, gainShards, spendShard });

  // ─── The Rifter, NPCs and quests ─────────────────────────────────────────

  const quests = useQuests(skipOpening ? RIFTER_READY_START.quests : undefined);
  // The Sanctum's Rifter: the key set in it, its rift, and its window
  const { rifter, showRifter, setShowRifter, openRift, reset: resetRifter, usable: rifterUsable, mark: rifterMark } = useRifter({ location, playerPos, questLog: quests.log });
  // TEMP (testing only): the testing tools' window (components/DevToolsWindow.tsx)
  const [showTesting, setShowTesting] = useState(false);
  // The new player's hints (data/world/hints.ts): the party window's comes up as the game begins, and goes once it is opened
  const hints = useHints();
  const hintDone = hints.done;
  useEffect(() => { if (showCharSheet) hintDone('party'); }, [showCharSheet, hintDone]);
  // Talking to the Sanctum's NPCs, and what dialogue and the party's deeds do to its quests
  const { talkingTo, talkTo, endTalk, npcAims, speaking, runDialogueEffects, finishTopic, finishConversation, questDid, questMarks } = useDialogue({
    quests, scenes, location, playerPos, otherWindowOpen: showCharSheet || showRifter || showTesting, announce, addKey, endVisit,
  });

  // What lies on a dungeon's floor: enemies' drops, picking them up, and a passage's found key
  const { takeGold, takeShards, foundKey, keyMark, finishFinding, pickUp: handleLootPickup, pickUpRef: lootPickupRef, dropLoot } = useLoot({
    location, dungeonKey, dungeon, setDungeon, currentZone, partyLevel: progress.level, questLog: quests.log, scenes,
    runDialogueEffects, questDid, partyCanUse, keys: keyring.keys, addKey,
    takeLoot, addGold, pickUpShards, restockVendor, spawnFloat, announce,
  });
  const chests = useChests({ location, dungeon, currentZone, combatActive: combat.active, playerPos, partyLevel: progress.level, partyCanUse, takeLoot, takeGold, takeShards });

  // ─── Actions, ticks, experience, keys ────────────────────────────────────

  /** Put party member `idx` on `pos` at once, in a fight (a step, or where a movement ability lands it): the leader picks up what lies there. */
  const placeMember = useCallback((idx: number, pos: Pos) => {
    if (idx === 0) {
      setPlayerPos(pos);
      lootPickupRef.current(pos);
    } else {
      setFollowerPositions(prev => prev.map((p, i) => (i === idx - 1 ? pos : p)));
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- setters and a ref
  const { unitAims, unitMoves, unitFx, applyActionOutcome, applyOutcomeRef, cancelPendingOutcomes } = useActionOutcomes({
    spawnFloat, updateMembers, placeMember, partyStatsRef, partyPosRef, partyLevelRef, enemiesRef, dungeonRef, currentZoneRef, setEnemies, setCombat,
  });
  // Who is inside whose aura, kept in step with where everyone stands (before the ticks, which read what it puts on units)
  useAuras({ members, partyPositions, partyStats: partyAllStats, currentZone, enemies, updateMembers, setEnemies });
  useTurnTicks({
    combatActive: combat.active, round: combat.round, currentCombatant, membersRef, updateMembers, partyStatsRef, partyPosRef,
    enemiesRef, currentZoneRef, setEnemies, setCombat, spawnFloat,
  });
  const { xpGain, levelUps, addXp, awardKills } = useExperience({ progress, setProgress, party, setParty, spawnFloat, leaderPosRef });
  // Every enemy that dies, however (a hit, a DoT tick), gives its XP and drops its loot, once
  const resetDeaths = useEnemyDeaths(enemies, (dead) => { awardKills(dead); dropLoot(dead); });
  const { pendingPoints, setMemberPending, confirmPoints, anyoneLeveling } = usePendingPoints(party, setParty);

  useGameKeys({
    // With the vendor's window open, I closes it and opens the party window instead
    toggleSheet: () => {
      if (locked || showRifter) return;
      if (talkingTo) { endTalk(); setShowCharSheet(true); return; }
      setShowCharSheet(prev => !prev);
    },
    escape: () => {
      if (locked) return;
      if (showTesting) { setShowTesting(false); return; } // TEMP (testing only)
      if (showRifter) { setShowRifter(false); return; }
      if (talkingTo) { endTalk(); return; }
      if (showCharSheet) { setShowCharSheet(false); return; }
      if (chests.openChest) { chests.closeChest(); return; }
      if (activeSlot !== null) clearActiveSlot();
    },
    // Out of combat, with no window open: the next party member in order (wrapping round), as a click on their panel
    cycleMember: (back) => {
      if (locked || combat.active || showCharSheet || showRifter || talkingTo || chests.openChest || showTesting) return false;
      const n = party.length;
      setBarViewIdx(i => (i + (back ? n - 1 : 1)) % n);
      return true;
    },
  });

  // ─── Aggro detection ─────────────────────────────────────────────────────

  // How many fights have begun (each one plays the dark red pulse around the screen's edge: EdgePulse)
  const [combatStarts, setCombatStarts] = useState(0);
  /**
   * Aggro every unaggroed group with a member visible from `pos`, then start combat with them
   * (or add them to the combat already running).
   */
  const triggerAggro = useCallback((pos: Pos, zoneEnemyList: EnemyInstance[], sight: ReadonlySet<string>, inCombat: boolean): boolean => {
    const newlyAggroed = aggroedBy(pos, zoneEnemyList, sight);
    if (newlyAggroed.length === 0) return false;
    const aggroIds = new Set(newlyAggroed.map(e => e.id));
    setEnemies(prev => prev.map(e => aggroIds.has(e.id) ? { ...e, aggroed: true } : e));
    if (!inCombat) setCombatStarts(n => n + 1);
    // A new fight: the party's forever summons there roll initiative with everyone (in one already, they are in it)
    const forever = zoneEnemyList.filter(e => isForeverSummon(e) && e.currentHp > 0);
    setCombat(prev => inCombat
      ? joinCombat(prev, newlyAggroed)
      : startCombat(party.map((m, i) => ({ stats: partyStatsRef.current[i], name: m.characterName })), [...newlyAggroed, ...forever]));
    return true;
  }, [party, partyStatsRef]);

  // ─── Location transitions ──────────────────────────────────────────────

  // Into a dungeon or back to the Sanctum, through a door to another zone, a party wipe: each fades the map to black first
  const { changeLocation, travel, goThroughDoor, wipeToSanctum, fading, fadeMs } = useTravel({
    partyLevel: progress.level, questLog: quests.log, questDid, foundKey,
    zone, dungeon, currentZone, enemies, combatActive: combat.active,
    setLocation, setDungeonKey, setDungeon, setCurrentZone, setPlayerPos, setFollowerPositions, setEnemies,
    leaveMap: () => {
      cancelPendingOutcomes();
      reviveDowned();
      setCombat(INITIAL_COMBAT);
      clearFloats();
      clearEffects();
      resetDeaths(); // enemy ids repeat between dungeons
      chests.resetChests(); // so do chest ids: a new dungeon's chests start full
      resetFog(); // and it starts unseen
    },
    scenes, resetRifter, triggerAggro, clearFloats, restoreAll,
  });

  // The game begins with the opening: the party arriving in its passage (scene 'arrival')
  // (TEMP, skipOpening: the party begins in the Sanctum in front of the Rifter, its first hint up as the narration would)
  useEffect(() => {
    if (skipOpening) { changeLocation('sanctum'); hints.trigger('gameStart'); } else changeLocation(OPENING_PASSAGE);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on mount

  // ─── Death checks ────────────────────────────────────────────────────────

  /**
   * Bring fallen members back (reviveDowned: 10% HP), each on a tile of its own: one that was stood on while it
   * was down (it was off the map) steps aside to the nearest free tile, the living keeping theirs.
   */
  const reviveParty = () => {
    const down = partyHp.flatMap((hp, i) => (hp <= 0 ? [i] : []));
    if (down.length > 0) {
      const order = [...partyHp.flatMap((hp, i) => (hp > 0 ? [i] : [])), ...down];
      const isOpen = zone && dungeon ? isFreeFloor(dungeon, zone, enemies) : isSanctumWalkable;
      const spread = spreadOut(partyPositions, order, isOpen);
      if (!samePos(spread[0], playerPos)) setPlayerPos(spread[0]);
      if (spread.slice(1).some((p, i) => !samePos(p, followerPositions[i]))) setFollowerPositions(prev => prev.map((p, i) => spread[i + 1] ?? p));
    }
    reviveDowned();
  };

  useEffect(() => {
    // A party wipe: everyone wakes in the Sanctum at full HP and MP, once the map has faded to black
    if (partyHp.every(hp => hp <= 0)) {
      wipeToSanctum();
      return;
    }
    // Out of combat: revive any individual dead members to 10%
    if (!combat.active && partyHp.some(hp => hp <= 0)) reviveParty();
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


  // ─── Movement handler ────────────────────────────────────────────────────

  /** Move the active member to `newPos`. True if it moved and no fight began (a click that walks to an object then uses it). */
  const handleMove = useCallback((newPos: Pos): boolean => {
    const steps = moveTargets.get(posKey(newPos));
    if (steps === undefined) return false; // not reachable this turn (walls, enemies or too far)
    if (combat.active) {
      if (!isPlayerTurn) return false;

      placeMember(activePartyIdx, newPos);

      // Walks the tiles already paid for first, then pays 1 AP per `movement` tiles more
      const movement = activeStats.movement;
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
      lootPickupRef.current(newPos);
    }

    return !(zone && triggerAggro(newPos, zoneEnemies, zone.sight, combat.active));
  }, [combat.active, moveTargets, isPlayerTurn, activePartyIdx, activeStats.movement, playerPos, zoneEnemies, zoneForever, zone, dungeon, triggerAggro]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!action || activeMp < mpCostAt(action, progress.level)) return;
    // A summoned creature only lasts the fight: no summoning out of combat; movement abilities are for fights too.
    // A forever summon outlasts fights, so it can be called up out of one, but only in a dungeon (it stays there)
    const summons = action.effects.some(e => e.type === 'summon');
    const forever = summons && summonsForever(action);
    const refusal = combat.active ? null
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
  }, [combat.active, isPlayerTurn, activeAp, activePartyIdx, activeAction, zoneEnemies, activePartyPos, activeMp, partyAllStats, partyPositions, partyHp, partyBuffs, party, zone, zoneSummons, location, tileTargets, moveAims, triggerAggro, applyActionOutcome, spawnFloat, progress.level]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ─── Enemy AI turn ───────────────────────────────────────────────────────

  const enemyTurnRefs = useMemo(() => ({
    enemies: enemiesRef,
    partyPos: partyPosRef,
    partyStats: partyStatsRef,
    partyHp: partyHpRef,
    threat: threatRef,
    zone: zoneRef,
    currentZone: currentZoneRef,
    zoneObjects: zoneObjectsRef,
    applyOutcome: applyOutcomeRef,
    partyUnit,
    actionWorld,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEnemyTurn(
    combat, currentCombatant,
    enemyTurnRefs,
    setEnemies, setCombat, setEnemyAoePreview, setEnemyTargetKey, showEnemyActivity,
  );

  // ─── Combat end detection ────────────────────────────────────────────────

  // Every enemy in the fight is dead (summoned ones too): it's over, and every summoned creature vanishes with it,
  // but the party's living forever summons (they stay until slain, or until the party leaves the dungeon)
  useEffect(() => {
    if (!combat.active) return;
    const allAggroedDead = zoneEnemies.filter(e => e.aggroed && isHostile(e)).every(e => e.currentHp <= 0);
    if (!allAggroedDead) return;
    reviveParty();
    setCombat(INITIAL_COMBAT);
    setEnemies(prev => prev.filter(e => !e.summon || (isForeverSummon(e) && e.currentHp > 0)));
  }, [combat.active, zoneEnemies]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Map view ────────────────────────────────────────────────────────────
  // Entering a dungeon zone (by a rift or a door), or the Sanctum by its door (away from its middle, where the view
  // otherwise starts), the view centers on the party (the leader, at about its middle)
  const zoneBoard = useMemo(() => (zone ? boardLayout(zone.width, zone.height) : null), [zone?.width, zone?.height]); // eslint-disable-line react-hooks/exhaustive-deps -- zone tracked by its size
  const sanctumBoard = useMemo(() => boardLayout(SANCTUM.width, SANCTUM.height), []);
  const focusBoard = location === 'dungeon' ? zoneBoard : facesOnArrival ? sanctumBoard : null;
  const viewFocus = focusBoard ? focusBoard.toScreen(playerPos.x + 0.5, playerPos.y + 0.5, 0.5) : undefined;

  // ─── Render ──────────────────────────────────────────────────────────────

  const activeTarget = activeAction?.target ?? null;

  // ─── HUD state ───────────────────────────────────────────────────────────
  // A creature the AI runs (an enemy or a summoned ally) is taking its turn
  const aiActing = combat.active && !!currentCombatant && !currentCombatant.isPlayer;
  // The action bar's member: the acting one in combat (none on an enemy's turn), the selected one out of it
  const dockIdx = combat.active ? (isPlayerTurn ? activePartyIdx : null) : barViewIdx;
  const dockSlotContent = dockIdx !== null ? partySlots[dockIdx]?.[partyActiveSlot[dockIdx] ?? -1] ?? null : null;
  const armedName = dockSlotContent === 'weapon-attack' ? (activeWeapon?.name ?? 'Attack') : dockSlotContent?.name;
  const locationName = location === 'sanctum' ? 'The Sanctum' : zone && dungeon ? (dungeon.zones.length > 1 ? `${preset.name} · Zone ${zone.id + 1}` : preset.name) : '';

  return (
    <Backdrop variant="game" className="h-screen">

      {/* The map, full screen: drag with the right mouse button to pan (kept within the area the HUD leaves free) */}
      <div className={`absolute inset-0 ${locked ? 'pointer-events-none' : ''}`}>
        <PanView resetKey={mapKey} insets={HUD_INSETS} focus={viewFocus}>
          {location === 'sanctum' && (
            <SanctumMap
              playerPos={playerPos}
              activeMoverPos={playerPos}
              party={partyTokens}
              aims={unitAims}
              fx={unitFx}
              floatingTexts={floatingTexts}
              onFloatingTextComplete={removeFloat}
              moveTargets={moveTargets}
              onMove={handleMove}
              rifter={rifter}
              onUseRifter={() => setShowRifter(true)}
              onTalkTo={talkTo}
              npcAims={npcAims}
              speaking={speaking}
              onTopicDone={finishTopic}
              onEndTalk={finishConversation}
              quests={quests.log}
              questMarks={questMarks}
              rifterUsable={rifterUsable}
              rifterMark={rifterMark}
              onEnterRift={travel}
              activeTarget={activeTarget}
              onAbilityUse={handlePlayerAttack}
              onAbilityDeselect={clearActiveSlot}
              onMemberSelect={setBarViewIdx}
              onReady={onMapReady}
            />
          )}
          {location === 'dungeon' && zone && (
            <DungeonMap
              playerPos={playerPos}
              activeMoverPos={combat.active ? activePartyPos : playerPos}
              party={partyTokens}
              aims={unitAims}
              moves={unitMoves}
              fx={unitFx}
              moveTargets={moveTargets}
              moveApCost={moveApCost}
              onMove={handleMove}
              onLocationChange={travel}
              onDoorClick={goThroughDoor}
              chests={chests.zoneChests}
              emptiedChests={chests.emptiedChests}
              onOpenChest={chests.openChestWindow}
              activeTarget={activeTarget}
              activeAbilityArea={activeAction?.area}
              areaTone={activeAction ? areaTone(activeAction) : 'harm'}
              actionRange={activeAction?.range ?? 0}
              onAbilityUse={handlePlayerAttack}
              onAbilityDeselect={clearActiveSlot}
              onMemberSelect={setBarViewIdx}
              enemies={seenEnemies}
              fog={fog}
              inCombat={combat.active}
              isPlayerTurn={isPlayerTurn}
              activeCombatantId={currentCombatant?.id ?? null}
              floatingTexts={floatingTexts}
              onFloatingTextComplete={removeFloat}
              zone={zone}
              riftPos={riftPos}
              riftShut={dungeon ? riftShut(dungeon, currentZone, enemies) : false}
              partyBuffs={partyBuffs}
              partyHots={partyHots}
              partyDots={partyDots}
              terrain={preset.terrain}
              clutter={preset.clutter}
              doorObject={preset.doorObject}
              enemyAoePreview={enemyAoePreview}
              enemyTargetKey={enemyTargetKey}
              tileTargets={tileTargets}
              activeMove={!!activeAction?.move}
              moveAims={moveAims}
              droppedItems={zone?.droppedItems}
              droppedKeys={zone?.droppedKeys}
              keyMark={keyMark}
              foundKey={foundKey}
              sceneObjects={portalObjects}
              dialogue={(finding || turnBack) && foundKey ? {
                at: (finding ?? turnBack)!,
                content: <NpcDialogue portrait={<KeyPortrait color={DUNGEONS[foundKey.key].riftColor} size={DIALOGUE_PORTRAIT} />} name={foundKey.name}
                  conversation={finding ? foundKey.conversation : foundKey.leaving} quests={quests.log} onTopicDone={() => {}}
                  onEnd={finding ? finishFinding : scenes.endTurnBack} />,
              } : null}
              droppedGold={zone?.droppedGold}
              droppedShards={zone?.droppedShards}
              onLootClick={handleLootPickup}
              highlightUnitId={hoveredCombatant}
              onReady={onMapReady}
            />
          )}
        </PanView>
      </div>
      {/* The map's cover while its 3D layer starts (under the HUD): fading in before a change of map, fading out
          when the new one is ready */}
      <LoadingCover loading={mapLoading || fading} fadeIn={fading} fadeMs={scene === 'arrival' ? OPENING_FADE_MS : fadeMs} className="absolute inset-0 z-20" />

      {/* The arrival told over the dimmed map, once the party has come through; then the game begins */}
      {scene === 'arrival' && arrival.telling && (
        <div className="rf-narration-dim absolute inset-0 z-40 flex items-center justify-center">
          <Narration lines={ARRIVAL_LINES} onDone={() => { scenes.end(); hints.trigger('gameStart'); }} />
        </div>
      )}

      {/* ─── HUD ─── (none while the party arrives; not usable while it watches a scene) */}
      {scene !== 'arrival' && <div className={`contents ${locked ? '[&_*]:pointer-events-none' : ''}`}>

      {/* Where the party is, and its active quests under it */}
      <div className="absolute top-5 left-6 z-30 flex flex-col gap-12 pointer-events-none">
        <div className="rf-label">{locationName}</div>
        <QuestTracker log={quests.log} />
      </div>

      {/* Pulses around the screen's edge: a level-up's (yellow), and combat beginning (dark red). Each new key plays one */}
      {levelUps > 0 && <EdgePulse key={`level-${levelUps}`} kind="levelUp" />}
      {combatStarts > 0 && <EdgePulse key={`combat-${combatStarts}`} kind="combat" />}

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
        {/* TEMP (testing only): the testing tools' window (components/DevToolsWindow.tsx). Dev builds only. */}
        {import.meta.env.DEV && <RiftButton size="sm" onClick={() => setShowTesting(true)}>Testing</RiftButton>}
        <RiftButton size="sm" aria-label={anyoneLeveling ? 'Party (I), level up available' : 'Party (I)'} className={`${anyoneLeveling ? 'is-levelup' : ''} ${hints.current?.target === 'party' ? 'is-hinted' : ''}`} onClick={() => setShowCharSheet(true)}>
          Party<kbd aria-hidden="true" className="rf-keycap">I</kbd>
        </RiftButton>
      </div>
      {/* The party's XP, under the top buttons */}
      <div className="absolute top-[72px] right-6 z-30">
        <XpStrip progress={progress} gain={xpGain} />
      </div>
      {/* A new player's hint, under what it points at (the Party button) */}
      {hints.current && (
        <div className="absolute top-[104px] right-6 z-30">
          <HintPane hint={hints.current} onDismiss={() => hints.dismiss(hints.current!.id)} />
        </div>
      )}

      {/* The party */}
      <div className="absolute left-6 bottom-6 z-30">
        <PartyRows
          rows={memberTokens.map((t, i) => ({ token: t, name: party[i].characterName, levelUp: hasPointsToSpend(party[i]) }))}
          level={progress.level}
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
            buffs={partyBuffs[dockIdx] ?? []}
            slots={partySlots[dockIdx] ?? []}
            onSlotsChange={slots => setPartySlots(prev => prev.map((s, idx) => idx === dockIdx ? slots : s))}
            armedSlot={partyActiveSlot[dockIdx] ?? null}
            onArmedSlotChange={slot => setPartyActiveSlot(prev => prev.map((s, idx) => idx === dockIdx ? slot : s))}
            inCombat={combat.active}
            canAct={!combat.active || (isPlayerTurn && activeAp > 0)}
            ap={combat.active ? apState(partyAllStats[dockIdx].apMax, members[dockIdx]?.buffs ?? [], dockIdx === activePartyIdx ? activeAp : 0) : null}
            paidTiles={combat.active && dockIdx === activePartyIdx ? combat.paidTiles : 0}
            onEndTurn={combat.active ? handleEndTurn : undefined}
            keysEnabled={!locked && !showCharSheet && !showRifter && !talkingTo && !showTesting}
          />
        </div>
      )}
      {aiActing && currentCombatant && (
        <div className="absolute left-1/2 -translate-x-1/2 bottom-6 z-30">
          <ActingStatus name={currentCombatant.name} activity={enemyActivity.activity} seq={enemyActivity.seq} />
        </div>
      )}
      </div>}

      {chests.openChest && (
        // On the right, clear of the map's middle (where the chest and the party are)
        <div className="absolute right-6 top-[26%] z-40">
          <ContainerWindow name={interactiveObjectName(chests.openChest.object)} items={chests.openChestContents.items} gold={chests.openChestContents.gold} shards={chests.openChestContents.shards} usable={partyCanUse}
            onLoot={chests.lootChest} onLootGold={chests.lootChestGold} onLootShards={chests.lootChestShards} onClose={chests.closeChest} />
        </div>
      )}

      {talkingTo && npc(talkingTo.id).service === 'vendor' && (
        <VendorWindow vendor={npc(talkingTo.id)} party={party} partyStats={partyAllStats} state={vendor.state}
          onTradeShelf={vendor.tradeShelf} onTradeParty={vendor.tradeParty} onClose={endTalk} />
      )}
      {/* TEMP (testing only): the testing tools (components/DevToolsWindow.tsx). Dev builds only. */}
      {import.meta.env.DEV && showTesting && (
        <DevToolsWindow keys={keyring.keys} onAddKey={keyring.addKey} onEnterPassage={(k) => { setShowTesting(false); travel(k); }} onAddShard={addShard} onAddGold={addGold}
          onLevelUp={() => addXp(xpToNext(progress.level) - progress.xp)} onClose={() => setShowTesting(false)} />
      )}
      {talkingTo && npc(talkingTo.id).service === 'enchanting' && (
        <EnchanterWindow enchanter={enchanter} npc={npc(talkingTo.id)} party={party} inventory={inventory} gold={gold} shards={shards}
          canUse={partyCanUse} onClose={endTalk} />
      )}

      {showRifter && (
        // The Rifter: pick a key, open its rift (the window closes so the device is seen waking, or swapping rifts)
        <RifterWindow keys={keyring.keys} inserted={rifter.key} open={!!rifter.rift}
          onOpenRift={openRift}
          onClose={() => setShowRifter(false)} />
      )}

      {showCharSheet && (
        <CharacterSheet
          party={party}
          partyHp={partyHp}
          partyMp={members.map(m => m.mp)}
          partyStats={partyAllStats}
          partyBuffs={partyBuffs}
          inventory={inventory}
          gold={gold}
          shards={shards}
          keys={keyring.keys}
          hasNewKey={keyring.hasNew}
          onSeeKeys={keyring.seeKeys}
          hasNewShards={hasNewShards}
          onSeeShards={seeShards}
          onClose={() => setShowCharSheet(false)}
          // In combat gear can't be changed (useInventory gearLocked): the window offers no equipping, unequipping or swapping
          gearLocked={combat.active}
          onEquipItem={combat.active ? undefined : equipItem}
          onUnequipItem={combat.active ? undefined : unequipItem}
          onMoveItem={moveInventoryItem}
          onSortItems={sortItems}
          onSwapGear={combat.active ? undefined : swapGearSlots}
          progress={progress}
          pending={pendingPoints}
          onPendingChange={setMemberPending}
          onConfirmPoints={confirmPoints}
        />
      )}
    </Backdrop>
  );
}

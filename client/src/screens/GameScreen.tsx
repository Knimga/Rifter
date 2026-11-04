// The game: the Sanctum or a dungeon, the party moving and fighting in it, and the HUD. Each concern lives in
// its own hook (party member state, inventory, chests, experience, turn ticks, action outcomes, keys, the
// enemy turn); this screen holds where everyone is and the fight, wires the hooks together, and draws it all.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { CLASSES } from '../data/units/classes';
import { generateLootDrops, heldWeapon, type Item } from '../data/gear';
import { rollGold } from '../data/gear/loot';
import { mpCostAt } from '../data/combat/abilities';
import { mergeShards, rollShardDrop, SHARD_DROP_CHANCE, totalShards, type ShardCounts } from '../data/gear/shards';
import { formatGold } from '../data/detailStrings';
import { partyCanUseItem } from '../data/gear/inventory';
import { AUTO_END_TURN_DELAY_MS, COMBAT_TEXT_COLOR, STUNNED_PAUSE_MS } from '../data/constants';
import { hasPointsToSpend, isOnMap, type PartyMemberConfig } from '../data/units/party';
import { xpToNext, type PartyProgress } from '../data/units/xp';
import { bodyOf, creatureTiles, isAlly, isHostile, type EnemyInstance } from '../data/units/enemies';
import { isBoss } from '../data/units/bosses';
import { areaTone } from '../data/combat/areas';
import { aimPartyAction } from '../data/combat/targeting';
import { covers, findOpenTilesNear, footprint, footprintKeys, isAdjacent, posKey, samePos, type Pos } from '../data/world/grid';
import { partyWalk, findFollowerSpawns, spreadOut, trailFollowers } from '../data/world/movement';
import { SANCTUM, SANCTUM_FLOORS, SANCTUM_RECEPTACLE, isSanctumWalkable, type NpcPlacement } from '../data/world/sanctum';
import { npc } from '../data/world/npcs';
import { conversationOf, effectsMark, npcQuestMark, type Conversation, type DialogueEffect, type DialogueTopic, type QuestMark } from '../data/world/dialogue';
import { currentStep, quest, questHolds, questsFinishedBy, stepIndex, type QuestEvent } from '../data/world/quests';
import { useQuests } from '../hooks/useQuests';
import QuestTracker from '../components/hud/QuestTracker';
import { interactiveObjectName } from '../data/world/interactiveObjects';
import { isFreeFloor, objectTilesOf, zoneRift, zoneWalkable, type DungeonData, type ZoneData } from '../data/world/dungeonGen';
import { areaLook, buildArea, DUNGEONS, foundKeyIn, isPassage, OPENING_PASSAGE, type AreaKey, type DungeonKey } from '../data/world/dungeons';
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
import type { UnitAim } from '../components/ModelLayer';
import { arrivalPortal } from '../components/zoneScenery';
import NpcDialogue, { DIALOGUE_PORTRAIT } from '../components/NpcDialogue';
import Narration from '../components/Narration';
import { KeyPortrait } from '../components/Keyring';
import { DORMANT_RIFTER, type RifterState } from '../components/sanctumScene';
import { RIFT_CLOSE_MS } from '../forge/designs/_rifter';
import { RIFTER_UNLOCK, bossKeyDrop, riftGlowCss } from '../data/world/rifts';
import { usePartyMembers } from '../hooks/usePartyMembers';
import { useInventory } from '../hooks/useInventory';
import { useVendor } from '../hooks/useVendor';
import { useChests } from '../hooks/useChests';
import { useExperience } from '../hooks/useExperience';
import { useEnemyDeaths } from '../hooks/useEnemyDeaths';
import { usePendingPoints } from '../hooks/usePendingPoints';
import { useGameKeys } from '../hooks/useGameKeys';
import { useTurnTicks } from '../hooks/useTurnTicks';
import { useActionOutcomes } from '../hooks/useActionOutcomes';
import { useFogOfWar } from '../hooks/useFogOfWar';
import { useReach } from '../hooks/useReach';
import { useSceneReady } from '../hooks/useSceneReady';
import { useFadeOut } from '../hooks/useFadeOut';
import { useArrival } from '../hooks/useArrival';
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
}

/** How long the party stands in the Sanctum, come through its door, before its greeter speaks (ms). */
const GREETING_PAUSE_MS = 1200;

/** Screen space the HUD covers on each side (px): the map pans only within the area inside it. */
const HUD_INSETS: Insets = { top: 84, right: 24, bottom: 164, left: 300 };

export default function GameScreen({ party, setParty, progress, setProgress }: Props) {
  // The game begins in a dungeon: the opening's passage, the party arriving there (scene 'arrival', below)
  const [location, setLocation] = useState<'sanctum' | 'dungeon'>('dungeon');
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
  const riftPos = dungeon ? zoneRift(dungeon, currentZone) : null;

  // ─── Scenes ──────────────────────────────────────────────────────────────
  // A moment the party watches: the opening's arrival in the Dark Tunnel (useArrival), a found key's words (finding:
  // PassageConfig.foundKey; and at the passage's door while it still lies there: turnBack), the greeting at the Sanctum's door (its greeter speaks at once: SANCTUM.doorGreeter). The
  // party can't act (move, use abilities or items, open windows) until it is over; its dialogue is still clicked through
  const [scene, setScene] = useState<'arrival' | 'finding' | 'greeting' | null>('arrival');
  const locked = scene !== null;
  // The tile the party faces as it appears on a map (its greeter, through the Sanctum's door), if any
  const [facesOnArrival, setFacesOnArrival] = useState<Pos | null>(null);

  // The map stays under a dark cover until its 3D layer has drawn (useSceneReady), after fading to black before a
  // change of map (useFadeOut, below)
  const mapKey = `${location}:${zone?.id ?? ''}`;
  const { loading: mapLoading, onReady: onMapReady } = useSceneReady(mapKey);
  // The opening's arrival plays once the Dark Tunnel is shown: the party coming through its portals, then told
  const arrival = useArrival(scene === 'arrival' && !mapLoading);

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

  const { moveTargets, tileTargets } = useReach({
    zone, dungeon, fog, zoneEnemies, combatActive: combat.active,
    partyTiles: partyTokens.map(t => t.pos),
    mover: combat.active ? activePartyPos : playerPos,
    movement: combat.active ? moveBudget(combat.paidTiles, activeAp, activeStats.movement, isRooted(partyBuffs[activePartyIdx] ?? [])) : partyAllStats[0].movement,
    tileRange: activeAction?.target === 'tile' ? activeAction.range : null,
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
      { hp: partyHpRef.current[i] ?? 0, buffs: membersRef.current[i]?.buffs ?? [], weapon, passiveTriggers: m && CLASSES[m.selectedClass].passiveTriggers });
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

  const { inventory, setInventory, takeLoot, equipItem, unequipItem, swapGearSlots, moveInventoryItem, gold, setGold, addGold } = useInventory({ party, setParty, spawnFloat });
  /** Gold picked up at a tile (off the floor, out of a chest): into the party's gold, and its amount floats up with the coin. */
  const takeGold = useCallback((amount: number, at: Pos) => {
    addGold(amount);
    spawnFloat(at.x, at.y, `+${formatGold(amount)}`, COMBAT_TEXT_COLOR.gold, 'gold');
  }, [addGold, spawnFloat]);
  // The Sanctum vendor's wares and this visit's trades
  const vendor = useVendor({ partyLevel: progress.level, partyCanUse, inventory, setInventory, gold, setGold });
  const { endVisit, restock: restockVendor } = vendor;
  // The rift keys (shared, apart from the inventory, never lost)
  const keyring = useKeyring();
  const { shards, hasNew: hasNewShards, addShard, gainShards, pickUpShards, spendShard, seeShards } = useShards();
  /** Shards picked up at a tile (off the floor, out of a chest): into the party's shards, and how many floats up. */
  const takeShards = useCallback((found: ShardCounts, at: Pos) => {
    pickUpShards(found);
    const n = totalShards(found);
    spawnFloat(at.x, at.y, `+${n} ${n === 1 ? 'Shard' : 'Shards'}`, COMBAT_TEXT_COLOR.loot);
  }, [pickUpShards, spawnFloat]);
  // The Sanctum enchanter's services on the party's items, gold and shards (and the shards sold to her this session)
  const enchanter = useEnchanter({ partyLevel: progress.level, inventory, setInventory, gold, addGold, shards, addShard, gainShards, spendShard });
  const { addKey } = keyring;
  // The Sanctum's Rifter: the key set in it and whether its rift is open (dormant whenever the party arrives),
  // and its window, open while the leader stands by its receptacle
  const [rifter, setRifter] = useState<RifterState>(DORMANT_RIFTER);
  const reopenTimer = useRef<number | undefined>(undefined);
  /**
   * Open `key`'s rift (the window closes, so the device is seen). Dormant: it wakes. Awake with another key's rift:
   * the new key goes in the socket at once, the old rift closes, then (RIFT_CLOSE_MS later) the new one opens.
   */
  const openRift = (key: DungeonKey) => {
    setShowRifter(false);
    if (!rifter.rift) { setRifter({ key, rift: key, phase: 'activate' }); return; }
    if (key === rifter.key) return;
    window.clearTimeout(reopenTimer.current);
    // Mid-swap already: the rift still closing (or showing) stays the one that closes
    setRifter({ key, rift: rifter.rift, phase: 'close' });
    reopenTimer.current = window.setTimeout(() => setRifter((r) => (r.phase === 'close' ? { ...r, rift: r.key, phase: 'reopen' } : r)), RIFT_CLOSE_MS);
  };
  useEffect(() => () => window.clearTimeout(reopenTimer.current), []);
  // TEMP (testing only): the testing tools' window (components/DevToolsWindow.tsx)
  const [showTesting, setShowTesting] = useState(false);
  const [showRifter, setShowRifter] = useState(false);
  useEffect(() => {
    if (showRifter && (location !== 'sanctum' || !isAdjacent(playerPos, SANCTUM_RECEPTACLE))) setShowRifter(false);
  }, [showRifter, location, playerPos]);

  // The Sanctum's NPCs: the one the leader is speaking to (its window open), and where each faces. It turns to the
  // leader when spoken to, and back to its own way (the tile in front of it) when the talk ends
  const [talkingTo, setTalkingTo] = useState<NpcPlacement | null>(null);
  // Each talk's number: a new talk with a speaking NPC starts its conversation over
  const [talkCount, setTalkCount] = useState(0);
  // The conversation a speaking NPC speaks this talk: the one that held as the talk began (it stays the same while
  // the talk changes the party's quests)
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const quests = useQuests();
  // The new player's hints (data/world/hints.ts): the party window's comes up as the game begins, and goes once it is opened
  const hints = useHints();
  const hintDone = hints.done;
  useEffect(() => { if (showCharSheet) hintDone('party'); }, [showCharSheet, hintDone]);
  const [npcAims, setNpcAims] = useState<Record<string, UnitAim>>({});
  const npcAimSeq = useRef(0);
  const aimNpc = (id: string, at: Pos) => setNpcAims(prev => ({ ...prev, [id]: { x: at.x, y: at.y, seq: ++npcAimSeq.current } }));
  const talkTo = (id: string) => {
    const placed = SANCTUM.npcs.find(n => n.id === id);
    if (!placed) return;
    setTalkingTo(placed);
    setTalkCount(n => n + 1);
    setConversation(conversationOf(id, quests.log) ?? null);
    aimNpc(id, playerPos);
  };
  const endTalk = useCallback(() => {
    if (!talkingTo) return;
    aimNpc(talkingTo.id, { x: talkingTo.pos.x + talkingTo.facing[0], y: talkingTo.pos.y + talkingTo.facing[1] });
    setTalkingTo(null);
    endVisit(); // a trade can only be undone during the visit it was made in
  }, [talkingTo, endVisit]);
  // Walking away (the leader no longer beside it) or leaving the Sanctum ends the talk, as does opening any window
  // (a service NPC's own window is its talk)
  const otherWindowOpen = showCharSheet || showRifter || showTesting;
  useEffect(() => {
    if (talkingTo && (location !== 'sanctum' || !isAdjacent(playerPos, talkingTo.pos) || otherWindowOpen)) endTalk();
  }, [talkingTo, location, playerPos, otherWindowOpen, endTalk]);
  /**
   * What finishing a conversation or topic does: a quest taken, moved on or completed, a rift key put on the keyring
   * (each named in floating text over the leader).
   */
  const runDialogueEffects = (effects: readonly DialogueEffect[] | undefined) => {
    for (const e of effects ?? []) {
      if (e.kind === 'giveQuest') {
        quests.take(e.quest);
        announce(playerPos.x, playerPos.y, `New quest: ${quest(e.quest).name}`, 'var(--rift-quest)');
      } else if (e.kind === 'advanceQuest') {
        const next = quest(e.quest).steps?.[stepIndex(quests.log, e.quest) + 1];
        quests.advance(e.quest);
        if (next) announce(playerPos.x, playerPos.y, `New objective: ${next.objective}`, 'var(--rift-quest)');
      } else if (e.kind === 'completeQuest') {
        quests.complete(e.quest);
        announce(playerPos.x, playerPos.y, `Quest complete: ${quest(e.quest).name}`, 'var(--rift-quest)');
      } else if (e.kind === 'giveKey') {
        addKey(e.key);
        announce(playerPos.x, playerPos.y, DUNGEONS[e.key].keyName, riftGlowCss(DUNGEONS[e.key].riftColor));
      }
    }
  };
  /** The speaking NPC finished a topic it was asked about: what it does (its effects). */
  const finishTopic = (topic: DialogueTopic) => runDialogueEffects(topic.effects);
  /** The speaking NPC finished its conversation: what it does (a topic-less one's effects), and the talk ends. */
  const finishConversation = () => {
    if (talkingTo) runDialogueEffects(conversation?.effects);
    endTalk();
    if (scene === 'greeting') setScene(null);
  };
  // The greeting at the Sanctum's door: GREETING_PAUSE_MS after the Sanctum is shown, its greeter speaks to the party
  const talkToRef = useLatest(talkTo);
  useEffect(() => {
    if (scene !== 'greeting' || location !== 'sanctum' || mapLoading || talkingTo) return;
    const id = setTimeout(() => talkToRef.current(SANCTUM.doorGreeter), GREETING_PAUSE_MS);
    return () => clearTimeout(id);
  }, [scene, location, mapLoading, talkingTo, talkToRef]);
  // The NPC speaking now, if the party is talking to one without a service (a service opens its window instead)
  const speaking = talkingTo && !npc(talkingTo.id).service && conversation ? { npcId: talkingTo.id, talk: talkCount, conversation } : null;
  // The Rifter works once the party has been told how (RIFTER_UNLOCK); a quest step waiting on it marks its receptacle (?)
  const rifterUsable = questHolds(quests.log, RIFTER_UNLOCK);
  const rifterMark: QuestMark | null = quests.log.active.some(id => currentStep(quests.log, id)?.marker === 'rifter') ? '?' : null;
  /**
   * The party did something (entered a dungeon, picked up a key there): the quests waiting on it move on, their next
   * objective floating over the leader.
   */
  const questDid = (event: QuestEvent) => {
    for (const id of questsFinishedBy(quests.log, event)) {
      const next = quest(id).steps?.[stepIndex(quests.log, id) + 1];
      if (next) announce(playerPos.x, playerPos.y, `New objective: ${next.objective}`, 'var(--rift-quest)');
    }
    quests.event(event);
  };
  const questDidRef = useLatest(questDid);
  // The key lying to be found in this passage, if any (its words, then it is taken: finding)
  const foundKey = location === 'dungeon' ? foundKeyIn(dungeonKey) : undefined;
  const [finding, setFinding] = useState<Pos | null>(null);
  // Its words at the passage's door while it still lies in the passage (its `leaving`): the door stays shut
  const [turnBack, setTurnBack] = useState<Pos | null>(null);
  // The keys lying on this dungeon's floor are marked: a found key by what its words do (! a quest to take), else by a
  // quest step waiting on a key being picked up here (?)
  const keyMark: QuestMark | null = foundKey && zone && Object.values(zone.droppedKeys).includes(foundKey.key)
    ? effectsMark(foundKey.conversation.effects, quests.log)
    : quests.log.active.some(id => {
      const step = currentStep(quests.log, id);
      return step?.marker === 'droppedKey' && !!step.until && 'pickUpKeyIn' in step.until && step.until.pickUpKeyIn === dungeonKey;
    }) ? '?' : null;
  // The quest marker over each NPC (! a quest to take, ? one to hand in), from what it would say now
  const questMarks = useMemo(() => {
    const out: Record<string, QuestMark> = {};
    for (const n of SANCTUM.npcs) {
      const mark = npcQuestMark(n.id, quests.log);
      if (mark) out[n.id] = mark;
    }
    return out;
  }, [quests.log]);
  const keysRef = useLatest(keyring.keys);
  const chests = useChests({ location, dungeon, currentZone, combatActive: combat.active, playerPos, partyLevel: progress.level, partyCanUse, takeLoot, takeGold, takeShards });

  /** Replace the current zone's data in the dungeon (e.g. its dropped items). */
  const updateCurrentZone = useCallback((fn: (z: ZoneData) => ZoneData) => {
    setDungeon(prev => prev ? { ...prev, zones: prev.zones.map((z, i) => i === currentZoneRef.current ? fn(z) : z) } : null);
  }, [currentZoneRef]);

  /**
   * Pick up what lies on `pos` (clicked from next to it): a rift key goes on the keyring, gold into the party's gold
   * and shards into the party's shards (none needs inventory room, so a full inventory never keeps them); a loot pile
   * goes into the inventory, as much as fits.
   */
  /** The rift key lying on `pos` in this dungeon is gone from its floor. */
  const clearKeyAt = useCallback((pos: Pos) =>
    updateCurrentZone(z => ({ ...z, droppedKeys: Object.fromEntries(Object.entries(z.droppedKeys).filter(([k]) => k !== posKey(pos))) })), [updateCurrentZone]);
  /** Pick up the rift key lying on `pos` in this dungeon: onto the keyring (the quests waiting on it move on). */
  const pickUpRiftKey = useCallback((pos: Pos, riftKey: DungeonKey) => {
    addKey(riftKey);
    announce(pos.x, pos.y, DUNGEONS[riftKey].keyName, riftGlowCss(DUNGEONS[riftKey].riftColor));
    clearKeyAt(pos);
    questDidRef.current({ pickUpKeyIn: dungeonKey });
  }, [dungeonKey, addKey, announce, clearKeyAt, questDidRef]);
  /**
   * The found key's words are said: what they do (a quest given), and the key is taken, only from the floor: the party
   * doesn't know it is a key (someone gives it later: a dialogue's giveKey).
   */
  const finishFinding = () => {
    if (finding && foundKey) {
      runDialogueEffects(foundKey.conversation.effects);
      clearKeyAt(finding);
    }
    setFinding(null);
    setScene(null);
  };

  const handleLootPickup = useCallback((pos: Pos) => {
    if (!zone) return;
    const key = posKey(pos);
    // A tile's record with this tile's entry gone (what was lying here has been taken)
    const cleared = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));
    const riftKey = zone.droppedKeys[key];
    // A rift key: onto the keyring; a found one speaks first (its words), and is taken once they are said (finishFinding)
    if (riftKey && riftKey === foundKey?.key) {
      setFinding(pos);
      setScene('finding');
    } else if (riftKey) pickUpRiftKey(pos, riftKey);
    const coins = zone.droppedGold[key];
    if (coins) {
      takeGold(coins, pos);
      updateCurrentZone(z => ({ ...z, droppedGold: cleared(z.droppedGold) }));
    }
    const found = zone.droppedShards[key];
    if (found) {
      takeShards(found, pos);
      updateCurrentZone(z => ({ ...z, droppedShards: cleared(z.droppedShards) }));
    }
    const items = zone.droppedItems[key];
    if (!items?.length) return;

    const remaining = takeLoot(items, pos);
    if (!remaining) return;
    updateCurrentZone(z => ({ ...z, droppedItems: remaining.length > 0 ? { ...z.droppedItems, [key]: remaining } : cleared(z.droppedItems) }));
  }, [zone, foundKey, pickUpRiftKey, takeLoot, takeGold, takeShards, updateCurrentZone]);
  const lootPickupRef = useLatest(handleLootPickup);

  /**
   * Loot for enemies that just died (any cause), on the tiles they fell: items favouring what the party can use, gold
   * (rolled apart from items: rollGold) and, for any enemy, a chance of a group of affix shards (SHARD_DROP_CHANCE).
   * A boss also drops a rift key the party doesn't have (and that isn't
   * already lying in this dungeon), if one is left: on its tile, or the nearest floor tile beside it with nothing
   * lying on it.
   */
  const dropLoot = useCallback((dead: EnemyInstance[]) => {
    const d = dungeonRef.current;
    if (!d) return;
    const drops: Record<string, Item[]> = {};
    const goldDrops: Record<string, number> = {};
    const shardDrops: Record<string, ShardCounts> = {};
    const keyDrops: { at: Pos; key: DungeonKey }[] = [];
    // A boss's defeat gives the vendor fresh wares, at the party's level (only then: leaving a dungeon doesn't)
    if (dead.some(isBoss)) restockVendor(partyLevelRef.current);
    for (const e of dead) {
      // (none in a dungeon whose enemies drop nothing: DungeonData.loot)
      if (d.loot) {
        const items = generateLootDrops(d.level, partyLevelRef.current, e.classData.dropChance ?? 0, partyCanUse);
        if (items.length) (drops[posKey(e.pos)] ??= []).push(...items);
        const coins = rollGold(e.level, e.classData.dropsGold ?? 0, e.classData.goldBonus);
        if (coins) goldDrops[posKey(e.pos)] = (goldDrops[posKey(e.pos)] ?? 0) + coins;
        const found = rollShardDrop(SHARD_DROP_CHANCE);
        if (found) shardDrops[posKey(e.pos)] = mergeShards(shardDrops[posKey(e.pos)] ?? {}, found);
      }
      if (isBoss(e)) {
        const lying = [...d.zones.flatMap(z => Object.values(z.droppedKeys)), ...keyDrops.map(k => k.key)];
        const key = bossKeyDrop(keysRef.current, lying);
        if (key) keyDrops.push({ at: e.pos, key });
      }
    }
    if ([drops, goldDrops, shardDrops].every(r => Object.keys(r).length === 0) && keyDrops.length === 0) return;
    updateCurrentZone(z => {
      const merged = { ...z.droppedItems };
      for (const [k, items] of Object.entries(drops)) merged[k] = [...(merged[k] ?? []), ...items];
      // Gold on a tile that has some already adds to its pile
      const gold = { ...z.droppedGold };
      for (const [k, coins] of Object.entries(goldDrops)) gold[k] = (gold[k] ?? 0) + coins;
      // So do shards
      const shardPiles = { ...z.droppedShards };
      for (const [k, found] of Object.entries(shardDrops)) shardPiles[k] = mergeShards(shardPiles[k] ?? {}, found);
      const keys = { ...z.droppedKeys };
      for (const { at, key } of keyDrops) {
        const free = (p: Pos) => z.floors.has(posKey(p)) && !merged[posKey(p)]?.length && !gold[posKey(p)] && !shardPiles[posKey(p)] && !keys[posKey(p)];
        const spot = free(at) ? at : (findOpenTilesNear(at, free, 1, 3)[0] ?? at);
        keys[posKey(spot)] = key;
      }
      return { ...z, droppedItems: merged, droppedGold: gold, droppedShards: shardPiles, droppedKeys: keys };
    });
  }, [partyCanUse, updateCurrentZone, restockVendor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions, ticks, experience, keys ────────────────────────────────────

  const { unitAims, unitFx, applyActionOutcome, applyOutcomeRef, cancelPendingOutcomes } = useActionOutcomes({
    spawnFloat, updateMembers, partyStatsRef, partyPosRef, partyLevelRef, enemiesRef, dungeonRef, currentZoneRef, setEnemies, setCombat,
  });
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

  // ─── Location transitions ──────────────────────────────────────────────

  /**
   * Go back to the Sanctum (`by` a rift, arriving in front of the Rifter, or by a passage's door, arriving inside its
   * door), or into a dungeon or passage (a fresh one, generated from its preset).
   */
  const handleLocationChange = (next: 'sanctum' | AreaKey, by: 'rift' | 'door' = 'rift') => {
    cancelPendingOutcomes();
    reviveDowned();
    setLocation(next === 'sanctum' ? 'sanctum' : 'dungeon');
    setCombat(INITIAL_COMBAT);
    clearFloats();
    clearEffects();
    resetDeaths(); // enemy ids repeat between dungeons
    chests.resetChests(); // so do chest ids: a new dungeon's chests start full
    resetFog(); // and it starts unseen
    setFacesOnArrival(null);

    if (next !== 'sanctum') {
      setDungeonKey(next);
      const { dungeon: d, enemies: spawned } = buildArea(next, progress.level);
      setDungeon(d);
      setCurrentZone(d.startZoneId);
      setPlayerPos(d.playerStart);
      setEnemies(spawned);
      // The followers take the tiles around the rift the party came through, beside the leader
      const isFree = isFreeFloor(d, d.zones[d.startZoneId], spawned);
      setFollowerPositions(findFollowerSpawns(zoneRift(d, d.startZoneId) ?? d.playerStart, p => isFree(p) && !samePos(p, d.playerStart), 2));
    } else {
      setDungeon(null);
      setCurrentZone(0);
      window.clearTimeout(reopenTimer.current);
      setRifter(DORMANT_RIFTER); // its rift closed after use: dormant again
      setShowRifter(false);
      // Every way back by a rift (or a party wipe) arrives in front of the Rifter; a passage's door, inside the Sanctum's door
      const [leader, ...followers] = by === 'door' ? SANCTUM.doorArrival : SANCTUM.riftArrival;
      setPlayerPos(leader);
      setFollowerPositions(followers);
      setEnemies([]);
      // Through the door, the party faces its greeter, who speaks at once if he has a quest for it (scene 'greeting')
      if (by === 'door') {
        setFacesOnArrival(SANCTUM.npcs.find(n => n.id === SANCTUM.doorGreeter)?.pos ?? null);
        if (npcQuestMark(SANCTUM.doorGreeter, quests.log)) setScene('greeting');
      }
    }
  };

  // The game begins with the opening: the party arriving in its passage (scene 'arrival')
  useEffect(() => { handleLocationChange(OPENING_PASSAGE); }, []); // eslint-disable-line react-hooks/exhaustive-deps -- once, on mount

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
    // A party wipe: everyone wakes in the Sanctum at full HP and MP, once the map has faded to black (a repeat
    // call while it fades does nothing)
    if (partyHp.every(hp => hp <= 0)) {
      fadeOut(() => {
        changes.current.handleLocationChange('sanctum');
        changes.current.restoreAll();
      });
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

  // ─── Aggro detection ─────────────────────────────────────────────────────

  /**
   * Aggro every unaggroed group with a member visible from `pos`, then start combat with them
   * (or add them to the combat already running).
   */
  // How many fights have begun (each one plays the dark red pulse around the screen's edge: EdgePulse)
  const [combatStarts, setCombatStarts] = useState(0);
  const triggerAggro = useCallback((pos: Pos, zoneEnemyList: EnemyInstance[], sight: ReadonlySet<string>, inCombat: boolean) => {
    const newlyAggroed = aggroedBy(pos, zoneEnemyList, sight);
    if (newlyAggroed.length === 0) return;
    const aggroIds = new Set(newlyAggroed.map(e => e.id));
    setEnemies(prev => prev.map(e => aggroIds.has(e.id) ? { ...e, aggroed: true } : e));
    if (!inCombat) setCombatStarts(n => n + 1);
    setCombat(prev => inCombat
      ? joinCombat(prev, newlyAggroed)
      : startCombat(party.map((m, i) => ({ stats: partyStatsRef.current[i], name: m.characterName })), newlyAggroed));
  }, [party, partyStatsRef]);

  // ─── Door transitions ─────────────────────────────────────────────────

  const handleDoorClick = useCallback((doorId: string) => {
    if (!zone || !dungeon || combat.active) return;

    const door = zone.doors.find(d => d.id === doorId);
    if (!door || door.to === 'sanctum') return; // (out to the Sanctum: goThroughDoor)
    const { zoneId, doorId: pairedId } = door.to;

    const targetZone = dungeon.zones[zoneId];
    const pairedDoor = targetZone.doors.find(d => d.id === pairedId);
    if (!pairedDoor) return;

    // Arrive on the free floor tile closest to the paired door (never on an enemy), followers around it
    const isFree = isFreeFloor(dungeon, targetZone, enemies);
    const spawnPos = findOpenTilesNear(pairedDoor.pos, isFree, 1, 4)[0];
    if (!spawnPos) return;

    setCurrentZone(zoneId);
    setPlayerPos(spawnPos);
    setFollowerPositions(findFollowerSpawns(spawnPos, isFree, 2));
    clearFloats();

    triggerAggro(spawnPos, enemies.filter(e => e.zoneId === zoneId), targetZone.sight, false);
  }, [zone, dungeon, combat.active, enemies, triggerAggro, clearFloats]);

  // ─── Fading between maps ──────────────────────────────────────────────
  // Every change of map (a rift into a dungeon or back to the Sanctum, a door to another zone, a party wipe) first
  // fades the map to black (useFadeOut); the new one fades in once its 3D layer has drawn (useSceneReady)
  const { fading, fadeMs, fadeOut } = useFadeOut();
  // (each change as of when the fade ends, with that render's state)
  const changes = useLatest({ handleLocationChange, handleDoorClick, restoreAll });
  // Into a dungeon through the Rifter's rift: the quests waiting on the party entering it move on
  const travel = (next: 'sanctum' | AreaKey) => {
    if (next !== 'sanctum' && !isPassage(next)) questDid({ enterRift: next });
    fadeOut(() => changes.current.handleLocationChange(next));
  };
  // Through a door: into another zone, or (a passage's way out) into the Sanctum
  const goThroughDoor = (doorId: string) => {
    const door = zone?.doors.find(d => d.id === doorId);
    // Out of a passage with its found key still lying in it: the key's words turn the party back instead
    if (door?.to === 'sanctum' && foundKey && zone && Object.values(zone.droppedKeys).includes(foundKey.key)) {
      setTurnBack(door.pos);
      setScene('finding');
      return;
    }
    const out = door?.to === 'sanctum';
    fadeOut(() => (out ? changes.current.handleLocationChange('sanctum', 'door') : changes.current.handleDoorClick(doorId)));
  };

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
      // Followers trail the leader along the way it walked, in an unbroken line behind it (trailFollowers),
      // over walkable floor, never onto an enemy or a map object
      const enemyTiles = creatureTiles(zoneEnemies.filter(e => e.currentHp > 0));
      const walkable = zone && dungeon ? zoneWalkable(dungeon, zone) : isSanctumWalkable;
      const isEnemy = (p: Pos) => enemyTiles.has(posKey(p));
      const walk = partyWalk(playerPos, newPos, steps, walkable, isEnemy);
      setPlayerPos(newPos);
      setFollowerPositions(trailFollowers(walk, followerPositionsRef.current, p => walkable(p) && !isEnemy(p)));
      lootPickupRef.current(newPos);
    }

    if (zone) triggerAggro(newPos, zoneEnemies, zone.sight, combat.active);
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
    if (!action || activeMp < mpCostAt(action, progress.level)) return;
    // A summoned creature only lasts the fight: no summoning out of combat
    if (!combat.active && action.effects.some(e => e.type === 'summon')) {
      spawnFloat(activePartyPos.x, activePartyPos.y, 'Only in combat', COMBAT_TEXT_COLOR.warn);
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
      tileTargets,
    });
    if (!aimed) { clearActiveSlot(); return; }

    applyActionOutcome(executeAction(caster, action, aimed.targets, targetPos, aimed.allies, actionWorld()), caster, targetPos);
    clearActiveSlot();
    if (combat.active) setCombat(prev => ({ ...prev, apSpent: prev.apSpent + action.apCost }));
  }, [combat.active, isPlayerTurn, activeAp, activePartyIdx, activeAction, zoneEnemies, activePartyPos, activeMp, partyAllStats, partyPositions, partyHp, party, zone, zoneSummons, tileTargets, applyActionOutcome, spawnFloat, progress.level]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // Every enemy in the fight is dead (summoned ones too): it's over, and every summoned creature vanishes with it
  useEffect(() => {
    if (!combat.active) return;
    const allAggroedDead = zoneEnemies.filter(e => e.aggroed && isHostile(e)).every(e => e.currentHp <= 0);
    if (!allAggroedDead) return;
    reviveParty();
    setCombat(INITIAL_COMBAT);
    setEnemies(prev => prev.filter(e => !e.summon));
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
              partyBuffs={partyBuffs}
              partyHots={partyHots}
              partyDots={partyDots}
              terrain={preset.terrain}
              clutter={preset.clutter}
              doorObject={preset.doorObject}
              enemyAoePreview={enemyAoePreview}
              enemyTargetKey={enemyTargetKey}
              tileTargets={tileTargets}
              droppedItems={zone?.droppedItems}
              droppedKeys={zone?.droppedKeys}
              keyMark={keyMark}
              foundKey={foundKey}
              sceneObjects={portalObjects}
              dialogue={(finding || turnBack) && foundKey ? {
                at: (finding ?? turnBack)!,
                content: <NpcDialogue portrait={<KeyPortrait color={DUNGEONS[foundKey.key].riftColor} size={DIALOGUE_PORTRAIT} />} name={foundKey.name}
                  conversation={finding ? foundKey.conversation : foundKey.leaving} quests={quests.log} onTopicDone={() => {}}
                  onEnd={finding ? finishFinding : () => { setTurnBack(null); setScene(null); }} />,
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
          <Narration lines={ARRIVAL_LINES} onDone={() => { setScene(null); hints.trigger('gameStart'); }} />
        </div>
      )}

      {/* ─── HUD ─── (none while the party arrives; not usable while it watches a scene) */}
      {scene !== 'arrival' && <div className={`contents ${locked ? '[&_*]:pointer-events-none' : ''}`}>

      {/* Where the party is */}
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
        <EnchanterWindow enchanter={enchanter} npc={npc(talkingTo.id)} inventory={inventory} gold={gold} shards={shards}
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
          onEquipItem={equipItem}
          onUnequipItem={unequipItem}
          onMoveItem={moveInventoryItem}
          onSwapGear={swapGearSlots}
          progress={progress}
          pending={pendingPoints}
          onPendingChange={setMemberPending}
          onConfirmPoints={confirmPoints}
        />
      )}
    </Backdrop>
  );
}

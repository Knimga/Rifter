// The game: the Sanctum or a dungeon, the party moving and fighting in it, and the HUD. Each concern lives in
// its own hook (party member state, inventory, chests, experience, round ticks, action outcomes, keys, the
// enemy turn); this screen holds where everyone is and the fight, wires the hooks together, and draws it all.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import { CLASSES } from '../data/units/classes';
import { generateLootDrops, heldWeapon, type Item } from '../data/gear';
import { rollGold } from '../data/gear/loot';
import { formatGold } from '../data/detailStrings';
import { partyCanUseItem } from '../data/gear/inventory';
import { AUTO_END_TURN_DELAY_MS, COMBAT_TEXT_COLOR, STUNNED_PAUSE_MS } from '../data/constants';
import { hasPointsToSpend, isOnMap, type PartyMemberConfig } from '../data/units/party';
import { xpToNext, type PartyProgress } from '../data/units/xp';
import { isAlly, isHostile, type EnemyInstance } from '../data/units/enemies';
import { isBoss } from '../data/units/bosses';
import { areaTone } from '../data/combat/areas';
import { aimPartyAction } from '../data/combat/targeting';
import { findOpenTilesNear, isAdjacent, posKey, samePos, type Pos } from '../data/world/grid';
import { partyWalk, findFollowerSpawns, spreadOut, trailFollowers } from '../data/world/movement';
import { SANCTUM, SANCTUM_FLOORS, SANCTUM_RECEPTACLE, isSanctumWalkable, type NpcPlacement } from '../data/world/sanctum';
import { npc } from '../data/world/npcs';
import { interactiveObjectName } from '../data/world/interactiveObjects';
import { generateDungeon, isFreeFloor, objectTilesOf, spawnDungeonEnemies, zoneRift, zoneWalkable, type DungeonData, type ZoneData } from '../data/world/dungeonGen';
import { DUNGEONS, type DungeonKey } from '../data/world/dungeons';
import { INITIAL_COMBAT, aggroedBy, startCombat, joinCombat, advanceTurn, apLeft, moveBudget, moveCost, stunnedOutcome, getCurrentCombatant, deadPartyIndices, type CombatState } from '../data/combat/combat';
import { isRooted } from '../data/units/stats';
import { creatureUnit, executeAction, memberUnit, toAction, unitKey, type ActionWorld, type CombatUnit } from '../data/combat/abilityExecution';
import { useEnemyTurn, type EnemyActivity, type EnemyAoePreview } from '../hooks/useEnemyTurn';
import { useFloatingText } from '../hooks/useFloatingText';
import { useLatest } from '../hooks/useLatest';
import { useKeyring } from '../hooks/useKeyring';
import RifterWindow from '../components/RifterWindow';
import VendorWindow from '../components/VendorWindow';
import type { UnitAim } from '../components/ModelLayer';
import { DORMANT_RIFTER, type RifterState } from '../components/SanctumMap';
import { RIFT_CLOSE_MS } from '../forge/designs/_rifter';
import { bossKeyDrop, riftGlowCss } from '../data/world/rifts';
import { usePartyMembers } from '../hooks/usePartyMembers';
import { useInventory } from '../hooks/useInventory';
import { useVendor } from '../hooks/useVendor';
import { useChests } from '../hooks/useChests';
import { useExperience } from '../hooks/useExperience';
import { useEnemyDeaths } from '../hooks/useEnemyDeaths';
import { usePendingPoints } from '../hooks/usePendingPoints';
import { useGameKeys } from '../hooks/useGameKeys';
import { useRoundTick } from '../hooks/useRoundTick';
import { useActionOutcomes } from '../hooks/useActionOutcomes';
import { useFogOfWar } from '../hooks/useFogOfWar';
import { useReach } from '../hooks/useReach';
import { useSceneReady } from '../hooks/useSceneReady';
import { useFadeOut } from '../hooks/useFadeOut';
import LoadingCover from '../components/ui/LoadingCover';

import CharacterSheet from '../components/CharacterSheet';
import ContainerWindow from '../components/ContainerWindow';
import SanctumMap from '../components/SanctumMap';
import DungeonMap from '../components/DungeonMap';
import PanView, { type Insets } from '../components/PanView';
import type { PartyTokenData } from '../components/mapParts';
import Backdrop from '../components/ui/Backdrop';
import RiftButton from '../components/ui/RiftButton';
import DevKeyTool from '../components/DevKeyTool'; // TEMP (testing only)
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

/** Screen space the HUD covers on each side (px): the map pans only within the area inside it. */
const HUD_INSETS: Insets = { top: 84, right: 24, bottom: 164, left: 300 };

export default function GameScreen({ party, setParty, progress, setProgress }: Props) {
  const [location, setLocation] = useState<'sanctum' | 'dungeon'>('sanctum');
  const [playerPos, setPlayerPos] = useState<Pos>(SANCTUM.playerStart);
  const [enemies, setEnemies] = useState<EnemyInstance[]>([]);
  const [combat, setCombat] = useState<CombatState>(INITIAL_COMBAT);
  const { floatingTexts, spawnFloat, removeFloat, clearFloats } = useFloatingText();
  const [showCharSheet, setShowCharSheet] = useState(false);
  const [dungeon, setDungeon] = useState<DungeonData | null>(null);
  // Which dungeon the party is in (or last entered): its preset gives the map's colors and doors
  const [dungeonKey, setDungeonKey] = useState<DungeonKey>('crypt');
  const preset = DUNGEONS[dungeonKey];
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
  // On the map: the living members (isOnMap; the HUD's party rows show everyone)
  const partyTokens = memberTokens.filter(t => isOnMap(t.hp));

  // Fog of war (dungeons only): what the living members see now, and what the party has seen before. Only
  // known tiles can be walked to, and only enemies in sight are on the map (drawn, targetable).
  // Summoned allies see for the party too (and are always shown)
  const viewers = [...memberTokens.filter(t => t.hp > 0).map(t => t.pos), ...zoneSummons.map(e => e.pos)];
  const { fog, resetFog } = useFogOfWar({ location, dungeon, currentZone, viewers });
  const seenEnemies = fog ? zoneEnemies.filter(e => isAlly(e) || fog.visible.has(posKey(e.pos))) : zoneEnemies;

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
      { hp: partyHpRef.current[i] ?? 0, buffs: membersRef.current[i]?.buffs ?? [], weapon });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** What executeAction needs of the fight: the map's floor, and a living unit by unitKey. */
  const actionWorld = useCallback((): ActionWorld => ({
    floors: zoneRef.current?.floors ?? SANCTUM_FLOORS,
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

  const { inventory, setInventory, takeLoot, equipItem, unequipItem, gold, setGold, addGold } = useInventory({ party, setParty, spawnFloat });
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
  const [showRifter, setShowRifter] = useState(false);
  useEffect(() => {
    if (showRifter && (location !== 'sanctum' || !isAdjacent(playerPos, SANCTUM_RECEPTACLE))) setShowRifter(false);
  }, [showRifter, location, playerPos]);

  // The Sanctum's NPCs: the one the leader is speaking to (its window open), and where each faces. It turns to the
  // leader when spoken to, and back to its own way (the tile in front of it) when the talk ends
  const [talkingTo, setTalkingTo] = useState<NpcPlacement | null>(null);
  const [npcAims, setNpcAims] = useState<Record<string, UnitAim>>({});
  const npcAimSeq = useRef(0);
  const aimNpc = (id: string, at: Pos) => setNpcAims(prev => ({ ...prev, [id]: { x: at.x, y: at.y, seq: ++npcAimSeq.current } }));
  const talkTo = (id: string) => {
    const placed = SANCTUM.npcs.find(n => n.id === id);
    if (!placed) return;
    setTalkingTo(placed);
    aimNpc(id, playerPos);
  };
  const endTalk = useCallback(() => {
    if (!talkingTo) return;
    aimNpc(talkingTo.id, { x: talkingTo.pos.x + talkingTo.facing[0], y: talkingTo.pos.y + talkingTo.facing[1] });
    setTalkingTo(null);
    endVisit(); // a trade can only be undone during the visit it was made in
  }, [talkingTo, endVisit]);
  // Walking away (the leader no longer beside it) or leaving the Sanctum ends the talk
  useEffect(() => {
    if (talkingTo && (location !== 'sanctum' || !isAdjacent(playerPos, talkingTo.pos))) endTalk();
  }, [talkingTo, location, playerPos, endTalk]);
  const keysRef = useLatest(keyring.keys);
  const chests = useChests({ location, dungeon, currentZone, combatActive: combat.active, playerPos, partyLevel: progress.level, partyCanUse, takeLoot, takeGold });

  /** Replace the current zone's data in the dungeon (e.g. its dropped items). */
  const updateCurrentZone = useCallback((fn: (z: ZoneData) => ZoneData) => {
    setDungeon(prev => prev ? { ...prev, zones: prev.zones.map((z, i) => i === currentZoneRef.current ? fn(z) : z) } : null);
  }, [currentZoneRef]);

  /**
   * Pick up what lies on `pos` (clicked from next to it): a rift key goes on the keyring and gold into the party's
   * gold (neither needs inventory room, so a full inventory never keeps them); a loot pile goes into the inventory,
   * as much as fits.
   */
  const handleLootPickup = useCallback((pos: Pos) => {
    if (!zone) return;
    const key = posKey(pos);
    // A tile's record with this tile's entry gone (what was lying here has been taken)
    const cleared = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));
    const riftKey = zone.droppedKeys[key];
    if (riftKey) {
      addKey(riftKey);
      spawnFloat(pos.x, pos.y, DUNGEONS[riftKey].keyName, riftGlowCss(DUNGEONS[riftKey].riftColor));
      updateCurrentZone(z => ({ ...z, droppedKeys: cleared(z.droppedKeys) }));
    }
    const coins = zone.droppedGold[key];
    if (coins) {
      takeGold(coins, pos);
      updateCurrentZone(z => ({ ...z, droppedGold: cleared(z.droppedGold) }));
    }
    const items = zone.droppedItems[key];
    if (!items?.length) return;

    const remaining = takeLoot(items, pos);
    if (!remaining) return;
    updateCurrentZone(z => ({ ...z, droppedItems: remaining.length > 0 ? { ...z.droppedItems, [key]: remaining } : cleared(z.droppedItems) }));
  }, [zone, takeLoot, takeGold, updateCurrentZone, addKey, spawnFloat]);
  const lootPickupRef = useLatest(handleLootPickup);

  /**
   * Loot for enemies that just died (any cause), on the tiles they fell: items favouring what the party can use, and
   * gold (rolled apart from items: rollGold). A boss also drops a rift key the party doesn't have (and that isn't
   * already lying in this dungeon), if one is left: on its tile, or the nearest floor tile beside it with nothing
   * lying on it.
   */
  const dropLoot = useCallback((dead: EnemyInstance[]) => {
    const d = dungeonRef.current;
    if (!d) return;
    const drops: Record<string, Item[]> = {};
    const goldDrops: Record<string, number> = {};
    const keyDrops: { at: Pos; key: DungeonKey }[] = [];
    // A boss's defeat gives the vendor fresh wares, at the party's level (only then: leaving a dungeon doesn't)
    if (dead.some(isBoss)) restockVendor(partyLevelRef.current);
    for (const e of dead) {
      const items = generateLootDrops(d.level, partyLevelRef.current, e.classData.dropChance ?? 0, partyCanUse);
      if (items.length) (drops[posKey(e.pos)] ??= []).push(...items);
      const coins = rollGold(e.level, e.classData.dropsGold ?? 0, e.classData.goldBonus);
      if (coins) goldDrops[posKey(e.pos)] = (goldDrops[posKey(e.pos)] ?? 0) + coins;
      if (isBoss(e)) {
        const lying = [...d.zones.flatMap(z => Object.values(z.droppedKeys)), ...keyDrops.map(k => k.key)];
        const key = bossKeyDrop(keysRef.current, lying);
        if (key) keyDrops.push({ at: e.pos, key });
      }
    }
    if (Object.keys(drops).length === 0 && Object.keys(goldDrops).length === 0 && keyDrops.length === 0) return;
    updateCurrentZone(z => {
      const merged = { ...z.droppedItems };
      for (const [k, items] of Object.entries(drops)) merged[k] = [...(merged[k] ?? []), ...items];
      // Gold on a tile that has some already adds to its pile
      const gold = { ...z.droppedGold };
      for (const [k, coins] of Object.entries(goldDrops)) gold[k] = (gold[k] ?? 0) + coins;
      const keys = { ...z.droppedKeys };
      for (const { at, key } of keyDrops) {
        const free = (p: Pos) => z.floors.has(posKey(p)) && !merged[posKey(p)]?.length && !gold[posKey(p)] && !keys[posKey(p)];
        const spot = free(at) ? at : (findOpenTilesNear(at, free, 1, 3)[0] ?? at);
        keys[posKey(spot)] = key;
      }
      return { ...z, droppedItems: merged, droppedGold: gold, droppedKeys: keys };
    });
  }, [partyCanUse, updateCurrentZone, restockVendor]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Actions, ticks, experience, keys ────────────────────────────────────

  const { unitAims, applyActionOutcome, applyOutcomeRef, cancelPendingOutcomes } = useActionOutcomes({
    spawnFloat, updateMembers, partyStatsRef, partyPosRef, partyLevelRef, enemiesRef, dungeonRef, currentZoneRef, setEnemies, setCombat,
  });
  useRoundTick({
    combatActive: combat.active, round: combat.round, membersRef, updateMembers, partyStatsRef, partyPosRef,
    enemiesRef, currentZoneRef, setEnemies, setCombat, spawnFloat,
  });
  const { xpGain, addXp, awardKills } = useExperience({ progress, setProgress, party, setParty, spawnFloat, leaderPosRef });
  // Every enemy that dies, however (a hit, a DoT tick), gives its XP and drops its loot, once
  const resetDeaths = useEnemyDeaths(enemies, (dead) => { awardKills(dead); dropLoot(dead); });
  const { pendingPoints, setMemberPending, confirmPoints, anyoneLeveling } = usePendingPoints(party, setParty);

  useGameKeys({
    // With the vendor's window open, I closes it and opens the party window instead
    toggleSheet: () => {
      if (showRifter) return;
      if (talkingTo) { endTalk(); setShowCharSheet(true); return; }
      setShowCharSheet(prev => !prev);
    },
    escape: () => {
      if (showRifter) { setShowRifter(false); return; }
      if (talkingTo) { endTalk(); return; }
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
    resetDeaths(); // enemy ids repeat between dungeons
    chests.resetChests(); // so do chest ids: a new dungeon's chests start full
    resetFog(); // and it starts unseen

    if (next !== 'sanctum') {
      const config = DUNGEONS[next];
      setDungeonKey(next);
      const d = generateDungeon(config, progress.level);
      setDungeon(d);
      setCurrentZone(d.startZoneId);
      setPlayerPos(d.playerStart);
      const spawned = spawnDungeonEnemies(d, config);
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
      // Every way back (a rift, a party wipe) arrives in front of the Rifter
      const [leader, ...followers] = SANCTUM.riftArrival;
      setPlayerPos(leader);
      setFollowerPositions(followers);
      setEnemies([]);
    }
  };

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
  const triggerAggro = useCallback((pos: Pos, zoneEnemyList: EnemyInstance[], floors: Set<string>, inCombat: boolean) => {
    const newlyAggroed = aggroedBy(pos, zoneEnemyList, floors);
    if (newlyAggroed.length === 0) return;
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

  // ─── Fading between maps ──────────────────────────────────────────────
  // Every change of map (a rift into a dungeon or back to the Sanctum, a door to another zone, a party wipe) first
  // fades the map to black (useFadeOut); the new one fades in once its 3D layer has drawn (useSceneReady)
  const { fading, fadeOut } = useFadeOut();
  // (each change as of when the fade ends, with that render's state)
  const changes = useLatest({ handleLocationChange, handleDoorClick, restoreAll });
  const travel = (next: 'sanctum' | DungeonKey) => fadeOut(() => changes.current.handleLocationChange(next));
  const goThroughDoor = (doorId: string) => fadeOut(() => changes.current.handleDoorClick(doorId));

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
      const enemyTiles = new Set(zoneEnemies.filter(e => e.currentHp > 0).map(e => posKey(e.pos)));
      const walkable = zone && dungeon ? zoneWalkable(dungeon, zone) : isSanctumWalkable;
      const isEnemy = (p: Pos) => enemyTiles.has(posKey(p));
      const walk = partyWalk(playerPos, newPos, steps, walkable, isEnemy);
      setPlayerPos(newPos);
      setFollowerPositions(trailFollowers(walk, followerPositionsRef.current, p => walkable(p) && !isEnemy(p)));
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
      casterPos: activePartyPos, at: targetPos, floors: zone?.floors ?? SANCTUM_FLOORS, inCombat: combat.active,
      partySide: () => [...party.flatMap((_, i) => (partyHp[i] ?? 0) > 0 ? [partyUnit(i)] : []), ...zoneSummons.map(creatureUnit)],
      allyAt: (p) => {
        const i = partyPositions.findIndex(q => samePos(q, p));
        const summon = zoneSummons.find(e => samePos(e.pos, p));
        return i >= 0 ? partyUnit(i) : summon ? creatureUnit(summon) : null;
      },
      hostiles: zoneEnemies.filter(e => e.currentHp > 0 && isHostile(e)).map(creatureUnit),
      tileTargets,
    });
    if (!aimed) { clearActiveSlot(); return; }

    applyActionOutcome(executeAction(caster, action, aimed.targets, targetPos, aimed.allies, actionWorld()), caster, targetPos);
    clearActiveSlot();
    if (combat.active) setCombat(prev => ({ ...prev, apSpent: prev.apSpent + action.apCost }));
  }, [combat.active, isPlayerTurn, activeAp, activePartyIdx, activeAction, zoneEnemies, activePartyPos, activeMp, partyAllStats, partyPositions, partyHp, party, zone, zoneSummons, tileTargets, applyActionOutcome, spawnFloat]); // eslint-disable-line react-hooks/exhaustive-deps

  // A member's turn ends by itself once it has nothing left to spend (no AP, no paid tiles). One that starts
  // its turn with no AP (stunned) loses it, the same as an enemy (useEnemyTurn). Waits a moment first, and
  // rechecks whenever its AP changes: the top-of-round tick may still be ending a stun.
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

  // ─── Map loading ─────────────────────────────────────────────────────────
  // The map stays under a dark cover until its 3D layer has drawn (useSceneReady), after fading to black before a
  // change of map (useFadeOut, above)
  const mapKey = `${location}:${zone?.id ?? ''}`;
  const { loading: mapLoading, onReady: onMapReady } = useSceneReady(mapKey);

  // ─── Render ──────────────────────────────────────────────────────────────

  const activeTarget = activeAction?.target ?? null;

  // ─── HUD state ───────────────────────────────────────────────────────────
  // A creature the AI runs (an enemy or a summoned ally) is taking its turn
  const aiActing = combat.active && !!currentCombatant && !currentCombatant.isPlayer;
  // The action bar's member: the acting one in combat (none on an enemy's turn), the selected one out of it
  const dockIdx = combat.active ? (isPlayerTurn ? activePartyIdx : null) : barViewIdx;
  const dockSlotContent = dockIdx !== null ? partySlots[dockIdx]?.[partyActiveSlot[dockIdx] ?? -1] ?? null : null;
  const armedName = dockSlotContent === 'weapon-attack' ? (activeWeapon?.name ?? 'Attack') : dockSlotContent?.name;
  const locationName = location === 'sanctum' ? 'The Sanctum' : zone ? `${preset.name} · Zone ${zone.id + 1}` : '';

  return (
    <Backdrop variant="game" className="h-screen">

      {/* The map, full screen: drag with the right mouse button to pan (kept within the area the HUD leaves free) */}
      <div className="absolute inset-0">
        <PanView resetKey={mapKey} insets={HUD_INSETS}>
          {location === 'sanctum' && (
            <SanctumMap
              playerPos={playerPos}
              activeMoverPos={playerPos}
              party={partyTokens}
              aims={unitAims}
              moveTargets={moveTargets}
              onMove={handleMove}
              rifter={rifter}
              onUseRifter={() => setShowRifter(true)}
              onTalkTo={talkTo}
              npcAims={npcAims}
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
              floorColor={preset.floorColor}
              wallColor={preset.wallColor}
              doorObject={preset.doorObject}
              enemyAoePreview={enemyAoePreview}
              enemyTargetKey={enemyTargetKey}
              tileTargets={tileTargets}
              droppedItems={zone?.droppedItems}
              droppedKeys={zone?.droppedKeys}
              droppedGold={zone?.droppedGold}
              onLootClick={handleLootPickup}
              highlightUnitId={hoveredCombatant}
              onReady={onMapReady}
            />
          )}
        </PanView>
      </div>
      {/* The map's cover while its 3D layer starts (under the HUD): fading in before a change of map, fading out
          when the new one is ready */}
      <LoadingCover loading={mapLoading || fading} fadeIn={fading} className="absolute inset-0 z-20" />

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
        {/* TEMP (testing): add any dungeon's key to the keyring (components/DevKeyTool.tsx). Dev builds only. */}
        {import.meta.env.DEV && <DevKeyTool keys={keyring.keys} onAddKey={keyring.addKey} />}
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

      {chests.openChest && (
        // On the right, clear of the map's middle (where the chest and the party are)
        <div className="absolute right-6 top-[26%] z-40">
          <ContainerWindow name={interactiveObjectName(chests.openChest.object)} items={chests.openChestContents.items} gold={chests.openChestContents.gold} usable={partyCanUse}
            onLoot={chests.lootChest} onLootGold={chests.lootChestGold} onClose={chests.closeChest} />
        </div>
      )}

      {talkingTo && npc(talkingTo.id).service === 'vendor' && (
        <VendorWindow vendor={npc(talkingTo.id)} party={party} partyStats={partyAllStats} state={vendor.state}
          onTradeShelf={vendor.tradeShelf} onTradeParty={vendor.tradeParty} onClose={endTalk} />
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
          keys={keyring.keys}
          hasNewKey={keyring.hasNew}
          onSeeKeys={keyring.seeKeys}
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

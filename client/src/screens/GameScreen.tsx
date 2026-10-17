import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

import { CLASSES } from '../data/classes';
import { recomputeStats, type ActiveBuff, type ActiveHot, type ActiveDot } from '../data/stats';
import { getGearArmorBonus, getGearBuffs, isWeaponItem, generateLootDrop, type GearSlot, type GearSlots, type Item } from '../data/gear';
import { isFull, addItem, canEquip, canUnequip, equipFromInventory, unequipToInventory, type Inventory } from '../data/inventory';
import { OUT_OF_COMBAT_REGEN_INTERVAL_MS } from '../data/constants';
import type { PartyMemberConfig } from '../data/party';
import type { EnemyInstance } from '../data/enemies';
import { withEnemyBuffs } from '../data/enemies';
import { affectedKeys, chebyshev, findOpenTilesNear, hasLineOfSight, posKey, samePos, type Pos } from '../data/dungeonHelpers';
import { SANCTUM, isSanctumWalkable } from '../data/sanctum';
import { generateDungeon, spawnDungeonEnemies, type DungeonData, type ZoneData } from '../data/dungeonGen';
import { DUNGEON_PRESETS } from '../data/dungeonPresets';
import { startCombat, joinCombat, advanceTurn, applyTopOfRound, tickRound, getCurrentCombatant, deadPartyIndices, type CombatState, type RoundTick } from '../data/combat';
import { executeAction, toAction, tickDurations, type ActionOutcome, type CombatUnit, type UnitChange } from '../data/abilityExecution';
import { findFollowerSpawns, computeFollowerPositions } from '../data/movementHelpers';
import { useEnemyTurn, type EnemyAoePreview } from '../hooks/useEnemyTurn';
import { useFloatingText } from '../hooks/useFloatingText';

import CharacterSheet from '../components/CharacterSheet';
import SanctumMap from '../components/SanctumMap';
import DungeonMap from '../components/DungeonMap';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { type SlotContent } from '../components/ActionBar';
import type { PartyTokenData } from '../components/mapParts';

interface Props {
  party: PartyMemberConfig[];
  setParty: (party: PartyMemberConfig[]) => void;
}

const AGGRO_RANGE = 5;


const INITIAL_COMBAT: CombatState = {
  active: false,
  turnOrder: [],
  currentTurnIndex: 0,
  round: 0,
  playerActedThisTurn: false,
  movementRemaining: 0,
  partyThreat: [],
};

export default function GameScreen({ party, setParty }: Props) {
  // Phase 1: drive gameplay from the leader (party[0])
  const { gear } = party[0];
  const [location, setLocation] = useState<'sanctum' | 'dungeon'>('sanctum');
  const [playerPos, setPlayerPos] = useState<Pos>(SANCTUM.playerStart);
  const [enemies, setEnemies] = useState<EnemyInstance[]>([]);
  const [combat, setCombat] = useState<CombatState>(INITIAL_COMBAT);
  const { floatingTexts, spawnFloat, removeFloat, clearFloats } = useFloatingText();
  const [showCharSheet, setShowCharSheet] = useState(false);
  const [dungeon, setDungeon] = useState<DungeonData | null>(null);
  const [enemyAoePreview, setEnemyAoePreview] = useState<EnemyAoePreview | null>(null);
  const [enemyTargetPartyIdx, setEnemyTargetPartyIdx] = useState<number | null>(null);
  const [currentZone, setCurrentZone] = useState(0);
  const [followerPositions, setFollowerPositions] = useState<Pos[]>([...SANCTUM.followerStarts]);
  const [inventory, setInventory] = useState<Inventory>([]);

  // ─── Per-member state (Phase 3) ──────────────────────────────────────────
  const [partyHp, setPartyHp] = useState<number[]>([]);
  const [partyMp, setPartyMp] = useState<number[]>([]);
  const [partyBuffs, setPartyBuffs] = useState<ActiveBuff[][]>(() => party.map(() => []));
  const [partyHots, setPartyHots] = useState<ActiveHot[][]>(() => party.map(() => []));
  const [partyDots, setPartyDots] = useState<ActiveDot[][]>(() => party.map(() => []));
  const [partySlots, setPartySlots] = useState<SlotContent[][]>(() =>
    party.map(m => {
      const abilities = m.selectedClass ? CLASSES[m.selectedClass].abilities : [];
      const slots: SlotContent[] = ['weapon-attack', null, null, null, null];
      abilities.slice(0, 4).forEach((ability, i) => { slots[i + 1] = ability; });
      return slots;
    })
  );
  const [partyActiveSlot, setPartyActiveSlot] = useState<(number | null)[]>(() => party.map(() => null));
  const [barViewIdx, setBarViewIdx] = useState(0);


  // ─── Per-member stats ────────────────────────────────────────────────────

  // Memoized: a full stat recompute per member is too costly to redo on every render
  const partyAllStats = useMemo(() => party.map((m, i) => recomputeStats(
    { mode: 'player', classKey: m.selectedClass, pointsSpent: m.pointsSpent, skillPointsSpent: m.skillPointsSpent, gearArmorBonus: getGearArmorBonus(m.gear) },
    [...(partyBuffs[i] ?? []), ...getGearBuffs(m.gear)],
  )), [party, partyBuffs]);

  // Alias for the leader — keeps most existing code unchanged
  const stats = partyAllStats[0];

  // Active party member (current turn in combat; always leader out of combat)
  const currentCombatant = getCurrentCombatant(combat);
  const isPlayerTurn = combat.active && currentCombatant?.isPlayer === true;
  const activePartyIdx = combat.active ? (currentCombatant?.partyIndex ?? 0) : barViewIdx;
  const activePartyPos = activePartyIdx === 0 ? playerPos : (followerPositions[activePartyIdx - 1] ?? playerPos);
  const activeStats = partyAllStats[activePartyIdx] ?? stats;
  const activeGear = party[activePartyIdx]?.gear ?? gear;
  const activeWeapon = activeGear.mainhand && isWeaponItem(activeGear.mainhand) ? activeGear.mainhand : null;
  const activeMp = partyMp[activePartyIdx] ?? 0;

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
  const partyTokens: PartyTokenData[] = party.map((m, i) => ({
    pos: partyPositions[i],
    classKey: m.selectedClass!,
    hp: partyHp[i] ?? partyAllStats[i].hp,
    maxHp: partyAllStats[i].hp,
    mp: partyMp[i] ?? partyAllStats[i].mp,
    maxMp: partyAllStats[i].mp,
    partyIndex: i,
  })).filter(t => t.partyIndex === 0 || t.hp > 0);

  // Selected action, normalised (weapon folded in) — drives map targeting and range
  const activeAction = activeAbility ? toAction(activeAbility, activeWeapon) : null;

  // ─── Refs ────────────────────────────────────────────────────────────────

  const enemiesRef = useRef(enemies);
  enemiesRef.current = enemies;
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const currentZoneRef = useRef(currentZone);
  currentZoneRef.current = currentZone;
  const partyHotsRef = useRef(partyHots);
  partyHotsRef.current = partyHots;
  const partyDotsRef = useRef(partyDots);
  partyDotsRef.current = partyDots;
  const followerPositionsRef = useRef(followerPositions);
  followerPositionsRef.current = followerPositions;

  // Party-wide refs for enemy AI targeting
  const partyPosRef = useRef<Pos[]>([]);
  partyPosRef.current = partyPositions;
  const partyStatsRef = useRef(partyAllStats);
  partyStatsRef.current = partyAllStats;
  const partyHpRef = useRef(partyHp);
  partyHpRef.current = partyHp;
  const partyMpRef = useRef(partyMp);
  partyMpRef.current = partyMp;
  const partyNamesRef = useRef(party.map(m => m.characterName));
  partyNamesRef.current = party.map(m => m.characterName);
  const partyThreatRef = useRef(combat.partyThreat);
  partyThreatRef.current = combat.partyThreat;
  const dungeonRef = useRef(dungeon);
  dungeonRef.current = dungeon;
  const applyOutcomeRef = useRef<(outcome: ActionOutcome, caster: CombatUnit) => void>(() => {});

  // ─── HP/MP init ──────────────────────────────────────────────────────────

  const hpKey = partyAllStats.map(s => s.hp).join(',');
  const mpKey = partyAllStats.map(s => s.mp).join(',');

  // Initialize to full on first load only — no auto-restore on combat end
  useEffect(() => {
    setPartyHp(partyAllStats.map(s => s.hp));
    setPartyMp(partyAllStats.map(s => s.mp));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Clamp HP/MP to effective max whenever stats change (buff expiry, gear swap)
  useEffect(() => {
    if (partyHp.length === 0) return;
    setPartyHp(prev => prev.map((hp, i) => Math.min(hp, partyAllStats[i]?.hp ?? hp)));
    setPartyMp(prev => prev.map((mp, i) => Math.min(mp, partyAllStats[i]?.mp ?? mp)));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hpKey, mpKey]);

  // Sync barViewIdx to active party member during combat
  useEffect(() => {
    if (combat.active) setBarViewIdx(activePartyIdx);
  }, [combat.active, activePartyIdx]);

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'i' || e.key === 'I') { setShowCharSheet(prev => !prev); return; }
      if (e.key !== 'Escape') return;
      if (showCharSheet) { setShowCharSheet(false); return; }
      if (activeSlot !== null) clearActiveSlot();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCharSheet, activeSlot, activePartyIdx]);

  // ─── Round tick (top of each combat round; on a timer out of combat) ─────
  // Party members and enemies both go through tickRound: regen, HoT heals, DoT damage after DR.

  const applyRoundTick = useCallback(() => {
    const threatGain = new Map<number, number>();
    const addThreat = (i: number, raw: number) => {
      if (raw > 0) threatGain.set(i, (threatGain.get(i) ?? 0) + raw * (partyStatsRef.current[i]?.threatMultiplier ?? 1));
    };
    const showTick = (pos: Pos, tick: RoundTick) => {
      if (tick.heal > 0) spawnFloat(pos.x, pos.y, `+${tick.heal}`, 'green');
      if (tick.dotDamage > 0) spawnFloat(pos.x, pos.y, `-${tick.dotDamage}`, 'purple');
      for (const [i, dmg] of tick.dotSources) addThreat(i, dmg);
    };

    // Dead members don't tick
    const ticks = partyHpRef.current.map((hp, i) => {
      if (hp <= 0) return null;
      const tick = tickRound(partyStatsRef.current[i], hp, partyMpRef.current[i] ?? 0, partyHotsRef.current[i] ?? [], partyDotsRef.current[i] ?? []);
      showTick(partyPosRef.current[i], tick);
      addThreat(i, tick.heal * 1.5);
      return tick;
    });
    setPartyHp(prev => prev.map((hp, i) => ticks[i]?.hp ?? hp));
    setPartyMp(prev => prev.map((mp, i) => ticks[i]?.mp ?? mp));
    setPartyBuffs(prev => prev.map(tickDurations));
    setPartyHots(prev => prev.map(tickDurations));
    setPartyDots(prev => prev.map(tickDurations));

    const { enemies: updated, events } = applyTopOfRound(enemiesRef.current);
    for (const { pos, tick } of events) showTick(pos, tick);
    setEnemies(updated);

    if (threatGain.size > 0) {
      setCombat(prev => ({ ...prev, partyThreat: prev.partyThreat.map((t, i) => t + (threatGain.get(i) ?? 0)) }));
    }
  }, [spawnFloat]);

  useEffect(() => {
    if (combat.round > 1) applyRoundTick();
  }, [combat.round]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Location transitions ──────────────────────────────────────────────

  /** Bring any member at 0 HP/MP back to 10% (TPK, portal return, end of combat, out of combat). */
  const reviveDowned = useCallback(() => {
    const tenPercent = (max: number | undefined) => Math.max(1, Math.floor((max ?? 10) * 0.1));
    setPartyHp(prev => prev.map((hp, i) => hp <= 0 ? tenPercent(partyStatsRef.current[i]?.hp) : hp));
    setPartyMp(prev => prev.map((mp, i) => mp <= 0 ? tenPercent(partyStatsRef.current[i]?.mp) : mp));
  }, []);

  const handleLocationChange = (next: 'sanctum' | 'dungeon') => {
    reviveDowned();
    setLocation(next);
    setCombat(INITIAL_COMBAT);
    clearFloats();
    setPartyBuffs(party.map(() => []));
    setPartyHots(party.map(() => []));
    setPartyDots(party.map(() => []));

    if (next === 'dungeon') {
      const config = DUNGEON_PRESETS.crypt;
      const d = generateDungeon(config);
      setDungeon(d);
      setCurrentZone(d.startZoneId);
      setPlayerPos(d.playerStart);
      setEnemies(spawnDungeonEnemies(d, config));
      setFollowerPositions(findFollowerSpawns(d.playerStart, d.zones[d.startZoneId].floors, 2));
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
    if (partyHp.length === 0) return;
    if (partyHp.every(hp => hp <= 0)) {
      handleLocationChange('sanctum');
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
    clearActiveSlot();
    setCombat(prev => advanceTurn(prev, zoneEnemies, partyAllStats.map(s => s.movement), deadPartyIndices(partyHp)));
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
  }, [party]);

  // ─── Door transitions ─────────────────────────────────────────────────

  const handleDoorClick = useCallback((doorId: string) => {
    if (!zone || !dungeon || combat.active) return;

    const door = zone.doors.find(d => d.id === doorId);
    if (!door) return;

    const targetZone = dungeon.zones[door.targetZoneId];
    const pairedDoor = targetZone.doors.find(d => d.id === door.targetDoorId);
    if (!pairedDoor) return;

    // Arrive on the first floor tile next to the paired door
    const spawnPos = findOpenTilesNear(pairedDoor.pos, p => targetZone.floors.has(posKey(p)), 1, 1)[0];
    if (!spawnPos) return;

    setCurrentZone(door.targetZoneId);
    setPlayerPos(spawnPos);
    setFollowerPositions(findFollowerSpawns(spawnPos, targetZone.floors, 2));
    clearFloats();

    triggerAggro(spawnPos, enemies.filter(e => e.zoneId === door.targetZoneId), targetZone.floors, false);
  }, [zone, dungeon, combat.active, enemies, triggerAggro]);

  // Out-of-combat regen tick
  useEffect(() => {
    if (combat.active) return;
    const id = setInterval(applyRoundTick, OUT_OF_COMBAT_REGEN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [combat.active, applyRoundTick]);

  // ─── Loot pickup ─────────────────────────────────────────────────────────

  /** Replace the current zone's data in the dungeon (e.g. its dropped items). */
  const updateCurrentZone = useCallback((fn: (z: ZoneData) => ZoneData) => {
    setDungeon(prev => prev ? { ...prev, zones: prev.zones.map((z, i) => i === currentZoneRef.current ? fn(z) : z) } : null);
  }, []);

  const handleLootPickup = useCallback((pos: Pos) => {
    if (!zone) return;
    const key = posKey(pos);
    const items = zone.droppedItems[key];
    if (!items?.length) return;

    let newInventory = inventory;
    let pickedCount = 0;
    for (const item of items) {
      if (isFull(newInventory)) break;
      newInventory = addItem(newInventory, item);
      pickedCount++;
    }

    if (pickedCount === 0) {
      spawnFloat(pos.x, pos.y, 'Inventory Full', '#ef4444');
      return;
    }

    const remaining = items.slice(pickedCount);
    setInventory(newInventory);
    updateCurrentZone(z => ({
      ...z,
      droppedItems: remaining.length > 0
        ? { ...z.droppedItems, [key]: remaining }
        : Object.fromEntries(Object.entries(z.droppedItems).filter(([k]) => k !== key)),
    }));
    spawnFloat(pos.x, pos.y, '+', '#facc15');
  }, [zone, inventory, spawnFloat, updateCurrentZone]);

  const lootPickupRef = useRef(handleLootPickup);
  lootPickupRef.current = handleLootPickup;

  /** Apply an inventory/gear change for one party member (equip or unequip). */
  const applyGearChange = useCallback((charIdx: number, change: { inventory: Inventory; gear: GearSlots }) => {
    setInventory(change.inventory);
    setParty(party.map((m, i) => i === charIdx ? { ...m, gear: change.gear } : m));
  }, [party, setParty]);

  const handleEquipItem = useCallback((inventoryIdx: number, charIdx: number) => {
    const member = party[charIdx];
    if (!member?.selectedClass || !canEquip(CLASSES[member.selectedClass], inventory[inventoryIdx])) return;
    applyGearChange(charIdx, equipFromInventory(inventory, member.gear, inventoryIdx));
  }, [inventory, party, applyGearChange]);

  const handleUnequipItem = useCallback((slot: GearSlot, charIdx: number) => {
    const member = party[charIdx];
    if (!member || !canUnequip(inventory, member.gear, slot)) return;
    applyGearChange(charIdx, unequipToInventory(inventory, member.gear, slot));
  }, [inventory, party, applyGearChange]);

  // ─── Movement handler ────────────────────────────────────────────────────

  const handleMove = useCallback((newPos: Pos) => {
    if (combat.active) {
      if (!isPlayerTurn) return;
      const distance = chebyshev(activePartyPos, newPos);
      if (distance > combat.movementRemaining) return;

      if (activePartyIdx === 0) {
        setPlayerPos(newPos);
        lootPickupRef.current(newPos);
      } else {
        setFollowerPositions(prev => prev.map((p, i) => i === activePartyIdx - 1 ? newPos : p));
      }

      setCombat(prev => ({
        ...prev,
        movementRemaining: prev.movementRemaining - distance,
      }));
    } else {
      const { f1, f2 } = computeFollowerPositions(
        newPos,
        playerPos,
        followerPositionsRef.current[0],
        followerPositionsRef.current[1],
        partyStatsRef.current[1]?.movement ?? 3,
        partyStatsRef.current[2]?.movement ?? 3,
        zone ? (p => zone.floors.has(posKey(p))) : isSanctumWalkable,
      );
      setPlayerPos(newPos);
      setFollowerPositions([f1, f2]);
      lootPickupRef.current(newPos);
    }

    if (zone) triggerAggro(newPos, zoneEnemies, zone.floors, combat.active);
  }, [combat.active, combat.movementRemaining, isPlayerTurn, activePartyIdx, activePartyPos, playerPos, zoneEnemies, zone, triggerAggro]);

  // ─── End turn ────────────────────────────────────────────────────────────

  const handleEndTurn = useCallback(() => {
    if (!combat.active || !isPlayerTurn) return;
    clearActiveSlot();
    setCombat(prev => advanceTurn(prev, zoneEnemies, partyAllStats.map(s => s.movement), deadPartyIndices(partyHp)));
  }, [combat.active, isPlayerTurn, activePartyIdx, zoneEnemies, partyAllStats, partyHp]);

  // ─── Action outcomes (shared by party and enemy actions) ─────────────────

  const applyActionOutcome = useCallback((outcome: ActionOutcome, caster: CombatUnit) => {
    for (const f of outcome.floats) spawnFloat(f.pos.x, f.pos.y, f.text, f.color);

    const partyChanges = new Map<number, UnitChange>();
    const enemyChanges = new Map<string, UnitChange>();
    for (const c of outcome.changes) {
      if (c.ref.side === 'party') partyChanges.set(c.ref.idx, c);
      else enemyChanges.set(c.ref.id, c);
    }
    const nextHp = (hp: number, c: UnitChange, maxHp: number) => Math.max(0, Math.min(maxHp, hp - c.damage + c.heal));

    if (partyChanges.size > 0) {
      const mapParty = <T,>(prev: T[], fn: (v: T, c: UnitChange, i: number) => T) =>
        prev.map((v, i) => { const c = partyChanges.get(i); return c ? fn(v, c, i) : v; });
      setPartyHp(prev => mapParty(prev, (hp, c, i) => nextHp(hp, c, partyStatsRef.current[i]?.hp ?? hp)));
      setPartyMp(prev => mapParty(prev, (mp, c) => Math.max(0, mp - c.mpSpent)));
      setPartyBuffs(prev => mapParty(prev, (list, c) => c.buffs.length ? [...list, ...c.buffs] : list));
      setPartyHots(prev => mapParty(prev, (list, c) => c.hots.length ? [...list, ...c.hots] : list));
      setPartyDots(prev => mapParty(prev, (list, c) => c.dots.length ? [...list, ...c.dots] : list));
    }

    if (enemyChanges.size > 0) {
      // Loot for enemies killed by this action
      const d = dungeonRef.current;
      const newDrops: Record<string, Item[]> = {};
      for (const e of enemiesRef.current) {
        const c = enemyChanges.get(e.id);
        if (!d || !c || e.currentHp <= 0 || nextHp(e.currentHp, c, e.stats.hp) > 0) continue;
        const item = generateLootDrop(d.baseEnemyLevel, e.classData.dropChance);
        if (item) {
          const key = posKey(e.pos);
          newDrops[key] = [...(newDrops[key] ?? []), item];
        }
      }
      if (Object.keys(newDrops).length > 0) {
        updateCurrentZone(z => {
          const merged = { ...z.droppedItems };
          for (const [k, items] of Object.entries(newDrops)) merged[k] = [...(merged[k] ?? []), ...items];
          return { ...z, droppedItems: merged };
        });
      }

      setEnemies(prev => prev.map(e => {
        const c = enemyChanges.get(e.id);
        if (!c) return e;
        const next = c.buffs.length ? withEnemyBuffs(e, [...e.buffs, ...c.buffs]) : e;
        return {
          ...next,
          currentHp: nextHp(e.currentHp, c, next.stats.hp),
          currentMp: Math.max(0, e.currentMp - c.mpSpent),
          hots: [...e.hots, ...c.hots],
          dots: [...e.dots, ...c.dots],
        };
      }));
    }

    if (caster.ref.side === 'party' && outcome.threat > 0) {
      const idx = caster.ref.idx;
      const gained = outcome.threat * caster.stats.threatMultiplier;
      setCombat(prev => prev.active
        ? { ...prev, partyThreat: prev.partyThreat.map((t, i) => i === idx ? t + gained : t) }
        : prev);
    }
  }, [spawnFloat, updateCurrentZone]);
  applyOutcomeRef.current = applyActionOutcome;

  // ─── Player action ───────────────────────────────────────────────────────

  const handlePlayerAttack = useCallback((targetPos: Pos) => {
    if (combat.active && (!isPlayerTurn || combat.playerActedThisTurn)) return;

    const action = activeAction;
    if (!action || activeMp < action.mpCost) return;

    const isAt = (p: Pos) => samePos(p, targetPos);
    const partyUnit = (i: number): CombatUnit => ({
      ref: { side: 'party', idx: i },
      name: party[i]?.characterName ?? `Party[${i}]`,
      stats: partyAllStats[i] ?? activeStats,
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

    applyActionOutcome(executeAction(caster, action, targets), caster);
    clearActiveSlot();
    if (combat.active) setCombat(prev => ({ ...prev, playerActedThisTurn: true }));
  }, [combat.active, isPlayerTurn, combat.playerActedThisTurn, activePartyIdx, activeAction, zoneEnemies, activePartyPos, activeMp, activeStats, partyAllStats, partyPositions, party, zone, applyActionOutcome]);

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
  }, [combat.active, zoneEnemies]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const activeTarget = activeAction?.target ?? null;
  const isSupportAction = !!activeAction?.effects.some(e => e.type === 'heal' || e.type === 'buff' || e.type === 'hot');

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col overflow-hidden">
      <TopBar
        stats={stats}
        location={location}
        zone={zone}
        party={party}
        partyAllStats={partyAllStats}
        partyHp={partyHp}
        partyMp={partyMp}
        combat={combat}
        activePartyIdx={activePartyIdx}
        zoneEnemies={zoneEnemies}
        onShowCharSheet={() => setShowCharSheet(true)}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {location === 'sanctum' && (
            <SanctumMap
              playerPos={playerPos}
              activeMoverPos={playerPos}
              party={partyTokens}
              movement={stats.movement}
              onMove={handleMove}
              onLocationChange={handleLocationChange}
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
              movement={combat.active ? combat.movementRemaining : activeStats.movement}
              onMove={handleMove}
              onLocationChange={handleLocationChange}
              onDoorClick={handleDoorClick}
              activeTarget={activeTarget}
              activeAbilityArea={activeAction?.area}
              aoeHighlightColor={isSupportAction ? 'green' : 'red'}
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
              floorColor={DUNGEON_PRESETS.crypt.floorColor}
              wallColor={DUNGEON_PRESETS.crypt.wallColor}
              enemyAoePreviewTiles={enemyAoePreview?.tiles}
              enemyTargetPartyIdx={enemyTargetPartyIdx}
              droppedItems={zone?.droppedItems}
              onLootClick={handleLootPickup}
            />
          )}
        </div>
      </div>

      <BottomBar
        party={party}
        partySlots={partySlots}
        partyActiveSlot={partyActiveSlot}
        partyAllStats={partyAllStats}
        barViewIdx={barViewIdx}
        setBarViewIdx={setBarViewIdx}
        onSlotsChange={(i, slots) => setPartySlots(prev => prev.map((s, idx) => idx === i ? slots : s))}
        onActiveSlotChange={(i, slot) => setPartyActiveSlot(prev => prev.map((s, idx) => idx === i ? slot : s))}
        combat={combat}
        activePartyIdx={activePartyIdx}
        currentCombatant={currentCombatant}
        activeStats={activeStats}
        isPlayerTurn={isPlayerTurn}
        onEndTurn={handleEndTurn}
      />

      {showCharSheet && (
        <CharacterSheet
          party={party}
          partyHp={partyHp}
          partyStats={partyAllStats}
          inventory={inventory}
          onClose={() => setShowCharSheet(false)}
          onEquipItem={handleEquipItem}
          onUnequipItem={handleUnequipItem}
        />
      )}
    </div>
  );
}

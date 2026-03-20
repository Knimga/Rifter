import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

import { CLASSES, type Effect, type AreaType } from '../data/classes';
import { ATTRIBUTE_KEYS, type AttributeKey, type ActiveBuff, type ActiveHot, type ActiveDot, type BuffableStat } from '../data/stats';
import { calculateStats, applyStatBuffs } from '../data/stats';
import { getGearArmorBonus, isWeaponItem, PHYSICAL_ELEMENTS, generateLootDrop, type AttackCategory, type DamageElement, type Item } from '../data/gear';
import { isFull, addItem, removeItem, type Inventory } from '../data/inventory';
import { DAMAGE_ELEMENT_COLOR, OUT_OF_COMBAT_REGEN_INTERVAL_MS } from '../data/constants';
import type { PartyMemberConfig } from '../data/party';
import type { EnemyInstance } from '../data/enemies';
import { applyBuffToEnemy } from '../data/enemies';
import { chebyshev, hasLineOfSight, getAffectedTiles } from '../data/dungeonHelpers';
import { generateDungeon, spawnDungeonEnemies, type DungeonData } from '../data/dungeonGen';
import { DUNGEON_PRESETS } from '../data/dungeonPresets';
import { startCombat, joinCombat, advanceTurn, applyTopOfRound, getCurrentCombatant, type CombatState } from '../data/combat';
import { resolveAttack, applyDR } from '../data/attackResolution';
import { findFollowerSpawns, computeFollowerPositions } from '../data/movementHelpers';
import { useEnemyTurn, type EnemyAoePreview } from '../hooks/useEnemyTurn';
import { useFloatingText } from '../hooks/useFloatingText';

import CharacterSheet from '../components/CharacterSheet';
import SanctumMap from '../components/SanctumMap';
import DungeonMap from '../components/DungeonMap';
import TopBar from '../components/TopBar';
import BottomBar from '../components/BottomBar';
import { type SlotContent } from '../components/ActionBar';

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
  const { selectedClass: selectedClassOrNull, gear } = party[0];
  const selectedClass = selectedClassOrNull!; // guaranteed non-null by canStart check
  const [location, setLocation] = useState<'sanctum' | 'dungeon'>('sanctum');
  const [playerPos, setPlayerPos] = useState({ x: 5, y: 5 });
  const [enemies, setEnemies] = useState<EnemyInstance[]>([]);
  const [combat, setCombat] = useState<CombatState>(INITIAL_COMBAT);
  const { floatingTexts, spawnFloat, removeFloat, clearFloats, spawnFloatRef } = useFloatingText();
  const [showCharSheet, setShowCharSheet] = useState(false);
  const [dungeon, setDungeon] = useState<DungeonData | null>(null);
  const [enemyAoePreview, setEnemyAoePreview] = useState<EnemyAoePreview | null>(null);
  const [enemyTargetPartyIdx, setEnemyTargetPartyIdx] = useState<number | null>(null);
  const [currentZone, setCurrentZone] = useState(0);
  const [followerPositions, setFollowerPositions] = useState([{ x: 6, y: 5 }, { x: 7, y: 5 }]);
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

  const partyAllStats = party.map((m, i) => {
    const memberBuffs = partyBuffs[i] ?? [];
    const attrBuffs = memberBuffs.reduce((acc, b) => {
      if ((ATTRIBUTE_KEYS as string[]).includes(b.stat)) {
        const k = b.stat as AttributeKey;
        acc[k] = (acc[k] ?? 0) + b.amount;
      }
      return acc;
    }, {} as Partial<Record<AttributeKey, number>>);
    return applyStatBuffs(
      calculateStats({ mode: 'player', classKey: m.selectedClass, pointsSpent: m.pointsSpent, skillPointsSpent: m.skillPointsSpent, gearArmorBonus: getGearArmorBonus(m.gear), attrBuffs }),
      memberBuffs,
    );
  });

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

  // Current zone data
  const zone = dungeon?.zones[currentZone] ?? null;
  const zoneEnemies = enemies.filter(e => e.zoneId === currentZone);
  const portalPos = dungeon && currentZone === dungeon.endZoneId ? dungeon.portalPos : null;

  // Follower data for map rendering (Phase 3: real HP from partyHp)
  const partyFollowers = party.slice(1).map((m, i) => {
    return {
      pos: followerPositions[i] ?? followerPositions[0],
      classKey: m.selectedClass!,
      hp: partyHp[i + 1] ?? 0,
      maxHp: partyAllStats[i + 1]?.hp ?? 1,
      mp: partyMp[i + 1] ?? 0,
      maxMp: partyAllStats[i + 1]?.mp ?? 1,
      partyIndex: i + 1,
    };
  }).filter(f => f.hp > 0); // hide dead members

  // ─── Refs ────────────────────────────────────────────────────────────────

  const enemiesRef = useRef(enemies);
  enemiesRef.current = enemies;
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const currentZoneRef = useRef(currentZone);
  currentZoneRef.current = currentZone;
  const partyBuffsRef = useRef(partyBuffs);
  partyBuffsRef.current = partyBuffs;
  const partyHotsRef = useRef(partyHots);
  partyHotsRef.current = partyHots;
  const partyDotsRef = useRef(partyDots);
  partyDotsRef.current = partyDots;
  const followerPositionsRef = useRef(followerPositions);
  followerPositionsRef.current = followerPositions;

  // Party-wide refs for enemy AI targeting
  const partyPosRef = useRef<{ x: number; y: number }[]>([]);
  partyPosRef.current = [playerPos, ...followerPositions];
  const partyStatsRef = useRef(partyAllStats);
  partyStatsRef.current = partyAllStats;
  const partyHpRef = useRef(partyHp);
  partyHpRef.current = partyHp;
  const partyThreatRef = useRef(combat.partyThreat);
  partyThreatRef.current = combat.partyThreat;
  const playerPosRef = useRef(playerPos); // kept for floating text in leader context
  playerPosRef.current = playerPos;

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
      if (e.key !== 'Escape') return;
      if (showCharSheet) { setShowCharSheet(false); return; }
      if (activeSlot !== null) setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCharSheet, activeSlot, activePartyIdx]);

  // ─── Top-of-round effects ─────────────────────────────────────────────────

  useEffect(() => {
    if (combat.round <= 1) return;

    // Per-member buff expiry, HoT ticks, regen
    party.forEach((_, i) => {
      const s = partyStatsRef.current[i] ?? partyStatsRef.current[0];
      const memberBuffs = partyBuffsRef.current[i] ?? [];
      const memberHots = partyHotsRef.current[i] ?? [];

      // Buff expiry
      setPartyBuffs(prev => prev.map((buffs, idx) =>
        idx === i
          ? buffs.map(b => ({ ...b, roundsRemaining: b.roundsRemaining - 1 })).filter(b => b.roundsRemaining > 0)
          : buffs
      ));

      // HoT ticks
      if (memberHots.length > 0) {
        const totalHotHeal = memberHots.reduce((sum, h) => sum + h.healPerRound + Math.floor(s.healing / 2), 0);
        if (totalHotHeal > 0) {
          setPartyHp(prev => prev.map((hp, idx) => idx === i ? Math.min(s.hp, hp + totalHotHeal) : hp));
          const pos = partyPosRef.current[i] ?? partyPosRef.current[0];
          spawnFloat(pos.x, pos.y, `+${totalHotHeal}`, 'green');
          // HoT threat
          const hotThreat = totalHotHeal * 1.5 * (partyStatsRef.current[i]?.threatMultiplier ?? 1);
          setCombat(prev => ({
            ...prev,
            partyThreat: prev.partyThreat.map((t, idx) => idx === i ? t + hotThreat : t),
          }));
        }
        setPartyHots(prev => prev.map((hots, idx) =>
          idx === i
            ? hots.map(h => ({ ...h, roundsRemaining: h.roundsRemaining - 1 })).filter(h => h.roundsRemaining > 0)
            : hots
        ));
      }

      // DoT ticks
      const memberDots = partyDotsRef.current[i] ?? [];
      if (memberDots.length > 0) {
        const totalDotDamage = memberDots.reduce((sum, d) => sum + d.damagePerRound, 0);
        if (totalDotDamage > 0) {
          setPartyHp(prev => prev.map((hp, idx) => idx === i ? Math.max(0, hp - totalDotDamage) : hp));
          const pos = partyPosRef.current[i] ?? partyPosRef.current[0];
          spawnFloat(pos.x, pos.y, `-${totalDotDamage}`, 'purple');
        }
        setPartyDots(prev => prev.map((dots, idx) =>
          idx === i
            ? dots.map(d => ({ ...d, roundsRemaining: d.roundsRemaining - 1 })).filter(d => d.roundsRemaining > 0)
            : dots
        ));
      }

      // Regen
      setPartyHp(prev => prev.map((hp, idx) => idx === i ? Math.min(s.hp, hp + s.hpRegen) : hp));
      setPartyMp(prev => prev.map((mp, idx) => idx === i ? Math.min(s.mp, mp + s.mpRegen) : mp));

      // Suppress unused-var warnings — memberBuffs consumed by setPartyBuffs above
      void memberBuffs;
    });

    // Enemy regen, buff expiry, DoT ticks
    const dotThreatDelta = new Map<number, number>();
    setEnemies(prev => {
      const { enemies: updated, dotTicks } = applyTopOfRound(prev);
      for (const tick of dotTicks) {
        spawnFloat(tick.pos.x, tick.pos.y, `-${tick.damage}`, 'purple');
        for (const { partyIdx, damage } of tick.threatSources) {
          dotThreatDelta.set(partyIdx, (dotThreatDelta.get(partyIdx) ?? 0) + damage);
        }
      }
      return updated;
    });
    if (dotThreatDelta.size > 0) {
      setCombat(prev => ({
        ...prev,
        partyThreat: prev.partyThreat.map((t, i) =>
          t + (dotThreatDelta.get(i) ?? 0) * (partyStatsRef.current[i]?.threatMultiplier ?? 1)
        ),
      }));
    }
  }, [combat.round, spawnFloat]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Location transitions ──────────────────────────────────────────────

  const handleLocationChange = (next: 'sanctum' | 'dungeon') => {
    // Revive any dead party members to 10% HP/MP (covers TPK and portal return)
    setPartyHp(prev => prev.map((hp, i) =>
      hp <= 0 ? Math.max(1, Math.floor((partyStatsRef.current[i]?.hp ?? 10) * 0.1)) : hp
    ));
    setPartyMp(prev => prev.map((mp, i) =>
      mp <= 0 ? Math.max(1, Math.floor((partyStatsRef.current[i]?.mp ?? 10) * 0.1)) : mp
    ));
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
      setPlayerPos({ x: 5, y: 5 });
      setFollowerPositions([{ x: 6, y: 5 }, { x: 7, y: 5 }]);
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
    if (!combat.active && partyHp.some(hp => hp <= 0)) {
      setPartyHp(prev => prev.map((hp, i) =>
        hp <= 0 ? Math.max(1, Math.floor((partyStatsRef.current[i]?.hp ?? 10) * 0.1)) : hp
      ));
      setPartyMp(prev => prev.map((mp, i) =>
        mp <= 0 ? Math.max(1, Math.floor((partyStatsRef.current[i]?.mp ?? 10) * 0.1)) : mp
      ));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [partyHp, combat.active]);

  // ─── Aggro detection ─────────────────────────────────────────────────────

  const findNewAggro = useCallback((pos: { x: number; y: number }, currentEnemies: EnemyInstance[], floors: Set<string>) => {
    return currentEnemies.filter(e =>
      e.currentHp > 0 && !e.aggroed &&
      chebyshev(pos, e.pos) <= AGGRO_RANGE &&
      hasLineOfSight(pos, e.pos, floors)
    );
  }, []);

  // ─── Door transitions ─────────────────────────────────────────────────

  const handleDoorClick = useCallback((doorId: string) => {
    if (!zone || !dungeon || combat.active) return;

    const door = zone.doors.find(d => d.id === doorId);
    if (!door) return;

    const targetZone = dungeon.zones[door.targetZoneId];
    const pairedDoor = targetZone.doors.find(d => d.id === door.targetDoorId);
    if (!pairedDoor) return;

    let spawnPos: { x: number; y: number } | null = null;
    for (let dx = -1; dx <= 1 && !spawnPos; dx++) {
      for (let dy = -1; dy <= 1 && !spawnPos; dy++) {
        if (dx === 0 && dy === 0) continue;
        const nx = pairedDoor.pos.x + dx;
        const ny = pairedDoor.pos.y + dy;
        if (targetZone.floors.has(`${nx},${ny}`)) {
          spawnPos = { x: nx, y: ny };
        }
      }
    }

    if (!spawnPos) return;

    setCurrentZone(door.targetZoneId);
    setPlayerPos(spawnPos);
    setFollowerPositions(findFollowerSpawns(spawnPos, targetZone.floors, 2));
    clearFloats();

    const newZoneEnemies = enemies.filter(e => e.zoneId === door.targetZoneId);
    const spotted = findNewAggro(spawnPos, newZoneEnemies, targetZone.floors);
    if (spotted.length > 0) {
      const aggroGroupIds = new Set(spotted.map(e => e.groupId));
      const newlyAggroed = newZoneEnemies.filter(e =>
        e.currentHp > 0 && !e.aggroed && aggroGroupIds.has(e.groupId)
      );
      const aggroIds = new Set(newlyAggroed.map(e => e.id));
      setEnemies(prev => prev.map(e => aggroIds.has(e.id) ? { ...e, aggroed: true } : e));
      setCombat(startCombat(party.map((m, i) => ({ stats: partyAllStats[i], name: m.characterName })), newlyAggroed));
    }
  }, [zone, dungeon, combat.active, enemies, findNewAggro, party, partyAllStats]);

  // ─── Out-of-combat tick (called on each leader step) ─────────────────────

  const applyMoveTick = useCallback(() => {
    party.forEach((_, i) => {
      const s = partyStatsRef.current[i] ?? partyStatsRef.current[0];
      const memberHots = partyHotsRef.current[i] ?? [];

      // Buff expiry
      setPartyBuffs(prev => prev.map((buffs, idx) =>
        idx === i
          ? buffs.map(b => ({ ...b, roundsRemaining: b.roundsRemaining - 1 })).filter(b => b.roundsRemaining > 0)
          : buffs
      ));

      // HoT ticks + expiry
      if (memberHots.length > 0) {
        const totalHotHeal = memberHots.reduce((sum, h) => sum + h.healPerRound + Math.floor(s.healing / 2), 0);
        if (totalHotHeal > 0) {
          setPartyHp(prev => prev.map((hp, idx) => idx === i ? Math.min(s.hp, hp + totalHotHeal) : hp));
          const pos = partyPosRef.current[i] ?? partyPosRef.current[0];
          spawnFloat(pos.x, pos.y, `+${totalHotHeal}`, 'green');
        }
        setPartyHots(prev => prev.map((hots, idx) =>
          idx === i
            ? hots.map(h => ({ ...h, roundsRemaining: h.roundsRemaining - 1 })).filter(h => h.roundsRemaining > 0)
            : hots
        ));
      }

      // HP/MP regen
      setPartyHp(prev => prev.map((hp, idx) => idx === i ? Math.min(s.hp, hp + s.hpRegen) : hp));
      setPartyMp(prev => prev.map((mp, idx) => idx === i ? Math.min(s.mp, mp + s.mpRegen) : mp));
    });

    // Enemy effect ticks (DoTs, buff/debuff expiry)
    setEnemies(prev => {
      const { enemies: updated, dotTicks } = applyTopOfRound(prev);
      for (const tick of dotTicks) {
        spawnFloat(tick.pos.x, tick.pos.y, `-${tick.damage}`, 'purple');
      }
      return updated;
    });
  }, [party, spawnFloat]); // eslint-disable-line react-hooks/exhaustive-deps

  // Out-of-combat regen tick
  useEffect(() => {
    if (combat.active) return;
    const id = setInterval(applyMoveTick, OUT_OF_COMBAT_REGEN_INTERVAL_MS);
    return () => clearInterval(id);
  }, [combat.active, applyMoveTick]);

  // ─── Loot pickup ─────────────────────────────────────────────────────────

  const handleLootPickup = useCallback((pos: { x: number; y: number }) => {
    if (!zone) return;
    const key = `${pos.x},${pos.y}`;
    const item = zone.droppedItems[key];
    if (!item) return;
    if (isFull(inventory)) {
      spawnFloat(pos.x, pos.y, 'Inventory Full', '#ef4444');
      return;
    }
    setInventory(prev => addItem(prev, item));
    setDungeon(prev => prev ? {
      ...prev,
      zones: prev.zones.map((z, i) => i === currentZone
        ? { ...z, droppedItems: Object.fromEntries(Object.entries(z.droppedItems).filter(([k]) => k !== key)) }
        : z
      ),
    } : null);
    spawnFloat(pos.x, pos.y, '+', '#facc15');
  }, [zone, inventory, currentZone, spawnFloat]);

  const lootPickupRef = useRef(handleLootPickup);
  lootPickupRef.current = handleLootPickup;

  const handleEquipItem = useCallback((inventoryIdx: number, charIdx: number) => {
    const item = inventory[inventoryIdx];
    if (!item) return;
    const slot = item.slot;
    const displaced = party[charIdx]?.gear[slot] ?? null;
    // Swap: remove from inventory, optionally add displaced item back
    setInventory(prev => {
      let next = removeItem(prev, inventoryIdx);
      if (displaced) next = addItem(next, displaced);
      return next;
    });
    setParty(party.map((m, i) =>
      i === charIdx ? { ...m, gear: { ...m.gear, [slot]: item } } : m
    ));
  }, [inventory, party, setParty]);

  // ─── Movement handler ────────────────────────────────────────────────────

  const handleMove = useCallback((newPos: { x: number; y: number }) => {
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
        zone?.floors ?? null,
      );
      setPlayerPos(newPos);
      setFollowerPositions([f1, f2]);
      lootPickupRef.current(newPos);
    }

    // Check for newly aggroed enemies
    if (!zone) return;
    const spotted = findNewAggro(newPos, zoneEnemies, zone.floors);
    if (spotted.length === 0) return;

    const aggroGroupIds = new Set(spotted.map(e => e.groupId));
    const newlyAggroed = zoneEnemies.filter(e =>
      e.currentHp > 0 && !e.aggroed && aggroGroupIds.has(e.groupId)
    );

    const aggroIds = new Set(newlyAggroed.map(e => e.id));
    setEnemies(prev => prev.map(e => aggroIds.has(e.id) ? { ...e, aggroed: true } : e));

    if (!combat.active) {
      setCombat(startCombat(party.map((m, i) => ({ stats: partyAllStats[i], name: m.characterName })), newlyAggroed));
    } else {
      setCombat(prev => joinCombat(prev, newlyAggroed));
    }
  }, [combat.active, combat.movementRemaining, isPlayerTurn, activePartyIdx, activePartyPos, playerPos, zoneEnemies, party, partyAllStats, zone, findNewAggro, applyMoveTick]);

  // ─── End turn ────────────────────────────────────────────────────────────

  const handleEndTurn = useCallback(() => {
    if (!combat.active || !isPlayerTurn) return;
    setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s));
    const partyMovements = partyAllStats.map(s => s.movement);
    const deadPartyIndices = new Set(partyHp.map((hp, i) => hp <= 0 ? i : -1).filter(i => i >= 0));
    setCombat(prev => advanceTurn(prev, zoneEnemies, partyMovements, deadPartyIndices));
  }, [combat.active, isPlayerTurn, activePartyIdx, zoneEnemies, partyAllStats, partyHp]);

  // ─── Player attack ──────────────────────────────────────────────────────

  const handlePlayerAttack = useCallback((targetPos: { x: number; y: number }) => {
    if (combat.active && (!isPlayerTurn || combat.playerActedThisTurn)) return;

    const activeContent = partySlots[activePartyIdx]?.[activeSlot ?? -1] ?? null;
    let attackCategory: AttackCategory;
    let damageElement: DamageElement;
    let minDamage: number;
    let maxDamage: number;
    let range: number;
    let area: AreaType | undefined;

    if (activeContent === 'weapon-attack') {
      if (!combat.active) { setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s)); return; }
      if (!activeWeapon) return;
      if (!zone) return;
      attackCategory = activeWeapon.attackCategory;
      damageElement = activeWeapon.damageElement;
      minDamage = activeWeapon.minDamage;
      maxDamage = activeWeapon.maxDamage;
      range = activeWeapon.range;
    } else if (activeContent && typeof activeContent === 'object') {
      if (activeMp < activeContent.mpCost) return;

      const effects = activeContent.effects;

      // Self-targeting: only fire when the player clicks their own tile
      if (activeContent.target === 'self') {
        if (targetPos.x !== activePartyPos.x || targetPos.y !== activePartyPos.y) {
          setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s));
          return;
        }
        let selfThreat = 0;
        for (const eff of effects.filter(e => e.appliesTo === 'caster')) {
          if (eff.type === 'damage') {
            const roll = Math.floor(Math.random() * (eff.maxDamage - eff.minDamage + 1)) + eff.minDamage;
            setPartyHp(prev => prev.map((hp, i) => i === activePartyIdx ? Math.max(0, hp - roll) : hp));
            spawnFloat(activePartyPos.x, activePartyPos.y, `-${roll}`, 'red');
          } else if (eff.type === 'heal') {
            const roll = Math.floor(Math.random() * (eff.maxHeal - eff.minHeal + 1)) + eff.minHeal;
            const healAmount = Math.max(0, roll + activeStats.healing);
            setPartyHp(prev => prev.map((hp, i) => i === activePartyIdx ? Math.min(activeStats.hp, hp + healAmount) : hp));
            if (healAmount > 0) spawnFloat(activePartyPos.x, activePartyPos.y, `+${healAmount}`, 'green');
            selfThreat += healAmount * 1.5;
          } else if (eff.type === 'hot') {
            setPartyHots(prev => prev.map((hots, i) => i === activePartyIdx
              ? [...hots, { name: activeContent.name, damageElement: eff.damageElement, healPerRound: Math.floor(eff.healPerRound + activeStats.healing / 2), roundsRemaining: eff.rounds }]
              : hots));
            spawnFloat(activePartyPos.x, activePartyPos.y, '+HoT', 'green');
          } else if (eff.type === 'buff') {
            const newBuffs = (Object.entries(eff.stats) as [BuffableStat, number][]).map(([stat, amount]) => ({
              id: `${activeContent.name}-${stat}-player-${activePartyIdx}`,
              source: activeContent.name, damageElement: eff.damageElement,
              stat, amount, roundsRemaining: eff.rounds,
            }));
            const newPctBuffs = (Object.entries(eff.statsPercent ?? {}) as [BuffableStat, number][]).map(([stat, percent]) => ({
              id: `${activeContent.name}-${stat}-pct-player-${activePartyIdx}`,
              source: activeContent.name, damageElement: eff.damageElement,
              stat, amount: 0, percent, roundsRemaining: eff.rounds,
            }));
            setPartyBuffs(prev => prev.map((buffs, i) => i === activePartyIdx ? [...buffs, ...newBuffs, ...newPctBuffs] : buffs));
            spawnFloat(activePartyPos.x, activePartyPos.y, `${activeContent.name}!`, 'green');
            selfThreat += (Object.values(eff.stats) as number[]).reduce((s, v) => s + Math.abs(v), 0);
            selfThreat += (Object.values(eff.statsPercent ?? {}) as number[]).reduce((s, v) => s + Math.abs(v), 0);
          } else if (eff.type === 'threat') {
            selfThreat += eff.amount;
          }
        }
        setPartyMp(prev => prev.map((mp, i) => i === activePartyIdx ? mp - activeContent.mpCost : mp));
        setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s));
        if (combat.active) {
          const gained = selfThreat * activeStats.threatMultiplier;
          setCombat(prev => ({
            ...prev,
            playerActedThisTurn: true,
            partyThreat: gained > 0
              ? prev.partyThreat.map((t, i) => i === activePartyIdx ? t + gained : t)
              : prev.partyThreat,
          }));
        }
        return;
      }

      // Ally-targeting: fire on any party member tile, in or out of combat
      if (activeContent.target === 'ally') {
        let targetIdx: number | null = null;
        if (targetPos.x === playerPos.x && targetPos.y === playerPos.y) {
          targetIdx = 0;
        } else {
          const f = party.slice(1)
            .map((_, i) => ({ idx: i + 1, pos: followerPositionsRef.current[i] }))
            .find(({ pos }) => pos?.x === targetPos.x && pos?.y === targetPos.y);
          if (f) targetIdx = f.idx;
        }
        if (targetIdx === null) {
          setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s));
          return;
        }
        const targetMemberStats = partyAllStats[targetIdx] ?? activeStats;
        let allyThreat = 0;
        for (const eff of effects) {
          const effIdx = eff.appliesTo === 'target' ? targetIdx : activePartyIdx;
          const effStats = eff.appliesTo === 'target' ? targetMemberStats : activeStats;
          const effPos = effIdx === 0 ? playerPos : (followerPositionsRef.current[effIdx - 1] ?? playerPos);
          if (eff.type === 'heal') {
            const roll = Math.floor(Math.random() * (eff.maxHeal - eff.minHeal + 1)) + eff.minHeal;
            const healAmount = Math.max(0, roll + effStats.healing);
            setPartyHp(prev => prev.map((hp, i) => i === effIdx ? Math.min(effStats.hp, hp + healAmount) : hp));
            if (healAmount > 0) spawnFloat(effPos.x, effPos.y, `+${healAmount}`, 'green');
            allyThreat += healAmount * 1.5;
          } else if (eff.type === 'hot') {
            setPartyHots(prev => prev.map((hots, i) => i === effIdx
              ? [...hots, { name: activeContent.name, damageElement: eff.damageElement, healPerRound: Math.floor(eff.healPerRound + effStats.healing / 2), roundsRemaining: eff.rounds }]
              : hots));
            spawnFloat(effPos.x, effPos.y, '+HoT', 'green');
          } else if (eff.type === 'buff') {
            const newBuffs = (Object.entries(eff.stats) as [BuffableStat, number][]).map(([stat, amount]) => ({
              id: `${activeContent.name}-${stat}-player-${effIdx}`,
              source: activeContent.name, damageElement: eff.damageElement,
              stat, amount, roundsRemaining: eff.rounds,
            }));
            const newPctBuffs = (Object.entries(eff.statsPercent ?? {}) as [BuffableStat, number][]).map(([stat, percent]) => ({
              id: `${activeContent.name}-${stat}-pct-player-${effIdx}`,
              source: activeContent.name, damageElement: eff.damageElement,
              stat, amount: 0, percent, roundsRemaining: eff.rounds,
            }));
            setPartyBuffs(prev => prev.map((buffs, i) => i === effIdx ? [...buffs, ...newBuffs, ...newPctBuffs] : buffs));
            spawnFloat(effPos.x, effPos.y, `${activeContent.name}!`, 'green');
            allyThreat += (Object.values(eff.stats) as number[]).reduce((s, v) => s + Math.abs(v), 0);
            allyThreat += (Object.values(eff.statsPercent ?? {}) as number[]).reduce((s, v) => s + Math.abs(v), 0);
          } else if (eff.type === 'threat') {
            allyThreat += eff.amount;
          }
        }
        setPartyMp(prev => prev.map((mp, i) => i === activePartyIdx ? mp - activeContent.mpCost : mp));
        setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s));
        if (combat.active) {
          const gained = allyThreat * activeStats.threatMultiplier;
          setCombat(prev => ({
            ...prev,
            playerActedThisTurn: true,
            partyThreat: gained > 0
              ? prev.partyThreat.map((t, i) => i === activePartyIdx ? t + gained : t)
              : prev.partyThreat,
          }));
        }
        return;
      }

      // Enemy-targeting: only works in combat with a loaded zone
      if (!combat.active) { setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s)); return; }
      if (!zone) return;

      // Enemy-targeting: determine attack parameters
      const damageEffect = effects.find(e => e.type === 'damage' && e.appliesTo === 'target') as Extract<Effect, { type: 'damage' }> | undefined;
      const dotEffect    = effects.find(e => e.type === 'dot'    && e.appliesTo === 'target') as Extract<Effect, { type: 'dot' }>    | undefined;
      const debuffEffect = effects.find(e => e.type === 'debuff' && e.appliesTo === 'target') as Extract<Effect, { type: 'debuff' }> | undefined;
      const hasTargetHit = damageEffect || dotEffect || debuffEffect || activeContent.useWeapon;

      if (!hasTargetHit) return;

      if (activeContent.useWeapon) {
        if (!activeWeapon) return;
        attackCategory = activeWeapon.attackCategory;
        damageElement = activeWeapon.damageElement;
        minDamage = activeWeapon.minDamage;
        maxDamage = activeWeapon.maxDamage;
        range = activeContent.range;
        area = activeContent.area;
      } else {
        if (!activeContent.attackCategory) return;
        attackCategory = activeContent.attackCategory;
        damageElement = damageEffect?.damageElement ?? dotEffect?.damageElement ?? 'slashing';
        minDamage = damageEffect?.minDamage ?? 0;
        maxDamage = damageEffect?.maxDamage ?? 0;
        range = activeContent.range;
        area = activeContent.area;
      }
    } else {
      return;
    }

    // Range + LOS check on the target tile
    const distance = chebyshev(activePartyPos, targetPos);
    if (distance > range || !hasLineOfSight(activePartyPos, targetPos, zone.floors)) {
      setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s));
      return;
    }

    const affectedTiles = getAffectedTiles(activePartyPos, targetPos, area, zone.floors);
    const affectedSet = new Set(affectedTiles.map(t => `${t.x},${t.y}`));
    const targets = zoneEnemies.filter(e =>
      e.currentHp > 0 && affectedSet.has(`${e.pos.x},${e.pos.y}`)
    );

    if ((!area || area === 'single') && targets.length === 0) {
      setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s));
      return;
    }

    const atkStats = activeStats[attackCategory];
    const damages: { id: string; damage: number }[] = [];
    const dotTargets: string[] = [];
    const debuffTargets: string[] = [];

    // Pull effect refs for the post-loop enemy update (only defined for ability attacks)
    const abilityEffects = activeContent !== 'weapon-attack' && typeof activeContent === 'object' ? activeContent.effects : [];
    const abilityDotEffect   = abilityEffects.find(e => e.type === 'dot'    && e.appliesTo === 'target') as Extract<Effect, { type: 'dot' }>    | undefined;
    const abilityDebuffEffect = abilityEffects.find(e => e.type === 'debuff' && e.appliesTo === 'target') as Extract<Effect, { type: 'debuff' }> | undefined;
    // Extra on-hit damage effects for useWeapon abilities (e.g. Blessed Strike holy, Shadow Blade shadow)
    const abilityExtraDamageEffects = (typeof activeContent === 'object' && activeContent?.useWeapon)
      ? (abilityEffects.filter(e => e.type === 'damage' && e.appliesTo === 'target') as Extract<Effect, { type: 'damage' }>[])
      : [];
    const hasDamage = activeContent === 'weapon-attack' || (typeof activeContent === 'object' && (!!activeContent.useWeapon || abilityEffects.some(e => e.type === 'damage')));

    const attackerElStats = activeStats.elementalStats[damageElement];
    // Physical elements scale with attackCategory (melee/ranged); magical elements always use magic damage/pen.
    // Magic attackCategory applies magic damage/pen bonus to ALL elements, even physical.
    const isMagicRouted = !PHYSICAL_ELEMENTS.has(damageElement) || attackCategory === 'magic';
    const categoryDamage = isMagicRouted ? activeStats.magic.damage : atkStats.damage;
    const categoryPenetration = isMagicRouted ? activeStats.magic.penetration : atkStats.penetration;
    const elementDamage = attackerElStats?.damage ?? 0;
    const elementPenetration = attackerElStats?.penetration ?? 0;

    for (const enemy of targets) {
      const result = resolveAttack({
        hit: atkStats.hit,
        damageBonus: categoryDamage,
        critChance: atkStats.crit,
        minDamage,
        maxDamage,
        damageElement,
        targetDodge: enemy.stats.dodge,
        targetArmor: enemy.stats.armor,
        targetMagicResistance: enemy.stats.magicResistance,
        elementHit: attackerElStats?.hit,
        elementCrit: attackerElStats?.crit,
        elementDamage,
        targetElementResistance: enemy.stats.elementalStats[damageElement]?.resistance,
        categoryPenetration,
        elementPenetration,
      });

      const attackerLabel = party[activePartyIdx]?.characterName ?? `Party[${activePartyIdx}]`;
      const targetLabel = `${enemy.classData.name} (lv${enemy.level})`;
      if (!result.hit) {
        console.log(`[Combat] ${attackerLabel} → ${targetLabel}: MISS (${damageElement})`);
        spawnFloat(enemy.pos.x, enemy.pos.y, 'Missed!', 'white');
      } else if (result.dodged) {
        console.log(`[Combat] ${attackerLabel} → ${targetLabel}: DODGED (${damageElement})`);
        spawnFloat(enemy.pos.x, enemy.pos.y, 'Dodged!', 'white');
      } else {
        const hitType = result.crit ? 'CRIT' : 'HIT';
        const critText = result.crit ? ' CRIT!' : '';
        let totalFinalDamage = 0;

        if (hasDamage && result.finalDamage > 0) {
          totalFinalDamage += result.finalDamage;
          console.log(`[Combat] ${attackerLabel} → ${targetLabel}: ${hitType} ${result.finalDamage} (${damageElement}) | roll=${result.weaponRoll} +cat=${categoryDamage} +el=${elementDamage} raw=${result.rawDamage} -DR=${result.damageReduction}`);
          spawnFloat(enemy.pos.x, enemy.pos.y, `-${result.finalDamage}${critText}`, DAMAGE_ELEMENT_COLOR[damageElement]);
        } else {
          console.log(`[Combat] ${attackerLabel} → ${targetLabel}: ${hitType} (${damageElement})`);
        }

        for (const eff of abilityExtraDamageEffects) {
          const effEl = eff.damageElement;
          const effElStats = activeStats.elementalStats[effEl];
          const effCatDmg = (!PHYSICAL_ELEMENTS.has(effEl) || attackCategory === 'magic')
            ? activeStats.magic.damage
            : atkStats.damage;
          const effElDmg = effElStats?.damage ?? 0;
          let effRaw = (eff.minDamage + Math.floor(Math.random() * (eff.maxDamage - eff.minDamage + 1))) + effCatDmg + effElDmg;
          if (result.crit) effRaw *= 2;
          const effFinal = applyDR(effRaw, effEl, enemy.stats.armor, enemy.stats.magicResistance, enemy.stats.elementalStats[effEl]?.resistance);
          totalFinalDamage += effFinal;
          console.log(`[Combat] ${attackerLabel} → ${targetLabel}: +${effFinal}${critText} (${effEl}) | raw=${effRaw} -DR=${effRaw - effFinal}`);
          spawnFloat(enemy.pos.x, enemy.pos.y, `-${effFinal}${critText}`, DAMAGE_ELEMENT_COLOR[effEl]);
        }

        if (totalFinalDamage > 0) damages.push({ id: enemy.id, damage: totalFinalDamage });

        if (abilityDotEffect) {
          dotTargets.push(enemy.id);
          if (!hasDamage) spawnFloat(enemy.pos.x, enemy.pos.y, 'Hit!', 'purple');
        }
        if (abilityDebuffEffect) {
          debuffTargets.push(enemy.id);
        }
      }
    }

    if (damages.length > 0 || dotTargets.length > 0 || debuffTargets.length > 0) {
      const damageMap = new Map(damages.map(d => [d.id, d.damage]));
      const dotSet = new Set(dotTargets);
      const debuffSet = new Set(debuffTargets);
      setEnemies(prev => prev.map(e => {
        const dmg = damageMap.get(e.id);
        const addDot = dotSet.has(e.id) && abilityDotEffect;
        const addDebuff = debuffSet.has(e.id) && abilityDebuffEffect;
        if (!dmg && !addDot && !addDebuff) return e;
        let updated = {
          ...e,
          currentHp: dmg ? Math.max(0, e.currentHp - dmg) : e.currentHp,
          dots: addDot ? [...e.dots, {
            name: activeContent !== 'weapon-attack' && typeof activeContent === 'object' ? activeContent.name : undefined,
            damageElement: abilityDotEffect!.damageElement,
            damagePerRound: Math.floor(abilityDotEffect!.damagePerRound + (categoryDamage + elementDamage) / 2),
            roundsRemaining: abilityDotEffect!.rounds,
            sourcePartyIdx: activePartyIdx,
            armorPenetration: categoryPenetration,
            elementPenetration,
          }] : e.dots,
        };
        if (addDebuff) {
          const abilityName = activeContent !== 'weapon-attack' && typeof activeContent === 'object' ? activeContent.name : 'debuff';
          for (const [stat, amount] of Object.entries(abilityDebuffEffect!.stats) as [BuffableStat, number][]) {
            updated = applyBuffToEnemy(updated, {
              id: `${abilityName}-${stat}-${e.id}`,
              stat, amount: -Math.abs(amount), roundsRemaining: abilityDebuffEffect!.rounds,
            });
          }
          for (const [stat, pct] of Object.entries(abilityDebuffEffect!.statsPercent ?? {}) as [BuffableStat, number][]) {
            updated = applyBuffToEnemy(updated, {
              id: `${abilityName}-${stat}-pct-${e.id}`,
              stat, amount: 0, percent: -Math.abs(pct), roundsRemaining: abilityDebuffEffect!.rounds,
            });
          }
        }
        return updated;
      }));
    }

    // Check for kills and generate loot drops
    if (damages.length > 0 && dungeon) {
      const newDrops: Record<string, Item> = {};
      for (const { id, damage } of damages) {
        const enemy = enemies.find(e => e.id === id);
        if (enemy && enemy.currentHp > 0 && enemy.currentHp - damage <= 0) {
          const item = generateLootDrop(dungeon.baseEnemyLevel, enemy.classData.dropChance);
          if (item) newDrops[`${enemy.pos.x},${enemy.pos.y}`] = item;
        }
      }
      if (Object.keys(newDrops).length > 0) {
        setDungeon(prev => prev ? {
          ...prev,
          zones: prev.zones.map((z, i) => i === currentZone
            ? { ...z, droppedItems: { ...z.droppedItems, ...newDrops } }
            : z
          ),
        } : null);
      }
    }

    // Compute threat from this action: damage dealt + DoTs applied + debuffs applied
    let actionThreat = damages.reduce((sum, d) => sum + d.damage, 0);
    if (abilityDotEffect && dotTargets.length > 0) {
      // One tick's worth of threat per target at application; remaining threat accumulates per-tick via sourcePartyIdx
      actionThreat += abilityDotEffect.damagePerRound * dotTargets.length;
    }
    if (abilityDebuffEffect && debuffTargets.length > 0) {
      const debuffThreatPerTarget =
        (Object.values(abilityDebuffEffect.stats) as number[]).reduce((s, v) => s + Math.abs(v), 0) +
        (Object.values(abilityDebuffEffect.statsPercent ?? {}) as number[]).reduce((s, v) => s + Math.abs(v), 0);
      actionThreat += debuffThreatPerTarget * debuffTargets.length;
    }

    // Apply any caster effects from an enemy-targeting ability (e.g. drain life self-heal)
    if (activeContent !== 'weapon-attack' && typeof activeContent === 'object') {
      for (const eff of activeContent.effects.filter(e => e.appliesTo === 'caster')) {
        if (eff.type === 'heal') {
          const roll = Math.floor(Math.random() * (eff.maxHeal - eff.minHeal + 1)) + eff.minHeal;
          // Scale heal by number of enemies hit (e.g. drain life hitting 3 targets heals 3x)
          const healAmount = Math.max(0, roll + activeStats.healing) * Math.max(1, damages.length);
          setPartyHp(prev => prev.map((hp, i) => i === activePartyIdx ? Math.min(activeStats.hp, hp + healAmount) : hp));
          if (healAmount > 0) spawnFloat(activePartyPos.x, activePartyPos.y, `+${healAmount}`, 'green');
          actionThreat += healAmount * 1.5;
        } else if (eff.type === 'hot') {
          setPartyHots(prev => prev.map((hots, i) => i === activePartyIdx
            ? [...hots, { name: activeContent.name, damageElement: eff.damageElement, healPerRound: Math.floor(eff.healPerRound + activeStats.healing / 2), roundsRemaining: eff.rounds }]
            : hots));
        } else if (eff.type === 'buff') {
          const newBuffs = (Object.entries(eff.stats) as [BuffableStat, number][]).map(([stat, amount]) => ({
            id: `${activeContent.name}-${stat}-player-${activePartyIdx}`,
            source: activeContent.name, damageElement: eff.damageElement,
            stat, amount, roundsRemaining: eff.rounds,
          }));
          const newPctBuffs = (Object.entries(eff.statsPercent ?? {}) as [BuffableStat, number][]).map(([stat, percent]) => ({
            id: `${activeContent.name}-${stat}-pct-player-${activePartyIdx}`,
            source: activeContent.name, damageElement: eff.damageElement,
            stat, amount: 0, percent, roundsRemaining: eff.rounds,
          }));
          setPartyBuffs(prev => prev.map((buffs, i) => i === activePartyIdx ? [...buffs, ...newBuffs, ...newPctBuffs] : buffs));
          actionThreat += (Object.values(eff.stats) as number[]).reduce((s, v) => s + Math.abs(v), 0);
          actionThreat += (Object.values(eff.statsPercent ?? {}) as number[]).reduce((s, v) => s + Math.abs(v), 0);
        } else if (eff.type === 'threat') {
          actionThreat += eff.amount;
        }
      }
      setPartyMp(prev => prev.map((mp, i) => i === activePartyIdx ? mp - activeContent.mpCost : mp));
    }

    setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s));
    if (combat.active) {
      const gained = actionThreat * activeStats.threatMultiplier;
      setCombat(prev => ({
        ...prev,
        playerActedThisTurn: true,
        partyThreat: gained > 0
          ? prev.partyThreat.map((t, i) => i === activePartyIdx ? t + gained : t)
          : prev.partyThreat,
      }));
    }
  }, [combat.active, isPlayerTurn, combat.playerActedThisTurn, activePartyIdx, activeSlot, partySlots, activeWeapon, zoneEnemies, activePartyPos, activeMp, activeStats, zone, spawnFloat]);

  // ─── Enemy AI turn ───────────────────────────────────────────────────────

  const enemyTurnRefs = useMemo(() => ({
    enemies: enemiesRef,
    partyPos: partyPosRef,
    partyStats: partyStatsRef,
    partyHp: partyHpRef,
    partyThreat: partyThreatRef,
    zone: zoneRef,
    currentZone: currentZoneRef,
    spawnFloat: spawnFloatRef,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEnemyTurn(
    combat, currentCombatant,
    enemyTurnRefs,
    setEnemies, setPartyHp, setPartyBuffs, setCombat, setEnemyAoePreview, setEnemyTargetPartyIdx, setPartyDots,
  );

  // ─── Combat end detection ────────────────────────────────────────────────

  useEffect(() => {
    if (!combat.active) return;
    const allAggroedDead = zoneEnemies.filter(e => e.aggroed).every(e => e.currentHp <= 0);
    if (!allAggroedDead) return;
    // Revive dead party members to 10% HP/MP before clearing combat state
    setPartyHp(prev => prev.map((hp, i) =>
      hp <= 0 ? Math.max(1, Math.floor((partyStatsRef.current[i]?.hp ?? 10) * 0.1)) : hp
    ));
    setPartyMp(prev => prev.map((mp, i) =>
      mp <= 0 ? Math.max(1, Math.floor((partyStatsRef.current[i]?.mp ?? 10) * 0.1)) : mp
    ));
    setCombat(INITIAL_COMBAT);
  }, [combat.active, zoneEnemies]);

  // ─── Render ──────────────────────────────────────────────────────────────

  const actionRange =
    activeAbility === 'weapon-attack' ? activeWeapon?.range ?? 0
    : activeAbility && typeof activeAbility === 'object' ? activeAbility.range
    : 0;

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col overflow-hidden">
      <TopBar
        selectedClass={selectedClass}
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
        currentCombatant={currentCombatant}
        onShowCharSheet={() => setShowCharSheet(true)}
      />

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {location === 'sanctum' && (
            <SanctumMap
              selectedClass={selectedClass}
              playerPos={playerPos}
              activeMoverPos={playerPos}
              partyFollowers={partyFollowers}
              movement={stats.movement}
              onMove={handleMove}
              onLocationChange={handleLocationChange}
              activeAbility={activeAbility}
              isSelfTargetAbility={
                activeAbility !== null && activeAbility !== 'weapon-attack' &&
                typeof activeAbility === 'object' && activeAbility.target === 'self'
              }
              isAllyTargetAbility={
                activeAbility !== null && activeAbility !== 'weapon-attack' &&
                typeof activeAbility === 'object' && activeAbility.target === 'ally'
              }
              onAbilityUse={handlePlayerAttack}
              onAbilityDeselect={() => setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s))}
              onMemberSelect={(idx: number) => setBarViewIdx(idx)}
              playerHp={partyHp[0] ?? stats.hp}
              playerMaxHp={stats.hp}
              playerMp={partyMp[0] ?? stats.mp}
              playerMaxMp={stats.mp}
            />
          )}
          {location === 'dungeon' && zone && (
            <DungeonMap
              selectedClass={selectedClass}
              playerPos={playerPos}
              activeMoverPos={combat.active ? activePartyPos : playerPos}
              partyFollowers={partyFollowers}
              movement={combat.active ? combat.movementRemaining : activeStats.movement}
              onMove={handleMove}
              onLocationChange={handleLocationChange}
              onDoorClick={handleDoorClick}
              activeAbility={activeAbility}
              isSelfTargetAbility={
                activeAbility !== null && activeAbility !== 'weapon-attack' &&
                typeof activeAbility === 'object' && activeAbility.target === 'self'
              }
              isAllyTargetAbility={
                activeAbility !== null && activeAbility !== 'weapon-attack' &&
                typeof activeAbility === 'object' && activeAbility.target === 'ally'
              }
              activeAbilityArea={
                activeAbility && typeof activeAbility === 'object' ? activeAbility.area : undefined
              }
              aoeHighlightColor={
                activeAbility && typeof activeAbility === 'object' &&
                activeAbility.effects.some(e => e.type === 'heal' || e.type === 'buff' || e.type === 'hot')
                  ? 'green' : 'red'
              }
              onAbilityDeselect={() => setPartyActiveSlot(prev => prev.map((s, i) => i === activePartyIdx ? null : s))}
              onMemberSelect={(idx: number) => setBarViewIdx(idx)}
              enemies={zoneEnemies}
              inCombat={combat.active}
              isPlayerTurn={isPlayerTurn}
              activeCombatantId={currentCombatant?.id ?? null}
              onAbilityUse={handlePlayerAttack}
              actionRange={actionRange}
              playerHp={partyHp[0] ?? stats.hp}
              playerMaxHp={stats.hp}
              playerMp={partyMp[0] ?? stats.mp}
              playerMaxMp={stats.mp}
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
          party={party.map(m => ({
            characterName: m.characterName,
            selectedClass: m.selectedClass!,
            pointsSpent: m.pointsSpent,
            skillPointsSpent: m.skillPointsSpent,
            gear: m.gear,
          }))}
          partyHp={partyHp}
          partyStats={partyAllStats}
          partyBuffs={partyBuffs}
          inventory={inventory}
          onClose={() => setShowCharSheet(false)}
          onEquipItem={handleEquipItem}
        />
      )}
    </div>
  );
}

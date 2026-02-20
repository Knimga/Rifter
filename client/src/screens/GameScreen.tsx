import { useState, useEffect, useCallback, useRef, useMemo } from 'react';

import { CLASSES, calculateStats, type ClassKey, type AttributeKey } from '../data/classes';
import { getGearArmorBonus, isWeaponItem, type GearSlots, type AttackCategory, type DamageElement } from '../data/gear';
import type { EnemyInstance } from '../data/enemies';
import { chebyshev, hasLineOfSight, getAffectedTiles } from '../data/dungeonHelpers';
import type { AreaType } from '../data/classes';
import { generateDungeon, spawnDungeonEnemies, type DungeonData } from '../data/dungeonGen';
import { DUNGEON_PRESETS } from '../data/dungeonPresets';
import { startCombat, joinCombat, advanceTurn, applyTopOfRound, getCurrentCombatant, type CombatState } from '../data/combat';
import { resolveAttack } from '../data/attackResolution';
import { useEnemyTurn } from '../hooks/useEnemyTurn';

import CharacterSheet from '../components/CharacterSheet';
import SanctumMap from '../components/SanctumMap';
import DungeonMap from '../components/DungeonMap';
import TurnOrderBar from '../components/TurnOrderBar';
import ActionBar, { type SlotContent } from '../components/ActionBar';
import type { FloatingText } from '../components/FloatingCombatText';

interface Props {
  characterName: string;
  selectedClass: ClassKey;
  pointsSpent: Record<AttributeKey, number>;
  gear: GearSlots;
  setGear: (gear: GearSlots) => void;
}

const AGGRO_RANGE = 5;

const INITIAL_COMBAT: CombatState = {
  active: false,
  turnOrder: [],
  currentTurnIndex: 0,
  round: 0,
  playerActedThisTurn: false,
  movementRemaining: 0,
};

export default function GameScreen({ characterName, selectedClass, pointsSpent, gear, setGear: _setGear }: Props) {
  const [location, setLocation] = useState<'sanctum' | 'dungeon'>('sanctum');
  const [playerPos, setPlayerPos] = useState({ x: 5, y: 5 });
  const [slots, setSlots] = useState<SlotContent[]>(['weapon-attack', null, null, null, null]);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);
  const [enemies, setEnemies] = useState<EnemyInstance[]>([]);
  const [combat, setCombat] = useState<CombatState>(INITIAL_COMBAT);
  const [playerHp, setPlayerHp] = useState(0);
  const [playerMp, setPlayerMp] = useState(0);
  const [floatingTexts, setFloatingTexts] = useState<FloatingText[]>([]);
  const [showCharSheet, setShowCharSheet] = useState(false);
  const [dungeon, setDungeon] = useState<DungeonData | null>(null);
  const [currentZone, setCurrentZone] = useState(0);
  const nextFloatId = useRef(0);

  const classData = CLASSES[selectedClass];
  const stats = calculateStats(selectedClass, pointsSpent, getGearArmorBonus(gear));
  const weapon = gear.mainhand && isWeaponItem(gear.mainhand) ? gear.mainhand : null;
  const activeAbility = activeSlot !== null ? slots[activeSlot] : null;
  const currentCombatant = getCurrentCombatant(combat);
  const isPlayerTurn = combat.active && currentCombatant?.isPlayer === true;

  // Current zone data
  const zone = dungeon?.zones[currentZone] ?? null;
  const zoneEnemies = enemies.filter(e => e.zoneId === currentZone);
  const portalPos = dungeon && currentZone === dungeon.endZoneId ? dungeon.portalPos : null;

  // Refs so the enemy-AI effect can read latest values without re-triggering
  const enemiesRef = useRef(enemies);
  enemiesRef.current = enemies;
  const playerPosRef = useRef(playerPos);
  playerPosRef.current = playerPos;
  const statsRef = useRef(stats);
  statsRef.current = stats;
  const zoneRef = useRef(zone);
  zoneRef.current = zone;
  const currentZoneRef = useRef(currentZone);
  currentZoneRef.current = currentZone;

  // ─── Floating combat text helpers ───────────────────────────────────────

  const spawnFloat = useCallback((gridX: number, gridY: number, text: string, color: FloatingText['color']) => {
    const id = nextFloatId.current++;
    setFloatingTexts(prev => [...prev, { id, gridX, gridY, text, color }]);
  }, []);

  const removeFloat = useCallback((id: number) => {
    setFloatingTexts(prev => prev.filter(f => f.id !== id));
  }, []);

  const spawnFloatRef = useRef(spawnFloat);
  spawnFloatRef.current = spawnFloat;

  // Initialise HP from stats on first render (and when stats.hp changes out of combat)
  useEffect(() => {
    if (!combat.active) {
      setPlayerHp(stats.hp);
      setPlayerMp(stats.mp);
    }
  }, [stats.hp, stats.mp, combat.active]);

  // ─── Top-of-round effects (regen, etc.) ────────────────────────────────

  useEffect(() => {
    if (combat.round <= 1) return;
    const s = statsRef.current;
    setPlayerHp(prev => Math.min(s.hp, prev + s.hpRegen));
    setPlayerMp(prev => Math.min(s.mp, prev + s.mpRegen));
    setEnemies(prev => {
      const { enemies: updated, dotTicks } = applyTopOfRound(prev);
      for (const tick of dotTicks) {
        spawnFloat(tick.pos.x, tick.pos.y, `-${tick.damage}`, 'purple');
      }
      return updated;
    });
  }, [combat.round, spawnFloat]);

  // ─── Location transitions ──────────────────────────────────────────────

  const handleLocationChange = (next: 'sanctum' | 'dungeon') => {
    setLocation(next);
    setCombat(INITIAL_COMBAT);
    setFloatingTexts([]);

    if (next === 'dungeon') {
      const config = DUNGEON_PRESETS.crypt;
      const d = generateDungeon(config);
      setDungeon(d);
      setCurrentZone(d.startZoneId);
      setPlayerPos(d.playerStart);
      setEnemies(spawnDungeonEnemies(d, config));
    } else {
      setDungeon(null);
      setCurrentZone(0);
      setPlayerPos({ x: 5, y: 5 });
      setEnemies([]);
    }
  };

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

    // Find a walkable floor tile adjacent to the paired door
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

    if (!spawnPos) return; // shouldn't happen if door placement is correct

    setCurrentZone(door.targetZoneId);
    setPlayerPos(spawnPos);
    setFloatingTexts([]);

    // Check aggro in the new zone (state hasn't updated yet, so compute inline)
    const newZoneEnemies = enemies.filter(e => e.zoneId === door.targetZoneId);
    const spotted = findNewAggro(spawnPos, newZoneEnemies, targetZone.floors);
    if (spotted.length > 0) {
      const aggroGroupIds = new Set(spotted.map(e => e.groupId));
      const newlyAggroed = newZoneEnemies.filter(e =>
        e.currentHp > 0 && !e.aggroed && aggroGroupIds.has(e.groupId)
      );
      const aggroIds = new Set(newlyAggroed.map(e => e.id));
      setEnemies(prev => prev.map(e => aggroIds.has(e.id) ? { ...e, aggroed: true } : e));
      setCombat(startCombat(stats, newlyAggroed));
    }
  }, [zone, dungeon, combat.active, enemies, findNewAggro, stats]);

  // ─── Movement handler (exploration + combat) ────────────────────────────

  const handleMove = useCallback((newPos: { x: number; y: number }) => {
    if (combat.active) {
      if (!isPlayerTurn) return;
      const distance = chebyshev(playerPos, newPos);
      if (distance > combat.movementRemaining) return;
      setPlayerPos(newPos);
      setCombat(prev => ({
        ...prev,
        movementRemaining: prev.movementRemaining - distance,
      }));
    } else {
      setPlayerPos(newPos);
    }

    // Check for newly aggroed enemies (both in and out of combat)
    if (!zone) return;
    const spotted = findNewAggro(newPos, zoneEnemies, zone.floors);
    if (spotted.length === 0) return;

    // Pull in every member of each spotted enemy's group
    const aggroGroupIds = new Set(spotted.map(e => e.groupId));
    const newlyAggroed = zoneEnemies.filter(e =>
      e.currentHp > 0 && !e.aggroed && aggroGroupIds.has(e.groupId)
    );

    const aggroIds = new Set(newlyAggroed.map(e => e.id));
    setEnemies(prev => prev.map(e => aggroIds.has(e.id) ? { ...e, aggroed: true } : e));

    if (!combat.active) {
      setCombat(startCombat(stats, newlyAggroed));
    } else {
      setCombat(prev => joinCombat(prev, newlyAggroed));
    }
  }, [combat.active, combat.movementRemaining, isPlayerTurn, playerPos, zoneEnemies, stats, zone, findNewAggro]);

  // ─── End turn ────────────────────────────────────────────────────────────

  const handleEndTurn = useCallback(() => {
    if (!combat.active || !isPlayerTurn) return;
    setActiveSlot(null);
    setCombat(prev => advanceTurn(prev, zoneEnemies, stats.movement));
  }, [combat.active, isPlayerTurn, zoneEnemies, stats.movement]);

  // ─── Player attack ──────────────────────────────────────────────────────

  const handlePlayerAttack = useCallback((targetPos: { x: number; y: number }) => {
    if (!combat.active || !isPlayerTurn || combat.playerActedThisTurn) return;
    if (!zone) return;

    // Determine attack source from active slot
    const activeContent = activeSlot !== null ? slots[activeSlot] : null;
    let attackCategory: AttackCategory;
    let damageElement: DamageElement;
    let minDamage: number;
    let maxDamage: number;
    let range: number;
    let area: AreaType | undefined;

    if (activeContent === 'weapon-attack') {
      if (!weapon) return;
      attackCategory = weapon.attackCategory;
      damageElement = weapon.damageElement;
      minDamage = weapon.minDamage;
      maxDamage = weapon.maxDamage;
      range = weapon.range;
    } else if (activeContent && typeof activeContent === 'object') {
      if (playerMp < activeContent.mpCost) return;
      if (!activeContent.attackCategory) return;
      if (!activeContent.damage && !activeContent.dot) return; // need at least one effect
      attackCategory = activeContent.attackCategory;
      damageElement = activeContent.damage?.damageElement ?? activeContent.dot!.damageElement;
      minDamage = activeContent.damage?.minDamage ?? 0;
      maxDamage = activeContent.damage?.maxDamage ?? 0;
      range = activeContent.range;
      area = activeContent.area;
    } else {
      return;
    }

    // Range + LOS check on the target tile
    const distance = chebyshev(playerPos, targetPos);
    if (distance > range || !hasLineOfSight(playerPos, targetPos, zone.floors)) {
      setActiveSlot(null);
      return;
    }

    // Compute affected tiles and find enemies within
    const affectedTiles = getAffectedTiles(playerPos, targetPos, area, zone.floors);
    const affectedSet = new Set(affectedTiles.map(t => `${t.x},${t.y}`));
    const targets = zoneEnemies.filter(e =>
      e.currentHp > 0 && affectedSet.has(`${e.pos.x},${e.pos.y}`)
    );

    // Single-target: must have an enemy on the tile
    if ((!area || area === 'single') && targets.length === 0) {
      setActiveSlot(null);
      return;
    }

    // Resolve attack against each target
    const atkStats = stats[attackCategory];
    const damages: { id: string; damage: number }[] = [];
    const dotTargets: string[] = [];  // enemy ids that should receive DoTs
    const hasDamage = activeContent === 'weapon-attack' || (typeof activeContent === 'object' && !!activeContent.damage);
    const abilityDot = activeContent !== 'weapon-attack' && typeof activeContent === 'object' ? activeContent.dot : undefined;

    for (const enemy of targets) {
      const result = resolveAttack({
        hitBonus: atkStats.hitBonus,
        damageBonus: atkStats.damage,
        critChance: atkStats.crit,
        minDamage,
        maxDamage,
        damageElement,
        targetDodge: enemy.type.stats.dodge,
        targetArmor: enemy.type.stats.armor,
        targetMagicResistance: enemy.type.stats.magicResistance,
      });

      if (!result.hit) {
        spawnFloat(enemy.pos.x, enemy.pos.y, 'Missed!', 'white');
      } else if (result.dodged) {
        spawnFloat(enemy.pos.x, enemy.pos.y, 'Dodged!', 'white');
      } else {
        // Direct damage float (only if the ability has a damage component)
        if (hasDamage && result.finalDamage > 0) {
          const critText = result.crit ? ' CRIT!' : '';
          spawnFloat(enemy.pos.x, enemy.pos.y, `-${result.finalDamage}${critText}`, 'red');
        }
        // DoT application float
        if (abilityDot) {
          dotTargets.push(enemy.id);
          spawnFloat(enemy.pos.x, enemy.pos.y, 'Hit!', 'purple');
        }
      }

      if (hasDamage && result.finalDamage > 0) {
        damages.push({ id: enemy.id, damage: result.finalDamage });
      }
    }

    // Apply damage and DoTs
    if (damages.length > 0 || dotTargets.length > 0) {
      const damageMap = new Map(damages.map(d => [d.id, d.damage]));
      const dotSet = new Set(dotTargets);
      setEnemies(prev => prev.map(e => {
        const dmg = damageMap.get(e.id);
        const addDot = dotSet.has(e.id) && abilityDot;
        if (!dmg && !addDot) return e;
        return {
          ...e,
          currentHp: dmg ? Math.max(0, e.currentHp - dmg) : e.currentHp,
          dots: addDot ? [...e.dots, {
            damageElement: abilityDot!.damageElement,
            damagePerRound: abilityDot!.damagePerRound,
            roundsRemaining: abilityDot!.rounds,
          }] : e.dots,
        };
      }));
    }

    // Subtract MP cost for abilities
    if (activeContent && typeof activeContent === 'object') {
      setPlayerMp(prev => prev - activeContent.mpCost);
    }

    setActiveSlot(null);
    setCombat(prev => ({ ...prev, playerActedThisTurn: true }));
  }, [combat.active, isPlayerTurn, combat.playerActedThisTurn, activeSlot, slots, weapon, zoneEnemies, playerPos, playerMp, stats, zone, spawnFloat]);

  // ─── Enemy AI turn (1s move → 1s attack → end) ─────────────────────────

  // Stable refs object — avoids re-triggering the enemy turn effect on every render
  const enemyTurnRefs = useMemo(() => ({
    enemies: enemiesRef, playerPos: playerPosRef, stats: statsRef,
    zone: zoneRef, currentZone: currentZoneRef, spawnFloat: spawnFloatRef,
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  useEnemyTurn(
    combat, currentCombatant,
    enemyTurnRefs,
    setEnemies, setPlayerHp, setCombat,
  );

  // ─── Combat end detection ────────────────────────────────────────────────

  useEffect(() => {
    if (!combat.active) return;
    const allAggroedDead = zoneEnemies.filter(e => e.aggroed).every(e => e.currentHp <= 0);
    if (allAggroedDead) setCombat(INITIAL_COMBAT);
  }, [combat.active, zoneEnemies]);

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="h-screen bg-gray-900 text-gray-100 flex flex-col overflow-hidden">
      {/* Top bar */}
      <div className="shrink-0 bg-blue-950 border-b border-blue-900 px-6 pt-3 pb-2 z-10">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-end">
            <div>
              <h1 className="text-2xl font-bold text-red-500">{characterName}</h1>
              <p className="text-sm text-gray-400">{classData.name} - Level {stats.level}</p>
              {location === 'sanctum' && <p className="text-xs text-purple-400 mt-0.5">The Sanctum</p>}
              {location === 'dungeon' && zone && <p className="text-xs text-red-400 mt-0.5">Dungeon — Zone {zone.id + 1}</p>}
            </div>
            <button
              onClick={() => setShowCharSheet(true)}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm font-semibold rounded-lg transition-colors"
            >
              Character
            </button>
            <div className="flex gap-4">
              <div className="bg-gray-800 px-4 py-2 rounded">
                <span className="text-green-400 font-bold">HP:</span> {playerHp} / {stats.hp}
              </div>
              <div className="bg-gray-800 px-4 py-2 rounded">
                <span className="text-blue-400 font-bold">MP:</span> {playerMp} / {stats.mp}
              </div>
            </div>
          </div>
          {/* Reserved space for turn order — always rendered to prevent layout shift */}
          <div className="h-10 mt-2 flex items-center justify-center">
            {combat.active && (
              <TurnOrderBar
                turnOrder={combat.turnOrder}
                currentTurnIndex={combat.currentTurnIndex}
                enemies={zoneEnemies}
              />
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-7xl mx-auto">
          {location === 'sanctum' && (
            <SanctumMap
              selectedClass={selectedClass}
              playerPos={playerPos}
              movement={stats.movement}
              onMove={handleMove}
              onLocationChange={handleLocationChange}
              activeAbility={activeAbility}
              onAbilityDeselect={() => setActiveSlot(null)}
              playerHp={playerHp}
              playerMaxHp={stats.hp}
            />
          )}
          {location === 'dungeon' && zone && (
            <>
              <DungeonMap
                selectedClass={selectedClass}
                playerPos={playerPos}
                movement={combat.active ? combat.movementRemaining : stats.movement}
                onMove={handleMove}
                onLocationChange={handleLocationChange}
                onDoorClick={handleDoorClick}
                activeAbility={activeAbility}
                activeAbilityArea={
                  activeAbility && typeof activeAbility === 'object' ? activeAbility.area : undefined
                }
                aoeHighlightColor={
                  activeAbility && typeof activeAbility === 'object' && (activeAbility.heal || activeAbility.buff)
                    ? 'green' : 'red'
                }
                onAbilityDeselect={() => setActiveSlot(null)}
                enemies={zoneEnemies}
                inCombat={combat.active}
                isPlayerTurn={isPlayerTurn}
                activeCombatantId={currentCombatant?.id ?? null}
                onAbilityUse={handlePlayerAttack}
                actionRange={
                  activeAbility === 'weapon-attack' ? weapon?.range ?? 0
                    : activeAbility && typeof activeAbility === 'object' ? activeAbility.range
                    : 0
                }
                playerHp={playerHp}
                playerMaxHp={stats.hp}
                floatingTexts={floatingTexts}
                onFloatingTextComplete={removeFloat}
                zone={zone}
                portalPos={portalPos}
              />
            </>
          )}
        </div>
      </div>

      {/* Bottom bar */}
      <div className="shrink-0 bg-blue-950 border-t border-blue-900 px-6 py-4 z-10">
        <div className="max-w-7xl mx-auto flex items-center">
          <div className="flex-1" />
          <ActionBar
            gear={gear}
            abilities={classData.abilities}
            slots={slots}
            onSlotsChange={setSlots}
            activeSlot={activeSlot}
            onActiveSlotChange={setActiveSlot}
            inCombat={combat.active}
            isPlayerTurn={isPlayerTurn}
            playerActedThisTurn={combat.playerActedThisTurn}
          />
          <div className="flex-1 flex justify-end items-center gap-3">
            {combat.active && isPlayerTurn && (
              <>
                <span className="text-sm text-gray-400">
                  Movement: {combat.movementRemaining} / {stats.movement}
                </span>
                <button
                  onClick={handleEndTurn}
                  className="px-5 py-2 bg-red-700 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors"
                >
                  End Turn
                </button>
              </>
            )}
            {combat.active && !isPlayerTurn && currentCombatant && (
              <span className="text-sm text-yellow-400 animate-pulse">
                {currentCombatant.name}'s turn...
              </span>
            )}
          </div>
        </div>
      </div>

      {showCharSheet && (
        <CharacterSheet
          characterName={characterName}
          selectedClass={selectedClass}
          pointsSpent={pointsSpent}
          stats={stats}
          playerHp={playerHp}
          gear={gear}
          onClose={() => setShowCharSheet(false)}
        />
      )}
    </div>
  );
}

import { useState, useMemo, createElement } from 'react';
import { GiMagicPortal, GiDoorway } from 'react-icons/gi';
import { CLASSES, type ClassKey, type AreaType } from '../data/classes';
import type { ActiveBuff, ActiveHot, ActiveDot } from '../data/stats';
import type { EnemyInstance } from '../data/enemies';
import type { ZoneData, Pos } from '../data/dungeonGen';
import { chebyshev, hasLineOfSight, getAffectedTiles, isValidMoveTarget, brightenHex } from '../data/dungeonHelpers';
import { TILE_SIZE, DAMAGE_ELEMENT_COLOR } from '../data/constants';
import { isWeaponItem, isArmorItem, isShieldItem, type Item } from '../data/gear';
import FloatingCombatText, { type FloatingText } from './FloatingCombatText';
import { Tooltip } from './Tooltip';
import MoveLine from './MoveLine';

interface EffectDot {
  name: string;
  color: string;
  sign: '+' | '-';
}

function computePlayerDots(buffs: ActiveBuff[], hots: ActiveHot[], activeDots: ActiveDot[] = []): EffectDot[] {
  const dots: EffectDot[] = [];
  const seen = new Set<string>();
  for (const buff of buffs) {
    const key = buff.source ?? buff.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const color = buff.damageElement ? DAMAGE_ELEMENT_COLOR[buff.damageElement] : '#888';
    const isNeg = buff.amount < 0 || (buff.percent !== undefined && buff.percent < 0);
    dots.push({ name: buff.source ?? key, color, sign: isNeg ? '-' : '+' });
  }
  for (const hot of hots) {
    const color = hot.damageElement ? DAMAGE_ELEMENT_COLOR[hot.damageElement] : '#888';
    dots.push({ name: hot.name ?? 'HoT', color, sign: '+' });
  }
  for (const dot of activeDots) {
    dots.push({ name: dot.name ?? `${dot.damageElement} DoT`, color: DAMAGE_ELEMENT_COLOR[dot.damageElement], sign: '-' });
  }
  return dots;
}

function computeEnemyDots(buffs: ActiveBuff[], hots: ActiveHot[], dots: ActiveDot[]): EffectDot[] {
  const result: EffectDot[] = [];
  const seen = new Set<string>();
  for (const buff of buffs) {
    const key = buff.source ?? buff.id;
    if (seen.has(key)) continue;
    seen.add(key);
    const color = buff.damageElement ? DAMAGE_ELEMENT_COLOR[buff.damageElement] : '#888';
    const isNeg = buff.amount < 0 || (buff.percent !== undefined && buff.percent < 0);
    result.push({ name: buff.source ?? key, color, sign: isNeg ? '-' : '+' });
  }
  for (const hot of hots) {
    const color = hot.damageElement ? DAMAGE_ELEMENT_COLOR[hot.damageElement] : '#888';
    result.push({ name: hot.name ?? 'HoT', color, sign: '+' });
  }
  for (const dot of dots) {
    result.push({ name: dot.name ?? `${dot.damageElement} DoT`, color: DAMAGE_ELEMENT_COLOR[dot.damageElement], sign: '-' });
  }
  return result;
}

function EffectDotRow({ dots }: { dots: EffectDot[] }) {
  if (dots.length === 0) return null;
  return (
    <div className="absolute top-0 left-0 flex flex-wrap gap-px p-px z-10">
      {dots.map((dot, i) => (
        <Tooltip key={i} content={<span className="px-1.5 py-0.5 text-xs text-gray-100 whitespace-nowrap">{dot.name}</span>}>
          <div
            style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: dot.color, flexShrink: 0, cursor: 'default' }}
            className="flex items-center justify-center"
          >
            <span className="text-white font-bold leading-none select-none" style={{ fontSize: 6 }}>
              {dot.sign}
            </span>
          </div>
        </Tooltip>
      ))}
    </div>
  );
}

interface PartyFollower {
  pos: { x: number; y: number };
  classKey: ClassKey;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  partyIndex: number;
}

interface Props {
  selectedClass: ClassKey;
  playerPos: { x: number; y: number };
  activeMoverPos: { x: number; y: number };
  partyFollowers: PartyFollower[];
  movement: number;
  onMove: (pos: { x: number; y: number }) => void;
  onLocationChange: (location: 'sanctum') => void;
  onDoorClick: (doorId: string) => void;
  activeAbility: unknown;
  isSelfTargetAbility: boolean;
  isAllyTargetAbility: boolean;
  activeAbilityArea?: AreaType;
  aoeHighlightColor: 'red' | 'green';
  onAbilityDeselect: () => void;
  onMemberSelect: (partyIndex: number) => void;
  enemies: EnemyInstance[];
  inCombat: boolean;
  isPlayerTurn: boolean;
  activeCombatantId: string | null;
  onAbilityUse: (pos: { x: number; y: number }) => void;
  actionRange: number;
  playerHp: number;
  playerMaxHp: number;
  playerMp: number;
  playerMaxMp: number;
  floatingTexts: FloatingText[];
  onFloatingTextComplete: (id: number) => void;
  zone: ZoneData;
  portalPos: Pos | null;
  partyBuffs: ActiveBuff[][];
  partyHots: ActiveHot[][];
  partyDots?: ActiveDot[][];
  floorColor: string;
  wallColor: string;
  enemyAoePreviewTiles?: Set<string>;
  enemyTargetPartyIdx: number | null;
  droppedItems?: Record<string, Item>;
  onLootClick?: (pos: { x: number; y: number }) => void;
}

export default function DungeonMap({ selectedClass, playerPos, activeMoverPos, partyFollowers, movement, onMove, onLocationChange, onDoorClick, activeAbility, isSelfTargetAbility, isAllyTargetAbility, activeAbilityArea, aoeHighlightColor, onAbilityDeselect, onMemberSelect, enemies, inCombat, isPlayerTurn, activeCombatantId, onAbilityUse, actionRange, playerHp, playerMaxHp, playerMp, playerMaxMp, floatingTexts, onFloatingTextComplete, zone, portalPos, partyBuffs, partyHots, partyDots, floorColor, wallColor, enemyAoePreviewTiles, enemyTargetPartyIdx, droppedItems = {}, onLootClick }: Props) {
  const { width, height, floors, doors } = zone;
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);

  const isAoE = activeAbilityArea && activeAbilityArea !== 'single';

  const isAdjacent = (x: number, y: number) => {
    const dx = Math.abs(x - playerPos.x);
    const dy = Math.abs(y - playerPos.y);
    return dx <= 1 && dy <= 1 && (dx + dy) > 0;
  };

  const isAdjacentToPortal = portalPos ? isAdjacent(portalPos.x, portalPos.y) : false;

  const enemyAt = (x: number, y: number) =>
    enemies.find(e => e.pos.x === x && e.pos.y === y && e.currentHp > 0);

  const doorAt = (x: number, y: number) =>
    doors.find(d => d.pos.x === x && d.pos.y === y);

  const isMoveWalkable = (p: { x: number; y: number }) => floors.has(`${p.x},${p.y}`);
  const isMoveOccupied = (p: { x: number; y: number }) => !!enemyAt(p.x, p.y) || partyFollowers.some(f => f.pos.x === p.x && f.pos.y === p.y);
  const isMoveSpecial = (p: { x: number; y: number }) => portalPos !== null && portalPos.x === p.x && portalPos.y === p.y;

  // Single-target: highlight individual targetable enemies
  const isValidTarget = (enemy: EnemyInstance) =>
    activeAbility && !isAoE && !isAllyTargetAbility && inCombat && isPlayerTurn &&
    chebyshev(activeMoverPos, enemy.pos) <= actionRange &&
    hasLineOfSight(activeMoverPos, enemy.pos, floors);

  // AoE preview tiles (computed from hover position)
  const aoeTiles = useMemo(() => {
    if (!activeAbility || !isAoE || !hoveredTile || !inCombat || !isPlayerTurn) return new Set<string>();
    if (chebyshev(activeMoverPos, hoveredTile) > actionRange) return new Set<string>();
    if (!hasLineOfSight(activeMoverPos, hoveredTile, floors)) return new Set<string>();
    const tiles = getAffectedTiles(activeMoverPos, hoveredTile, activeAbilityArea, floors);
    return new Set(tiles.map(t => `${t.x},${t.y}`));
  }, [activeAbility, isAoE, hoveredTile, inCombat, isPlayerTurn, activeMoverPos, actionRange, floors, activeAbilityArea]);

  const handleClick = (x: number, y: number, floor: boolean, isPortal: boolean) => {
    if (inCombat && !isPlayerTurn) return;

    const door = doorAt(x, y);
    if (door) {
      if (!inCombat && isAdjacent(x, y)) onDoorClick(door.id);
      return;
    }

    if (!floor) return;

    const enemy = enemyAt(x, y);

    // With ability active: route to attack handler
    if (activeAbility) {
      if (isSelfTargetAbility) {
        // Self-target: only fires on own tile, deselects anywhere else
        onAbilityUse({ x, y });
      } else if (isAllyTargetAbility) {
        const isPartyMemberHere = (playerPos.x === x && playerPos.y === y) ||
          partyFollowers.some(f => f.pos.x === x && f.pos.y === y);
        if (isPartyMemberHere) onAbilityUse({ x, y });
        else onAbilityDeselect();
      } else if (isAoE) {
        onAbilityUse({ x, y });
      } else if (enemy) {
        onAbilityUse({ x, y });
      } else {
        onAbilityDeselect();
      }
      return;
    }

    if (enemy) return; // can't walk onto enemies

    // Loot pickup: click adjacent dropped item out of combat
    if (!inCombat && !activeAbility && droppedItems[`${x},${y}`] && isAdjacent(x, y)) {
      onLootClick?.({ x, y });
      return;
    }

    // Out-of-combat: clicking a party member's token selects their action bar
    if (!inCombat) {
      if (playerPos.x === x && playerPos.y === y) { onMemberSelect(0); return; }
      const followerHere = partyFollowers.find(f => f.pos.x === x && f.pos.y === y);
      if (followerHere) { onMemberSelect(followerHere.partyIndex); return; }
    }
    if (isPortal) {
      if (!inCombat && isAdjacentToPortal) onLocationChange('sanctum');
      return;
    }
    if (isValidMoveTarget({ x, y }, activeMoverPos, movement, isMoveWalkable, isMoveOccupied, isMoveSpecial)) onMove({ x, y });
  };

  return (
    <div className="flex flex-col items-center">
      <div className="bg-gray-800 p-4 rounded-lg inline-block">
        <div className="relative">
          {Array.from({ length: height }).map((_, y) => (
            <div key={y} className="flex">
              {Array.from({ length: width }).map((_, x) => {
                const isPlayer = playerPos.x === x && playerPos.y === y;
                const isPortal = portalPos !== null && portalPos.x === x && portalPos.y === y;
                const floor = floors.has(`${x},${y}`);
                const enemy = floor ? enemyAt(x, y) : undefined;
                const follower = !isPlayer && !enemy ? partyFollowers.find(f => f.pos.x === x && f.pos.y === y) : undefined;
                const door = doorAt(x, y);
                const targetable = enemy && isValidTarget(enemy);
                const isSelfTile = isSelfTargetAbility && inCombat && isPlayerTurn && x === activeMoverPos.x && y === activeMoverPos.y;
                const isDoorAdjacent = door ? isAdjacent(x, y) : false;
                const isLootAdjacent = !inCombat && !!droppedItems[`${x},${y}`] && isAdjacent(x, y);
                const inAoEPreview = aoeTiles.has(`${x},${y}`);
                const inEnemyAoePreview = !!enemyAoePreviewTiles?.has(`${x},${y}`);
                const isEnemyTargeted = enemyTargetPartyIdx !== null && (
                  (enemyTargetPartyIdx === 0 && isPlayer) ||
                  (!!follower && follower.partyIndex === enemyTargetPartyIdx)
                );

                let cellClass: string;
                let cellBgColor: string | undefined;
                if (enemy && enemy.id === activeCombatantId) {
                  cellClass = 'border-2 border-yellow-400';
                  cellBgColor = floorColor;
                } else if (isSelfTile || (isAllyTargetAbility && (isPlayer || !!follower))) {
                  cellClass = 'bg-green-900/40 border-2 border-green-400 cursor-crosshair';
                } else if (targetable || isEnemyTargeted) {
                  cellClass = 'bg-gray-900 border-2 border-red-500 cursor-crosshair';
                } else if (inAoEPreview) {
                  cellClass = aoeHighlightColor === 'green'
                    ? 'bg-green-900/60 border-green-700 cursor-crosshair'
                    : 'bg-red-900/60 border-red-700 cursor-crosshair';
                } else if (inCombat && isPlayerTurn && x === activeMoverPos.x && y === activeMoverPos.y) {
                  cellClass = 'border-gray-400/60';
                  cellBgColor = floorColor;
                } else if (door) {
                  cellClass = isDoorAdjacent && !inCombat
                    ? 'border-gray-700/30 cursor-pointer'
                    : 'border-gray-700/30';
                  cellBgColor = wallColor;
                } else if (!floor) {
                  cellClass = 'border-gray-700/30';
                  cellBgColor = wallColor;
                } else if (!activeAbility && isValidMoveTarget({ x, y }, activeMoverPos, movement, isMoveWalkable, isMoveOccupied, isMoveSpecial)) {
                  cellClass = 'border-gray-700/30';
                  cellBgColor = hoveredTile?.x === x && hoveredTile?.y === y
                    ? brightenHex(floorColor, 1.5)
                    : floorColor;
                } else {
                  cellClass = 'border-gray-700/30';
                  cellBgColor = floorColor;
                }

                return (
                  <div
                    key={`${x}-${y}`}
                    onClick={() => handleClick(x, y, floor, isPortal)}
                    onMouseEnter={() => setHoveredTile({ x, y })}
                    onMouseLeave={() => setHoveredTile(prev => prev?.x === x && prev?.y === y ? null : prev)}
                    style={{ width: TILE_SIZE, height: TILE_SIZE, ...(cellBgColor ? { backgroundColor: cellBgColor } : {}) }}
                    className={`relative shrink-0 border flex items-center justify-center text-xs ${cellClass}`}
                  >
                    {(() => {
                      const item = floor ? droppedItems[`${x},${y}`] : undefined;
                      if (!item) return null;
                      const icon = (isWeaponItem(item) || isShieldItem(item)) && item.iconPath
                        ? <img src={item.iconPath} className="w-5 h-5 object-contain" />
                        : isArmorItem(item) && item.icon
                          ? createElement(item.icon, { className: 'w-5 h-5 text-yellow-200' })
                          : null;
                      if (!icon) return null;
                      return (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                          <div
                            className={`transition-all ${isLootAdjacent ? 'animate-pulse' : 'opacity-70'}`}
                            style={isLootAdjacent ? { filter: 'drop-shadow(0 0 5px rgba(234,179,8,0.9))' } : undefined}
                          >
                            {icon}
                          </div>
                        </div>
                      );
                    })()}
                    {isPlayer && (
                      <div className="relative w-full h-full flex items-center justify-center">
                        <div className="w-8 h-8 rounded-full" style={{ backgroundColor: CLASSES[selectedClass].color }} />
                        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 flex flex-col gap-px">
                          <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 transition-all" style={{ width: `${(playerHp / playerMaxHp) * 100}%` }} />
                          </div>
                          <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all" style={{ width: `${(playerMp / playerMaxMp) * 100}%` }} />
                          </div>
                        </div>
                        <EffectDotRow dots={computePlayerDots(partyBuffs[0] ?? [], partyHots[0] ?? [], partyDots?.[0] ?? [])} />
                      </div>
                    )}
                    {!isPlayer && follower && (
                      <div className="relative w-full h-full flex items-center justify-center">
                        <div className="w-7 h-7 rounded-full opacity-75" style={{ backgroundColor: CLASSES[follower.classKey].color }} />
                        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-7 flex flex-col gap-px">
                          <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 transition-all" style={{ width: `${(follower.hp / follower.maxHp) * 100}%` }} />
                          </div>
                          <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all" style={{ width: `${(follower.mp / follower.maxMp) * 100}%` }} />
                          </div>
                        </div>
                        <EffectDotRow dots={computePlayerDots(partyBuffs[follower.partyIndex] ?? [], partyHots[follower.partyIndex] ?? [], partyDots?.[follower.partyIndex] ?? [])} />
                      </div>
                    )}
                    {!isPlayer && !follower && enemy && (
                      <div
                        className="relative w-full h-full flex items-center justify-center cursor-pointer"
                        onClick={() => {}}
                      >
                        {createElement(enemy.classData.token, { className: 'w-7 h-7' })}
                        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-500 transition-all"
                            style={{ width: `${(enemy.currentHp / enemy.stats.hp) * 100}%` }}
                          />
                        </div>
                        <EffectDotRow dots={computeEnemyDots(enemy.buffs, enemy.hots, enemy.dots)} />
                      </div>
                    )}
                    {!isPlayer && !follower && !enemy && door && (
                      <div
                        className={`transition-all ${isDoorAdjacent && !inCombat ? 'animate-pulse' : ''}`}
                        style={{ filter: isDoorAdjacent && !inCombat ? 'drop-shadow(0 0 8px rgba(209,213,219,0.8))' : 'none' }}
                        onMouseEnter={(e) => { if (isDoorAdjacent && !inCombat) (e.currentTarget as HTMLElement).style.filter = 'drop-shadow(0 0 12px rgba(209,213,219,1))'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = isDoorAdjacent && !inCombat ? 'drop-shadow(0 0 8px rgba(209,213,219,0.8))' : 'none'; }}
                      >
                        <GiDoorway className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                    {!isPlayer && !follower && !enemy && !door && isPortal && (
                      <div
                        className={`transition-all ${isAdjacentToPortal ? 'cursor-pointer animate-pulse' : ''}`}
                        style={{ filter: isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(34,211,238,0.8))' : 'none' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'drop-shadow(0 0 12px rgba(34,211,238,1))'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(34,211,238,0.8))' : 'none'; }}
                      >
                        <GiMagicPortal className="w-9 h-9 text-cyan-400" />
                      </div>
                    )}
                    {inEnemyAoePreview && (
                      <div className="absolute inset-0 bg-red-900/50 border border-red-600 pointer-events-none z-20 animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Movement line overlay */}
          {(() => {
            if (activeAbility || !hoveredTile) return null;
            if (inCombat && !isPlayerTurn) return null;
            const { x: hx, y: hy } = hoveredTile;
            if (!isValidMoveTarget({ x: hx, y: hy }, activeMoverPos, movement, isMoveWalkable, isMoveOccupied, isMoveSpecial)) return null;

            const half = TILE_SIZE / 2;
            const x1 = activeMoverPos.x * TILE_SIZE + half;
            const y1 = activeMoverPos.y * TILE_SIZE + half;
            const x2 = hx * TILE_SIZE + half;
            const y2 = hy * TILE_SIZE + half;

            return (
              <MoveLine
                svgWidth={width * TILE_SIZE} svgHeight={height * TILE_SIZE}
                x1={x1} y1={y1} x2={x2} y2={y2}
              />
            );
          })()}

          {/* Floating combat text overlay */}
          {floatingTexts.map(ft => (
            <FloatingCombatText key={ft.id} ft={ft} onComplete={onFloatingTextComplete} />
          ))}
        </div>
      </div>
    </div>
  );
}

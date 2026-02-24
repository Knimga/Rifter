import React, { useState, useMemo } from 'react';
import { Home, DoorOpen } from 'lucide-react';
import { CLASSES, type ClassKey, type AreaType } from '../data/classes';
import type { EnemyInstance } from '../data/enemies';
import type { ZoneData, Pos } from '../data/dungeonGen';
import { chebyshev, hasLineOfSight, getAffectedTiles } from '../data/dungeonHelpers';
import { TILE_SIZE } from '../data/constants';
import FloatingCombatText, { type FloatingText } from './FloatingCombatText';

interface Props {
  selectedClass: ClassKey;
  playerPos: { x: number; y: number };
  movement: number;
  onMove: (pos: { x: number; y: number }) => void;
  onLocationChange: (location: 'sanctum') => void;
  onDoorClick: (doorId: string) => void;
  activeAbility: unknown;
  activeAbilityArea?: AreaType;
  aoeHighlightColor: 'red' | 'green';
  onAbilityDeselect: () => void;
  enemies: EnemyInstance[];
  inCombat: boolean;
  isPlayerTurn: boolean;
  activeCombatantId: string | null;
  onAbilityUse: (pos: { x: number; y: number }) => void;
  actionRange: number;
  playerHp: number;
  playerMaxHp: number;
  floatingTexts: FloatingText[];
  onFloatingTextComplete: (id: number) => void;
  zone: ZoneData;
  portalPos: Pos | null;
}

export default function DungeonMap({ selectedClass, playerPos, movement, onMove, onLocationChange, onDoorClick, activeAbility, activeAbilityArea, aoeHighlightColor, onAbilityDeselect, enemies, inCombat, isPlayerTurn, activeCombatantId, onAbilityUse, actionRange, playerHp, playerMaxHp, floatingTexts, onFloatingTextComplete, zone, portalPos }: Props) {
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

  // Single-target: highlight individual targetable enemies
  const isValidTarget = (enemy: EnemyInstance) =>
    activeAbility && !isAoE && inCombat && isPlayerTurn &&
    chebyshev(playerPos, enemy.pos) <= actionRange &&
    hasLineOfSight(playerPos, enemy.pos, floors);

  // AoE preview tiles (computed from hover position)
  const aoeTiles = useMemo(() => {
    if (!activeAbility || !isAoE || !hoveredTile || !inCombat || !isPlayerTurn) return new Set<string>();
    if (chebyshev(playerPos, hoveredTile) > actionRange) return new Set<string>();
    if (!hasLineOfSight(playerPos, hoveredTile, floors)) return new Set<string>();
    const tiles = getAffectedTiles(playerPos, hoveredTile, activeAbilityArea, floors);
    return new Set(tiles.map(t => `${t.x},${t.y}`));
  }, [activeAbility, isAoE, hoveredTile, inCombat, isPlayerTurn, playerPos, actionRange, floors, activeAbilityArea]);

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
      if (isAoE) {
        // AoE: target any floor tile in range
        onAbilityUse({ x, y });
      } else if (enemy) {
        // Single target: must click enemy
        onAbilityUse({ x, y });
      } else {
        onAbilityDeselect();
      }
      return;
    }

    if (enemy) return; // can't walk onto enemies
    if (isPortal) {
      if (!inCombat && isAdjacentToPortal) onLocationChange('sanctum');
      return;
    }
    const distance = Math.max(Math.abs(x - playerPos.x), Math.abs(y - playerPos.y));
    if (distance <= movement) onMove({ x, y });
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
                const door = doorAt(x, y);
                const targetable = enemy && isValidTarget(enemy);
                const isDoorAdjacent = door ? isAdjacent(x, y) : false;
                const inAoEPreview = aoeTiles.has(`${x},${y}`);

                let cellClass: string;
                if (enemy && enemy.id === activeCombatantId) {
                  cellClass = 'bg-gray-900 border-2 border-yellow-400';
                } else if (targetable) {
                  cellClass = 'bg-gray-900 border-2 border-red-500 cursor-crosshair';
                } else if (inAoEPreview) {
                  cellClass = aoeHighlightColor === 'green'
                    ? 'bg-green-900/60 border-green-700 cursor-crosshair'
                    : 'bg-red-900/60 border-red-700 cursor-crosshair';
                } else if (door) {
                  cellClass = isDoorAdjacent && !inCombat
                    ? 'bg-gray-950 border-gray-700 cursor-pointer'
                    : 'bg-gray-950 border-gray-700';
                } else if (!floor) {
                  cellClass = 'bg-gray-950 border-gray-700';
                } else if (
                  !activeAbility &&
                  Math.max(Math.abs(x - playerPos.x), Math.abs(y - playerPos.y)) <= movement &&
                  !(x === playerPos.x && y === playerPos.y) && !enemy && !isPortal
                ) {
                  cellClass = 'bg-gray-900 hover:bg-gray-800 border-gray-700';
                } else {
                  cellClass = 'bg-gray-900 border-gray-700';
                }

                return (
                  <div
                    key={`${x}-${y}`}
                    onClick={() => handleClick(x, y, floor, isPortal)}
                    onMouseEnter={() => setHoveredTile({ x, y })}
                    onMouseLeave={() => setHoveredTile(prev => prev?.x === x && prev?.y === y ? null : prev)}
                    style={{ width: TILE_SIZE, height: TILE_SIZE }}
                    className={`shrink-0 border flex items-center justify-center text-xs ${cellClass}`}
                  >
                    {isPlayer && (
                      <div className="relative w-full h-full flex items-center justify-center">
                        <div className={`w-8 h-8 ${CLASSES[selectedClass].color} rounded flex items-center justify-center`}>
                          {React.createElement(CLASSES[selectedClass].token, { className: 'w-5 h-5 text-white' })}
                        </div>
                        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-green-500 transition-all"
                            style={{ width: `${(playerHp / playerMaxHp) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {!isPlayer && enemy && (
                      <div
                        className="relative w-full h-full flex items-center justify-center cursor-pointer"
                        onClick={() => console.log(`[${enemy.type.name} lv${enemy.level}]`, { attrs: enemy.attrs, stats: enemy.stats, weapon: enemy.type.weapon })}
                      >
                        <span className="text-lg leading-none">{enemy.type.token}</span>
                        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-red-500 transition-all"
                            style={{ width: `${(enemy.currentHp / enemy.stats.hp) * 100}%` }}
                          />
                        </div>
                      </div>
                    )}
                    {!isPlayer && !enemy && door && (
                      <div
                        className={`transition-all ${isDoorAdjacent && !inCombat ? 'animate-pulse' : ''}`}
                        style={{ filter: isDoorAdjacent && !inCombat ? 'drop-shadow(0 0 8px rgba(251,191,36,0.8))' : 'none' }}
                        onMouseEnter={(e) => { if (isDoorAdjacent && !inCombat) (e.currentTarget as HTMLElement).style.filter = 'drop-shadow(0 0 12px rgba(251,191,36,1))'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = isDoorAdjacent && !inCombat ? 'drop-shadow(0 0 8px rgba(251,191,36,0.8))' : 'none'; }}
                      >
                        <DoorOpen className="w-6 h-6 text-amber-400" />
                      </div>
                    )}
                    {!isPlayer && !enemy && !door && isPortal && (
                      <div
                        className={`transition-all ${isAdjacentToPortal ? 'cursor-pointer animate-pulse' : ''}`}
                        style={{ filter: isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(34,211,238,0.8))' : 'none' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'drop-shadow(0 0 12px rgba(34,211,238,1))'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(34,211,238,0.8))' : 'none'; }}
                      >
                        <Home className="w-6 h-6 text-cyan-400" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {/* Floating combat text overlay */}
          {floatingTexts.map(ft => (
            <FloatingCombatText key={ft.id} ft={ft} onComplete={onFloatingTextComplete} />
          ))}
        </div>
      </div>
    </div>
  );
}

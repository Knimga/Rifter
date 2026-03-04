import { useState, useMemo } from 'react';
import { Home, DoorOpen } from 'lucide-react';
import { CLASSES, type ClassKey, type AreaType } from '../data/classes';
import type { ActiveBuff, ActiveHot } from '../data/stats';
import type { EnemyInstance, ActiveDot } from '../data/enemies';
import type { ZoneData, Pos } from '../data/dungeonGen';
import { chebyshev, hasLineOfSight, getAffectedTiles } from '../data/dungeonHelpers';
import { TILE_SIZE, DAMAGE_ELEMENT_COLOR } from '../data/constants';
import FloatingCombatText, { type FloatingText } from './FloatingCombatText';
import { Tooltip } from './Tooltip';

interface EffectDot {
  name: string;
  color: string;
  sign: '+' | '-';
}

function computePlayerDots(buffs: ActiveBuff[], hots: ActiveHot[]): EffectDot[] {
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
}

export default function DungeonMap({ selectedClass, playerPos, activeMoverPos, partyFollowers, movement, onMove, onLocationChange, onDoorClick, activeAbility, isSelfTargetAbility, activeAbilityArea, aoeHighlightColor, onAbilityDeselect, onMemberSelect, enemies, inCombat, isPlayerTurn, activeCombatantId, onAbilityUse, actionRange, playerHp, playerMaxHp, playerMp, playerMaxMp, floatingTexts, onFloatingTextComplete, zone, portalPos, partyBuffs, partyHots }: Props) {
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
    const distance = Math.max(Math.abs(x - activeMoverPos.x), Math.abs(y - activeMoverPos.y));
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
                const follower = !isPlayer && !enemy ? partyFollowers.find(f => f.pos.x === x && f.pos.y === y) : undefined;
                const door = doorAt(x, y);
                const targetable = enemy && isValidTarget(enemy);
                const isSelfTile = isSelfTargetAbility && inCombat && isPlayerTurn && x === activeMoverPos.x && y === activeMoverPos.y;
                const isDoorAdjacent = door ? isAdjacent(x, y) : false;
                const inAoEPreview = aoeTiles.has(`${x},${y}`);

                let cellClass: string;
                if (enemy && enemy.id === activeCombatantId) {
                  cellClass = 'bg-gray-900 border-2 border-yellow-400';
                } else if (isSelfTile) {
                  cellClass = 'bg-green-900/40 border-2 border-green-400 cursor-crosshair';
                } else if (targetable) {
                  cellClass = 'bg-gray-900 border-2 border-red-500 cursor-crosshair';
                } else if (inAoEPreview) {
                  cellClass = aoeHighlightColor === 'green'
                    ? 'bg-green-900/60 border-green-700 cursor-crosshair'
                    : 'bg-red-900/60 border-red-700 cursor-crosshair';
                } else if (inCombat && isPlayerTurn && x === activeMoverPos.x && y === activeMoverPos.y) {
                  cellClass = 'bg-gray-900 border-gray-400/60';
                } else if (door) {
                  cellClass = isDoorAdjacent && !inCombat
                    ? 'bg-gray-950 border-gray-700/30 cursor-pointer'
                    : 'bg-gray-950 border-gray-700/30';
                } else if (!floor) {
                  cellClass = 'bg-gray-950 border-gray-700/30';
                } else if (
                  !activeAbility &&
                  Math.max(Math.abs(x - activeMoverPos.x), Math.abs(y - activeMoverPos.y)) <= movement &&
                  !(x === activeMoverPos.x && y === activeMoverPos.y) && !enemy && !follower && !isPortal
                ) {
                  cellClass = 'bg-gray-900 hover:bg-gray-800 border-gray-700/30';
                } else {
                  cellClass = 'bg-gray-900 border-gray-700/30';
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
                        <div className="w-8 h-8 rounded-full" style={{ backgroundColor: CLASSES[selectedClass].color }} />
                        <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 flex flex-col gap-px">
                          <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-red-500 transition-all" style={{ width: `${(playerHp / playerMaxHp) * 100}%` }} />
                          </div>
                          <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
                            <div className="h-full bg-blue-500 transition-all" style={{ width: `${(playerMp / playerMaxMp) * 100}%` }} />
                          </div>
                        </div>
                        <EffectDotRow dots={computePlayerDots(partyBuffs[0] ?? [], partyHots[0] ?? [])} />
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
                        <EffectDotRow dots={computePlayerDots(partyBuffs[follower.partyIndex] ?? [], partyHots[follower.partyIndex] ?? [])} />
                      </div>
                    )}
                    {!isPlayer && !follower && enemy && (
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
                        <EffectDotRow dots={computeEnemyDots(enemy.buffs, enemy.hots, enemy.dots)} />
                      </div>
                    )}
                    {!isPlayer && !follower && !enemy && door && (
                      <div
                        className={`transition-all ${isDoorAdjacent && !inCombat ? 'animate-pulse' : ''}`}
                        style={{ filter: isDoorAdjacent && !inCombat ? 'drop-shadow(0 0 8px rgba(251,191,36,0.8))' : 'none' }}
                        onMouseEnter={(e) => { if (isDoorAdjacent && !inCombat) (e.currentTarget as HTMLElement).style.filter = 'drop-shadow(0 0 12px rgba(251,191,36,1))'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = isDoorAdjacent && !inCombat ? 'drop-shadow(0 0 8px rgba(251,191,36,0.8))' : 'none'; }}
                      >
                        <DoorOpen className="w-6 h-6 text-amber-400" />
                      </div>
                    )}
                    {!isPlayer && !follower && !enemy && !door && isPortal && (
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

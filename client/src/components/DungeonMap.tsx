import { useState, useMemo, createElement, lazy, Suspense } from 'react';
import { GiMagicPortal, GiDoorway } from 'react-icons/gi';
import type { AreaType, TargetType } from '../data/classes';
import type { ActiveBuff, ActiveHot, ActiveDot } from '../data/stats';
import type { EnemyInstance } from '../data/enemies';
import type { ZoneData } from '../data/dungeonGen';
import { affectedKeys, brightenHex, chebyshev, hasLineOfSight, isAdjacent, isValidMoveTarget, posKey, samePos, type Pos } from '../data/dungeonHelpers';
import { TILE_SIZE } from '../data/constants';
import type { Item } from '../data/gear';
import FloatingCombatText, { type FloatingText } from './FloatingCombatText';
import ItemIcon from './ItemIcon';
import { EffectDotRow, EnemyHpBar, MoveLineOverlay, PartyToken, TILE_BORDER_CLASS, computeEffectDots, type PartyTokenData } from './mapParts';
import { isRenderable } from '../forge/registry.vite';

// 3D enemy models over the tile grid. Lazy: it pulls in three.js (GameScreen preloads it on mount).
const ModelLayer = lazy(() => import('./ModelLayer'));

/** Above-the-head status for enemies drawn as models: effect dots (hoverable) over the HP bar. */
function enemyOverlay(enemy: EnemyInstance) {
  return (
    <>
      <div className="relative w-8 h-2 pointer-events-auto">
        <EffectDotRow dots={computeEffectDots(enemy.buffs, enemy.hots, enemy.dots)} />
      </div>
      <EnemyHpBar hp={enemy.currentHp} maxHp={enemy.stats.hp} />
    </>
  );
}

interface Props {
  playerPos: Pos;                   // party leader (doors, portal and loot adjacency)
  activeMoverPos: Pos;
  party: PartyTokenData[];
  movement: number;
  onMove: (pos: Pos) => void;
  onLocationChange: (location: 'sanctum') => void;
  onDoorClick: (doorId: string) => void;
  activeTarget: TargetType | null;  // target type of the selected ability (null = none selected)
  activeAbilityArea?: AreaType;
  aoeHighlightColor: 'red' | 'green';
  actionRange: number;
  onAbilityUse: (pos: Pos) => void;
  onAbilityDeselect: () => void;
  onMemberSelect: (partyIndex: number) => void;
  enemies: EnemyInstance[];
  inCombat: boolean;
  isPlayerTurn: boolean;
  activeCombatantId: string | null;
  floatingTexts: FloatingText[];
  onFloatingTextComplete: (id: number) => void;
  zone: ZoneData;
  portalPos: Pos | null;
  partyBuffs: ActiveBuff[][];
  partyHots: ActiveHot[][];
  partyDots: ActiveDot[][];
  floorColor: string;
  wallColor: string;
  enemyAoePreviewTiles?: Set<string>;
  enemyTargetPartyIdx: number | null;
  droppedItems?: Record<string, Item[]>;
  onLootClick?: (pos: Pos) => void;
}

export default function DungeonMap({ playerPos, activeMoverPos, party, movement, onMove, onLocationChange, onDoorClick, activeTarget, activeAbilityArea, aoeHighlightColor, actionRange, onAbilityUse, onAbilityDeselect, onMemberSelect, enemies, inCombat, isPlayerTurn, activeCombatantId, floatingTexts, onFloatingTextComplete, zone, portalPos, partyBuffs, partyHots, partyDots, floorColor, wallColor, enemyAoePreviewTiles, enemyTargetPartyIdx, droppedItems = {}, onLootClick }: Props) {
  const { width, height, floors, doors } = zone;
  const [hoveredTile, setHoveredTile] = useState<Pos | null>(null);

  const isAoE = !!activeAbilityArea && activeAbilityArea !== 'single';
  const canAct = !inCombat || isPlayerTurn;
  const isAdjacentToPortal = portalPos ? isAdjacent(playerPos, portalPos) : false;

  // Per-tile lookups, built once per render instead of scanning lists for every tile
  const enemyByKey = useMemo(() => new Map(enemies.filter(e => e.currentHp > 0).map(e => [posKey(e.pos), e])), [enemies]);
  // Living enemies drawn as models (stable array while `enemies` is unchanged, so ModelLayer can memo on it)
  const modelEnemies = useMemo(() => enemies.filter(e => e.currentHp > 0 && isRenderable(e.classData.model)), [enemies]);
  const memberByKey = useMemo(() => new Map(party.map(m => [posKey(m.pos), m])), [party]);
  const doorByKey = useMemo(() => new Map(doors.map(d => [posKey(d.pos), d])), [doors]);

  // Every tile the active mover can step to this turn
  const moveTargets = useMemo(() => {
    const keys = new Set<string>();
    const isOccupied = (p: Pos) => enemyByKey.has(posKey(p)) || memberByKey.has(posKey(p));
    const isPortal = (p: Pos) => !!portalPos && samePos(p, portalPos);
    for (let dx = -movement; dx <= movement; dx++) {
      for (let dy = -movement; dy <= movement; dy++) {
        const p = { x: activeMoverPos.x + dx, y: activeMoverPos.y + dy };
        if (isValidMoveTarget(p, activeMoverPos, movement, q => floors.has(posKey(q)), isOccupied, isPortal)) keys.add(posKey(p));
      }
    }
    return keys;
  }, [activeMoverPos, movement, floors, enemyByKey, memberByKey, portalPos]);

  const inRangeWithLOS = (p: Pos) => chebyshev(activeMoverPos, p) <= actionRange && hasLineOfSight(activeMoverPos, p, floors);

  // AoE preview tiles (computed from hover position)
  const aoeTiles = useMemo(() => {
    if (!activeTarget || !isAoE || !hoveredTile || !inCombat || !isPlayerTurn || !inRangeWithLOS(hoveredTile)) return new Set<string>();
    return affectedKeys(activeMoverPos, hoveredTile, activeAbilityArea, floors);
  }, [activeTarget, isAoE, hoveredTile, inCombat, isPlayerTurn, activeMoverPos, actionRange, floors, activeAbilityArea]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleClick = (p: Pos, floor: boolean) => {
    if (!canAct) return;
    const key = posKey(p);

    const door = doorByKey.get(key);
    if (door) {
      if (!inCombat && isAdjacent(playerPos, p)) onDoorClick(door.id);
      return;
    }
    if (!floor) return;

    const enemy = enemyByKey.get(key);
    const member = memberByKey.get(key);

    // With ability active: route to attack handler
    if (activeTarget) {
      if (activeTarget === 'self') onAbilityUse(p);               // fires only on own tile; handler deselects elsewhere
      else if (activeTarget === 'ally') member ? onAbilityUse(p) : onAbilityDeselect();
      else if (isAoE || enemy) onAbilityUse(p);
      else onAbilityDeselect();
      return;
    }

    if (enemy) return; // can't walk onto enemies

    // Loot pickup: click adjacent dropped item out of combat
    if (!inCombat && droppedItems[key]?.length && isAdjacent(playerPos, p)) {
      onLootClick?.(p);
      return;
    }

    // Out-of-combat: clicking a party member's token selects their action bar
    if (!inCombat && member) { onMemberSelect(member.partyIndex); return; }

    if (portalPos && samePos(p, portalPos)) {
      if (!inCombat && isAdjacentToPortal) onLocationChange('sanctum');
      return;
    }
    if (moveTargets.has(key)) onMove(p);
  };

  return (
    <div className="flex flex-col items-center">
      <div className="bg-gray-800 p-4 rounded-lg inline-block">
        <div className="relative">
          {Array.from({ length: height }).map((_, y) => (
            <div key={y} className="flex">
              {Array.from({ length: width }).map((_, x) => {
                const p = { x, y };
                const key = posKey(p);
                const isPortal = !!portalPos && samePos(p, portalPos);
                const floor = floors.has(key);
                const member = memberByKey.get(key);
                const enemy = floor && !member ? enemyByKey.get(key) : undefined;
                const door = doorByKey.get(key);
                const targetable = enemy && activeTarget === 'enemy' && !isAoE && inCombat && isPlayerTurn && inRangeWithLOS(enemy.pos);
                const isMoverTile = samePos(p, activeMoverPos);
                const isSelfTile = activeTarget === 'self' && inCombat && isPlayerTurn && isMoverTile;
                const isDoorAdjacent = !!door && isAdjacent(playerPos, p);
                const tileItems = floor ? droppedItems[key] : undefined;
                const isLootAdjacent = !inCombat && !!tileItems?.length && isAdjacent(playerPos, p);
                const isEnemyTargeted = enemyTargetPartyIdx !== null && member?.partyIndex === enemyTargetPartyIdx;

                let cellClass: string;
                let cellBgColor: string | undefined;
                if (enemy && enemy.id === activeCombatantId) {
                  cellClass = 'border-2 border-yellow-400';
                  cellBgColor = floorColor;
                } else if (isSelfTile || (activeTarget === 'ally' && member)) {
                  cellClass = 'bg-green-900/40 border-2 border-green-400 cursor-crosshair';
                } else if (targetable || isEnemyTargeted) {
                  cellClass = 'bg-gray-900 border-2 border-red-500 cursor-crosshair';
                } else if (aoeTiles.has(key)) {
                  cellClass = aoeHighlightColor === 'green'
                    ? 'bg-green-900/60 border-green-700 cursor-crosshair'
                    : 'bg-red-900/60 border-red-700 cursor-crosshair';
                } else if (inCombat && isPlayerTurn && isMoverTile) {
                  cellClass = 'border-gray-400/60';
                  cellBgColor = floorColor;
                } else if (door) {
                  cellClass = isDoorAdjacent && !inCombat ? `${TILE_BORDER_CLASS} cursor-pointer` : TILE_BORDER_CLASS;
                  cellBgColor = wallColor;
                } else if (!floor) {
                  cellClass = TILE_BORDER_CLASS;
                  cellBgColor = wallColor;
                } else {
                  cellClass = TILE_BORDER_CLASS;
                  cellBgColor = !activeTarget && moveTargets.has(key) && hoveredTile && samePos(hoveredTile, p)
                    ? brightenHex(floorColor, 1.5)
                    : floorColor;
                }

                return (
                  <div
                    key={key}
                    onClick={() => handleClick(p, floor)}
                    onMouseEnter={() => setHoveredTile(p)}
                    onMouseLeave={() => setHoveredTile(prev => prev && samePos(prev, p) ? null : prev)}
                    style={{ width: TILE_SIZE, height: TILE_SIZE, ...(cellBgColor ? { backgroundColor: cellBgColor } : {}) }}
                    className={`relative shrink-0 border flex items-center justify-center text-xs ${cellClass}`}
                  >
                    {tileItems?.[0] && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                        <div className="relative">
                          <div
                            className={`transition-all ${isLootAdjacent ? 'animate-pulse' : 'opacity-70'}`}
                            style={isLootAdjacent ? { filter: 'drop-shadow(0 0 5px rgba(234,179,8,0.9))' } : undefined}
                          >
                            <ItemIcon item={tileItems[0]} className="w-5 h-5" iconClassName="text-yellow-200" />
                          </div>
                          {tileItems.length > 1 && (
                            <span className="absolute -top-1 -right-1 bg-yellow-500 text-black text-[8px] font-bold rounded-full w-3 h-3 flex items-center justify-center leading-none">
                              {tileItems.length}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {member && (
                      <PartyToken
                        member={member}
                        dots={computeEffectDots(partyBuffs[member.partyIndex] ?? [], partyHots[member.partyIndex] ?? [], partyDots[member.partyIndex] ?? [])}
                      />
                    )}
                    {enemy && (
                      <div className="relative w-full h-full flex items-center justify-center cursor-pointer">
                        {/* Enemies linked to a model are drawn by ModelLayer; the rest keep their icon */}
                        {!isRenderable(enemy.classData.model) && (
                          <>
                            {createElement(enemy.classData.token, { className: 'w-7 h-7' })}
                            <EnemyHpBar hp={enemy.currentHp} maxHp={enemy.stats.hp} className="absolute bottom-0.5 left-1/2 -translate-x-1/2" />
                            <EffectDotRow dots={computeEffectDots(enemy.buffs, enemy.hots, enemy.dots)} />
                          </>
                        )}
                      </div>
                    )}
                    {!member && !enemy && door && (
                      <div
                        className={`transition-all ${isDoorAdjacent && !inCombat ? 'animate-pulse' : ''}`}
                        style={{ filter: isDoorAdjacent && !inCombat ? 'drop-shadow(0 0 8px rgba(209,213,219,0.8))' : 'none' }}
                        onMouseEnter={(e) => { if (isDoorAdjacent && !inCombat) (e.currentTarget as HTMLElement).style.filter = 'drop-shadow(0 0 12px rgba(209,213,219,1))'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = isDoorAdjacent && !inCombat ? 'drop-shadow(0 0 8px rgba(209,213,219,0.8))' : 'none'; }}
                      >
                        <GiDoorway className="w-8 h-8 text-gray-400" />
                      </div>
                    )}
                    {!member && !enemy && !door && isPortal && (
                      <div
                        className={`transition-all ${isAdjacentToPortal ? 'cursor-pointer animate-pulse' : ''}`}
                        style={{ filter: isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(34,211,238,0.8))' : 'none' }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'drop-shadow(0 0 12px rgba(34,211,238,1))'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(34,211,238,0.8))' : 'none'; }}
                      >
                        <GiMagicPortal className="w-9 h-9 text-cyan-400" />
                      </div>
                    )}
                    {enemyAoePreviewTiles?.has(key) && (
                      <div className="absolute inset-0 bg-red-900/50 border border-red-600 pointer-events-none z-20 animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <Suspense fallback={null}>
            <ModelLayer cols={width} rows={height} enemies={modelEnemies} renderOverlay={enemyOverlay} />
          </Suspense>

          {!activeTarget && canAct && hoveredTile && moveTargets.has(posKey(hoveredTile)) && (
            <MoveLineOverlay from={activeMoverPos} to={hoveredTile} cols={width} rows={height} />
          )}

          {/* Floating combat text overlay */}
          {floatingTexts.map(ft => (
            <FloatingCombatText key={ft.id} ft={ft} onComplete={onFloatingTextComplete} />
          ))}
        </div>
      </div>
    </div>
  );
}

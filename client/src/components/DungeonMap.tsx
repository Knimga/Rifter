import { useState, useMemo, lazy, Suspense } from 'react';
import type { AreaType, TargetType } from '../data/classes';
import type { ActiveBuff, ActiveHot, ActiveDot } from '../data/stats';
import type { EnemyInstance } from '../data/enemies';
import type { ZoneData } from '../data/dungeonGen';
import { affectedKeys, brightenHex, chebyshev, hasLineOfSight, isAdjacent, posKey, samePos, type Pos } from '../data/dungeonHelpers';
import { TILE_SIZE } from '../viewEngine/board';
import type { Item } from '../data/gear';
import FloatingCombatText, { type FloatingText } from './FloatingCombatText';
import { gameObjectModel } from '../data/gameObjects';
import { Board, EffectDotRow, EnemyHpBar, MoveLineOverlay, TILE_BORDER_CLASS, UprightAt, UsableGlow, computeEffectDots, facingOpenSide, toMapMember, useBoard, type PartyTokenData } from './mapParts';
import type { MapLoot, MapObject, UnitAim } from './ModelLayer';

// 3D party, enemy and loot models over the tile grid. Lazy: it pulls in three.js (GameScreen preloads it on mount).
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
  /** Tiles the active mover can move to this turn (tile key -> steps), from GameScreen (partyMoveTargets). */
  moveTargets: Map<string, number>;
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
  /** GAME_OBJECTS ids of this dungeon's doors and exit portal (DungeonConfig). */
  doorObject: string;
  portalObject: string;
  enemyAoePreviewTiles?: Set<string>;
  enemyTargetPartyIdx: number | null;
  droppedItems?: Record<string, Item[]>;
  onLootClick?: (pos: Pos) => void;
  /** Where each unit last aimed an ability; its model turns to face it. */
  aims?: Record<string, UnitAim>;
}

export default function DungeonMap({ playerPos, activeMoverPos, party, moveTargets, onMove, onLocationChange, onDoorClick, activeTarget, activeAbilityArea, aoeHighlightColor, actionRange, onAbilityUse, onAbilityDeselect, onMemberSelect, enemies, inCombat, isPlayerTurn, activeCombatantId, floatingTexts, onFloatingTextComplete, zone, portalPos, partyBuffs, partyHots, partyDots, floorColor, wallColor, doorObject, portalObject, enemyAoePreviewTiles, enemyTargetPartyIdx, droppedItems = {}, onLootClick, aims }: Props) {
  const { width, height, floors, doors } = zone;
  const [hoveredTile, setHoveredTile] = useState<Pos | null>(null);
  const board = useBoard(width, height);

  const isAoE = !!activeAbilityArea && activeAbilityArea !== 'single';
  const canAct = !inCombat || isPlayerTurn;
  const isAdjacentToPortal = portalPos ? isAdjacent(playerPos, portalPos) : false;

  // Per-tile lookups, built once per render instead of scanning lists for every tile
  const enemyByKey = useMemo(() => new Map(enemies.filter(e => e.currentHp > 0).map(e => [posKey(e.pos), e])), [enemies]);
  // Living enemies drawn as models (stable array while `enemies` is unchanged, so ModelLayer can memo on it)
  const modelEnemies = useMemo(() => enemies.filter(e => e.currentHp > 0), [enemies]);
  const memberByKey = useMemo(() => new Map(party.map(m => [posKey(m.pos), m])), [party]);
  // Loot drawn as models: the top item of each pile
  const modelLoot = useMemo(() => {
    const out: MapLoot[] = [];
    for (const [key, items] of Object.entries(droppedItems)) {
      const top = items[0];
      if (!top) continue;
      const [x, y] = key.split(',').map(Number);
      out.push({ id: top.id, link: top.model, pos: { x, y } });
    }
    return out;
  }, [droppedItems]);
  // Party members drawn as their class models, with HP/MP bars and effect dots above their heads
  const modelParty = useMemo(
    () => party.map(m => toMapMember(m, computeEffectDots(partyBuffs[m.partyIndex] ?? [], partyHots[m.partyIndex] ?? [], partyDots[m.partyIndex] ?? []))),
    [party, partyBuffs, partyHots, partyDots],
  );
  const doorByKey = useMemo(() => new Map(doors.map(d => [posKey(d.pos), d])), [doors]);
  // Doors and the exit portal, drawn as their game objects' models. A door stands in its wall tile facing
  // the floor it opens onto.
  const mapObjects = useMemo(() => {
    const isFloor = (q: Pos) => floors.has(posKey(q));
    const out: MapObject[] = doors.map(d => ({ id: d.id, link: gameObjectModel(doorObject), pos: d.pos, facing: facingOpenSide(d.pos, isFloor) }));
    if (portalPos) out.push({ id: 'portal', link: gameObjectModel(portalObject), pos: portalPos, facing: facingOpenSide(portalPos, isFloor) });
    return out;
  }, [doors, floors, portalPos, doorObject, portalObject]);


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

  const floor = (
    <>
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
                      // The pile is drawn by ModelLayer; a glow on the floor under it shows it can be picked up
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-0">
                        <div
                          className={`w-8 h-8 rounded-full ${isLootAdjacent ? 'animate-pulse' : 'invisible'}`}
                          style={{ boxShadow: '0 0 10px 3px rgba(234,179,8,0.6)' }}
                        />
                      </div>
                    )}
                    {/* Members and enemies (and the active member's floor glow) are drawn by ModelLayer;
                        doors, the portal and loot counts are upright markers (see below) */}
                    {enemy && <div className="w-full h-full cursor-pointer" />}
                    {/* A door or the portal the leader can use now: a soft pulsing glow on its tile (stronger on hover) */}
                    {((door && isDoorAdjacent && !inCombat) || (isPortal && isAdjacentToPortal)) && (
                      <UsableGlow color={door ? '209, 213, 219' : '178, 236, 192'} hovered={!!hoveredTile && samePos(hoveredTile, p)} />
                    )}
                    {enemyAoePreviewTiles?.has(key) && (
                      <div className="absolute inset-0 bg-red-900/50 border border-red-600 pointer-events-none z-20 animate-pulse" />
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          {!activeTarget && canAct && hoveredTile && moveTargets.has(posKey(hoveredTile)) && (
            <MoveLineOverlay from={activeMoverPos} to={hoveredTile} cols={width} rows={height} />
          )}
    </>
  );

  // No frame: the board floats on the game screen's background
  return (
        <Board board={board} floor={floor}>
          <Suspense fallback={null}>
            {/* Keyed by zone: entering another zone places every model fresh instead of gliding it across */}
            <ModelLayer key={zone.id} board={board} party={modelParty} enemies={modelEnemies} loot={modelLoot} objects={mapObjects} renderEnemyOverlay={enemyOverlay} aims={aims} />
          </Suspense>

          {Object.entries(droppedItems).filter(([, items]) => items.length > 1).map(([key, items]) => {
            const [x, y] = key.split(',').map(Number);
            return (
              <UprightAt key={key} board={board} x={x} y={y} height={0.2} className="z-10">
                <span className="relative left-3 -top-2 bg-yellow-500 text-black text-[8px] font-bold rounded-full w-3 h-3 flex items-center justify-center leading-none">
                  {items.length}
                </span>
              </UprightAt>
            );
          })}

          {/* Floating combat text */}
          {floatingTexts.map(ft => (
            <FloatingCombatText key={ft.id} ft={ft} at={board.toScreen(ft.gridX + 0.5, ft.gridY + 0.5, 0.5)} onComplete={onFloatingTextComplete} />
          ))}
        </Board>
  );
}

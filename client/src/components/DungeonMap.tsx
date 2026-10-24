import { useMemo, lazy, Suspense } from 'react';
import type { AreaType, TargetType } from '../data/combat/abilities';
import type { ActiveBuff, ActiveHot, ActiveDot } from '../data/units/stats';
import { isAlly, type EnemyInstance } from '../data/units/enemies';
import type { DungeonChest, ZoneData } from '../data/world/dungeonGen';
import type { FogState } from '../hooks/useFogOfWar';
import { yawFromGridMove } from '../forge/core/facing';
import { affectedKeys, isArea } from '../data/combat/areas';
import { chebyshev, hasLineOfSight, isAdjacent, posKey, samePos, type Pos } from '../data/world/grid';
import type { Item } from '../data/gear';
import { unitKey } from '../data/combat/abilityExecution';
import FloatingCombatText, { type FloatingText } from './FloatingCombatText';
import { MoveCostPips } from './MoveLine';
import { gameObjectGlow, gameObjectModel } from '../data/world/gameObjects';
import { Board, FloorGrid, FloorTile, HoverEdgeGlow, MoveLineOverlay, ObjectTag, PORTAL_TAG_HEIGHT, TileHighlight, UprightAt, UsableGlow, facingOpenSide, portalTag, toMapMember, useBoard, useHoveredTile, useStableHandler, type PartyTokenData, TILE_HIGHLIGHT } from './mapParts';
import UnitStatus, { statusMarkers } from './hud/UnitStatus';
import type { MapLoot, MapObject, UnitAim } from './ModelLayer';

// 3D party, enemy and loot models over the tile grid. Lazy: it pulls in three.js (GameScreen preloads it on mount).
const ModelLayer = lazy(() => import('./ModelLayer'));

/** Above an enemy's head: its effect markers (hoverable) over its HP bar. */
function enemyOverlay(enemy: EnemyInstance) {
  return <UnitStatus markers={statusMarkers(enemy.buffs, enemy.hots, enemy.dots)} hp={enemy.currentHp} maxHp={enemy.stats.hp} />;
}

interface Props {
  playerPos: Pos;                   // party leader (doors, portal and loot adjacency)
  activeMoverPos: Pos;
  party: PartyTokenData[];
  /** Tiles the active mover can move to this turn (tile key -> steps), from GameScreen (partyMoveTargets). */
  moveTargets: Map<string, number>;
  /** In combat: the AP moving to a tile costs (shown on the hovered tile as pips; 0 = already paid for). */
  moveApCost?: (steps: number) => number;
  onMove: (pos: Pos) => void;
  onLocationChange: (location: 'sanctum') => void;
  onDoorClick: (doorId: string) => void;
  /** The zone's treasure chests. */
  chests: DungeonChest[];
  /** Chests that have been emptied: their lids stand open, and they no longer glow. */
  emptiedChests: ReadonlySet<string>;
  /** A chest next to the leader was clicked (out of combat): open its window. */
  onOpenChest: (chestId: string) => void;
  activeTarget: TargetType | null;  // target type of the selected ability (null = none selected)
  activeAbilityArea?: AreaType;
  /**
   * Whether the selected ability's area helps (heals, buffs) or harms: its tiles show green or red. 'mixed'
   * (it harms enemies and helps allies): tiles with an enemy on them red, the rest green.
   */
  areaTone: 'help' | 'harm' | 'mixed';
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
  /** The unit (unitKey: a party member or summoned ally) a creature is about to hit; null when none. */
  enemyTargetKey: string | null;
  /** Tiles the selected 'tile' ability can be aimed at (GameScreen tileTargets); null when it isn't one. */
  tileTargets?: Set<string> | null;
  droppedItems?: Record<string, Item[]>;
  onLootClick?: (pos: Pos) => void;
  /** Where each unit last aimed an ability; its model turns to face it. */
  aims?: Record<string, UnitAim>;
  /** The 3D layer has drawn its first frame (ModelLayer onReady): the page stops hiding the map. */
  onReady?: () => void;
  /** Combatant id ('player-N' or an enemy id) whose tile to highlight (a hovered turn-order pill). */
  highlightUnitId?: string | null;
  /**
   * Fog of war (null: none). The 3D layer draws it over the floor and every model; the map's own HTML (loot
   * glows, pile counts, floating text) shows only on tiles the party knows. `enemies` are already only those in sight.
   */
  fog: FogState | null;
}

export default function DungeonMap({ playerPos, activeMoverPos, party, moveTargets, moveApCost, onMove, onLocationChange, onDoorClick, chests, emptiedChests, onOpenChest, activeTarget, activeAbilityArea, areaTone, actionRange, onAbilityUse, onAbilityDeselect, onMemberSelect, enemies, inCombat, isPlayerTurn, activeCombatantId, floatingTexts, onFloatingTextComplete, zone, portalPos, partyBuffs, partyHots, partyDots, floorColor, wallColor, doorObject, portalObject, enemyAoePreviewTiles, enemyTargetKey, tileTargets = null, droppedItems = {}, onLootClick, aims, highlightUnitId = null, fog, onReady }: Props) {
  const { width, height, floors, doors } = zone;
  const hover = useHoveredTile();
  const hoveredTile = hover.hovered;
  const board = useBoard(width, height);
  // Fog of war: tiles the party has seen at all (now or before), and tiles it sees now (no fog: everything)
  const isKnown = (key: string) => !fog || fog.visible.has(key) || fog.explored.has(key);
  const isSeenNow = (key: string) => !fog || fog.visible.has(key);
  // Tiles deep in the fog: unseen, and no tile around them seen either. The HTML floor draws them in the fog's
  // color, so the zone's layout never shows through, even before the 3D layer (and its fog) has drawn. The fog is
  // fully dark over them anyway; the tiles at its edge keep their colors, so its soft edge looks as it should.
  const deepFog = useMemo(() => {
    const deep = new Set<string>();
    if (!fog) return deep;
    const known = (x: number, y: number) => fog.visible.has(`${x},${y}`) || fog.explored.has(`${x},${y}`);
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        let near = false;
        for (let dx = -1; dx <= 1 && !near; dx++) for (let dy = -1; dy <= 1 && !near; dy++) near = known(x + dx, y + dy);
        if (!near) deep.add(`${x},${y}`);
      }
    }
    return deep;
  }, [fog, width, height]);

  const isAoE = isArea({ area: activeAbilityArea });
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
  // Party members drawn as their class models, with HP/MP bars and effect markers above their heads
  const modelParty = useMemo(
    () => party.map(m => toMapMember(m, statusMarkers(partyBuffs[m.partyIndex] ?? [], partyHots[m.partyIndex] ?? [], partyDots[m.partyIndex] ?? []))),
    [party, partyBuffs, partyHots, partyDots],
  );
  const doorByKey = useMemo(() => new Map(doors.map(d => [posKey(d.pos), d])), [doors]);
  const chestByKey = useMemo(() => new Map(chests.map(c => [posKey(c.pos), c])), [chests]);
  // Doors, the exit portal and chests, drawn as their game objects' models. A door stands in its wall tile
  // facing the floor it opens onto; a chest stands with its back to a wall (its `facing`), its lid open once
  // it has been emptied (its 'open' animation).
  const emptiedKey = [...emptiedChests].sort().join('|');
  const mapObjects = useMemo(() => {
    const isFloor = (q: Pos) => floors.has(posKey(q));
    const out: MapObject[] = doors.map(d => ({ id: d.id, link: gameObjectModel(doorObject), pos: d.pos, facing: facingOpenSide(d.pos, isFloor) }));
    if (portalPos) out.push({ id: 'portal', link: gameObjectModel(portalObject), pos: portalPos, facing: facingOpenSide(portalPos, isFloor) });
    for (const c of chests) {
      out.push({ id: c.id, link: gameObjectModel(c.object), pos: c.pos, facing: yawFromGridMove(...c.facing), played: emptiedChests.has(c.id) ? ['open'] : undefined });
    }
    return out;
  }, [doors, floors, portalPos, doorObject, portalObject, chests, emptiedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const inRangeWithLOS = (p: Pos) => chebyshev(activeMoverPos, p) <= actionRange && hasLineOfSight(activeMoverPos, p, floors);

  // AoE preview tiles (computed from hover position)
  const aoeTiles = useMemo(() => {
    // Enemy abilities only in combat (on the party's turn); ally ones out of combat too
    if (!activeTarget || !isAoE || !hoveredTile || !canAct || (activeTarget === 'enemy' && !inCombat) || !inRangeWithLOS(hoveredTile)) return new Set<string>();
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
    // A chest: open it from beside it, out of combat
    const chest = chestByKey.get(key);
    if (chest) {
      if (!inCombat && isAdjacent(playerPos, p)) onOpenChest(chest.id);
      return;
    }
    if (!floor) return;

    const enemy = enemyByKey.get(key);
    const member = memberByKey.get(key);

    // With ability active: route to attack handler
    if (activeTarget) {
      // Fires on a valid target for the ability's kind, else deselects ('self' fires only on the mover's own
      // tile: the handler deselects elsewhere)
      const valid = activeTarget === 'self' ? true
        : activeTarget === 'ally' ? isAoE || !!member || (!!enemy && isAlly(enemy)) // an area can be aimed at any tile; range is checked on use
        : activeTarget === 'tile' ? !!tileTargets?.has(key)
        : isAoE || (!!enemy && !isAlly(enemy));
      if (valid) onAbilityUse(p);
      else onAbilityDeselect();
      return;
    }

    if (enemy) return; // can't walk onto enemies (or stop on a summoned ally)

    // Loot pickup: click adjacent dropped item out of combat
    if (!inCombat && droppedItems[key]?.length && isAdjacent(playerPos, p)) {
      onLootClick?.(p);
      return;
    }

    // Out of combat: clicking a party member selects their action bar
    if (!inCombat && member) { onMemberSelect(member.partyIndex); return; }

    if (portalPos && samePos(p, portalPos)) {
      if (!inCombat && isAdjacentToPortal) onLocationChange('sanctum');
      return;
    }
    if (moveTargets.has(key)) onMove(p);
  };

  // Stable for the memoized tiles; always runs the latest handleClick
  const onTileClick = useStableHandler((p: Pos) => handleClick(p, floors.has(posKey(p))));

  const tile = (p: Pos) => {
    const key = posKey(p);
    const isPortal = !!portalPos && samePos(p, portalPos);
    const floor = floors.has(key);
    const member = memberByKey.get(key);
    const enemy = floor && !member ? enemyByKey.get(key) : undefined;
    const door = doorByKey.get(key);
    const targetable = enemy && !isAlly(enemy) && activeTarget === 'enemy' && !isAoE && inCombat && isPlayerTurn && inRangeWithLOS(enemy.pos);
    // A summoned ally takes the party's helpful abilities
    const isAllyUnit = !!member || (!!enemy && isAlly(enemy));
    const isMoverTile = samePos(p, activeMoverPos);
    const isSelfTile = activeTarget === 'self' && inCombat && isPlayerTurn && isMoverTile;
    const isDoorAdjacent = !!door && isAdjacent(playerPos, p);
    const chest = chestByKey.get(key);
    const isChestUsable = !!chest && !inCombat && !emptiedChests.has(chest.id) && isAdjacent(playerPos, p);
    const tileItems = floor && isKnown(key) ? droppedItems[key] : undefined;
    const isLootAdjacent = !inCombat && !!tileItems?.length && isAdjacent(playerPos, p);
    const unitOnTile = member ? unitKey({ side: 'party', idx: member.partyIndex }) : enemy?.id;
    const isEnemyTargeted = enemyTargetKey !== null && unitOnTile === enemyTargetKey;
    // A 'tile' ability: every tile it can be aimed at, softly; the hovered one as the target
    const isTileTarget = activeTarget === 'tile' && isPlayerTurn && !!tileTargets?.has(key);

    // Overlay on the tile (the floor stays visible under its muted tint)
    const highlight: keyof typeof TILE_HIGHLIGHT | null =
      enemy && enemy.id === activeCombatantId ? 'acting'
      : isSelfTile || (activeTarget === 'ally' && isAllyUnit && inRangeWithLOS(p)) || (isTileTarget && hover.isHovered(p)) ? 'ally'
      : targetable || isEnemyTargeted ? 'enemy'
      : isTileTarget ? 'areaHelp'
      : aoeTiles.has(key) ? (areaTone === 'help' || (areaTone === 'mixed' && !(enemy && !isAlly(enemy))) ? 'areaHelp' : 'areaHarm')
      : inCombat && isPlayerTurn && isMoverTile ? 'mover'
      : null;
    const isHighlightedUnit = !!highlightUnitId && (enemy?.id === highlightUnitId || (!!member && `player-${member.partyIndex}` === highlightUnitId));

    return (
      <FloorTile key={key} p={p} hover={hover} onClick={onTileClick}
        color={deepFog.has(key) ? 'var(--rift-fog)' : floor && !door ? floorColor : wallColor}
        brighten={floor && !door && !activeTarget && !highlight && moveTargets.has(key) && hover.isHovered(p)}>
        {tileItems?.[0] && (
          // The pile is drawn by ModelLayer; a glow on the floor under it shows it can be picked up
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-8 h-8 rounded-full ${isLootAdjacent ? 'animate-pulse' : 'invisible'}`}
              style={{ boxShadow: '0 0 10px 3px color-mix(in srgb, var(--rift-loot) 60%, transparent)' }} />
          </div>
        )}
        {/* A door, the portal or a chest the leader can use now: a soft pulsing glow on its tile (stronger on hover) */}
        {/* The portal, hovered from farther away: its edges glow faintly */}
        {isPortal && !isAdjacentToPortal && hover.isHovered(p) && <HoverEdgeGlow color={gameObjectGlow(portalObject)} />}
        {((door && isDoorAdjacent && !inCombat) || (isPortal && isAdjacentToPortal)) && (
          <UsableGlow color={gameObjectGlow(door ? doorObject : portalObject)} hovered={hover.isHovered(p)} />
        )}
        {chest && isChestUsable && <UsableGlow color={gameObjectGlow(chest.object)} hovered={hover.isHovered(p)} />}
        {highlight && <TileHighlight kind={highlight} />}
        {isHighlightedUnit && <TileHighlight kind="hovered" />}
        {enemyAoePreviewTiles?.has(key) && <TileHighlight kind="enemyArea" className="z-20 animate-pulse" />}
      </FloorTile>
    );
  };

  const showMoveLine = !activeTarget && canAct && !!hoveredTile && moveTargets.has(posKey(hoveredTile));
  const hoveredMoveAp = showMoveLine && moveApCost ? moveApCost(moveTargets.get(posKey(hoveredTile!))!) : 0;
  const floor = (
    <>
      <FloorGrid cols={width} rows={height} tile={tile} />
      {showMoveLine && hoveredTile && (
        <MoveLineOverlay from={activeMoverPos} to={hoveredTile} />
      )}
    </>
  );

  // No frame: the board floats on the game screen's background
  return (
    <Board board={board} floor={floor}>
      <Suspense fallback={null}>
        {/* Keyed by zone: entering another zone places every model fresh instead of gliding it across */}
        <ModelLayer key={zone.id} board={board} party={modelParty} enemies={modelEnemies} loot={modelLoot} objects={mapObjects} renderEnemyOverlay={enemyOverlay} aims={aims} fog={fog} onReady={onReady} />
      </Suspense>

      {/* The AP the hovered move costs, where its move line ends */}
      {hoveredMoveAp > 0 && hoveredTile && (
        <UprightAt board={board} x={hoveredTile.x} y={hoveredTile.y} className="z-20">
          <MoveCostPips ap={hoveredMoveAp} />
        </UprightAt>
      )}

      {/* How many items a pile holds, when more than one */}
      {Object.entries(droppedItems).filter(([key, items]) => items.length > 1 && isKnown(key)).map(([key, items]) => {
        const [x, y] = key.split(',').map(Number);
        return (
          <UprightAt key={key} board={board} x={x} y={y} height={0.2} className="z-10">
            <span className="relative left-3 -top-2 min-w-3.5 h-3.5 px-0.5 box-border flex items-center justify-center bg-rift-panel border border-rift-loot rounded-sm text-[9px] leading-none text-rift-loot">
              {items.length}
            </span>
          </UprightAt>
        );
      })}

      {/* Where the exit portal leads, at once while it is hovered, wherever the party stands */}
      {portalPos && hoveredTile && samePos(hoveredTile, portalPos) && isKnown(posKey(portalPos)) && (
        <ObjectTag board={board} x={portalPos.x} y={portalPos.y} height={PORTAL_TAG_HEIGHT} text={portalTag('The Sanctum')} />
      )}

      {/* Floating combat text */}
      {floatingTexts.filter(ft => isSeenNow(posKey({ x: ft.gridX, y: ft.gridY }))).map(ft => (
        <FloatingCombatText key={ft.id} ft={ft} at={board.toScreen(ft.gridX + 0.5, ft.gridY + 0.5, 0.5)} onComplete={onFloatingTextComplete} />
      ))}
    </Board>
  );
}

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
import { RIFT_MODELS, riftGlowCss } from '../data/world/rifts';
import { DUNGEONS, type DungeonKey } from '../data/world/dungeons';

/** How high (world tiles) a rift key's name tag sits over the floor it lies on. */
const KEY_TAG_HEIGHT = 0.35;
import type { RGB } from '../forge/core/vec';
import { Board, FloorGrid, FloorTile, HoverEdgeGlow, deepFogTiles, MoveLineOverlay, ObjectTag, RIFT_TAG_HEIGHT, TileHighlight, UprightAt, UsableGlow, facingOpenSide, riftTag, toMapMember, useBoard, useHoveredTile, useStableHandler, type PartyTokenData, TILE_HIGHLIGHT } from './mapParts';
import UnitStatus, { statusMarkers } from './hud/UnitStatus';
import type { MapLoot, MapObject, UnitAim } from './ModelLayer';

// 3D party, enemy and loot models over the tile grid. Lazy: it pulls in three.js (GameScreen preloads it on mount).
const ModelLayer = lazy(() => import('./ModelLayer'));

/** Above an enemy's head: its effect markers (hoverable) over its HP bar. */
function enemyOverlay(enemy: EnemyInstance) {
  return <UnitStatus markers={statusMarkers(enemy.buffs, enemy.hots, enemy.dots)} hp={enemy.currentHp} maxHp={enemy.stats.hp} />;
}

interface Props {
  playerPos: Pos;                   // party leader (doors, rift and loot adjacency)
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
  riftPos: Pos | null;
  partyBuffs: ActiveBuff[][];
  partyHots: ActiveHot[][];
  partyDots: ActiveDot[][];
  floorColor: string;
  wallColor: string;
  /** GAME_OBJECTS ids of this dungeon's doors and exit rift (DungeonConfig). */
  doorObject: string;
  riftColor: RGB;
  enemyAoePreviewTiles?: Set<string>;
  /** The unit (unitKey: a party member or summoned ally) a creature is about to hit; null when none. */
  enemyTargetKey: string | null;
  /** Tiles the selected 'tile' ability can be aimed at (GameScreen tileTargets); null when it isn't one. */
  tileTargets?: Set<string> | null;
  droppedItems?: Record<string, Item[]>;
  onLootClick?: (pos: Pos) => void;
  /** Rift keys lying on the floor ("x,y" → the dungeon whose key it is): drawn in its color, picked up by a click. */
  droppedKeys?: Record<string, DungeonKey>;
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

export default function DungeonMap({ playerPos, activeMoverPos, party, moveTargets, moveApCost, onMove, onLocationChange, onDoorClick, chests, emptiedChests, onOpenChest, activeTarget, activeAbilityArea, areaTone, actionRange, onAbilityUse, onAbilityDeselect, onMemberSelect, enemies, inCombat, isPlayerTurn, activeCombatantId, floatingTexts, onFloatingTextComplete, zone, riftPos, partyBuffs, partyHots, partyDots, floorColor, wallColor, doorObject, riftColor, enemyAoePreviewTiles, enemyTargetKey, tileTargets = null, droppedItems = {}, droppedKeys = {}, onLootClick, aims, highlightUnitId = null, fog, onReady }: Props) {
  const { width, height, floors, doors } = zone;
  const hover = useHoveredTile();
  const hoveredTile = hover.hovered;
  const board = useBoard(width, height);
  // Fog of war: tiles the party has seen at all (now or before), and tiles it sees now (no fog: everything)
  const isKnown = (key: string) => !fog || fog.visible.has(key) || fog.explored.has(key);
  const isSeenNow = (key: string) => !fog || fog.visible.has(key);
  // Tiles deep in the fog: drawn in the fog's color (deepFogTiles)
  const deepFog = useMemo(() => (fog ? deepFogTiles(fog, width, height) : new Set<string>()), [fog, width, height]);

  const isAoE = isArea({ area: activeAbilityArea });
  const canAct = !inCombat || isPlayerTurn;
  const isAdjacentToRift = riftPos ? isAdjacent(playerPos, riftPos) : false;

  // Per-tile lookups, built once per render instead of scanning lists for every tile
  const enemyByKey = useMemo(() => new Map(enemies.filter(e => e.currentHp > 0).map(e => [posKey(e.pos), e])), [enemies]);
  // Living enemies drawn as models (stable array while `enemies` is unchanged, so ModelLayer can memo on it)
  const modelEnemies = useMemo(() => enemies.filter(e => e.currentHp > 0), [enemies]);
  const memberByKey = useMemo(() => new Map(party.map(m => [posKey(m.pos), m])), [party]);
  // Loot drawn as models: the top item of each pile, and each rift key (the keystone, in its dungeon's color)
  const modelLoot = useMemo(() => {
    const out: MapLoot[] = [];
    for (const [key, items] of Object.entries(droppedItems)) {
      const top = items[0];
      if (!top) continue;
      const [x, y] = key.split(',').map(Number);
      out.push({ id: top.id, link: top.model, pos: { x, y } });
    }
    for (const [key, dungeon] of Object.entries(droppedKeys)) {
      const [x, y] = key.split(',').map(Number);
      out.push({ id: `key-${dungeon}`, link: RIFT_MODELS.keystone.model, pos: { x, y }, tint: DUNGEONS[dungeon].riftColor });
    }
    return out;
  }, [droppedItems, droppedKeys]);
  // Party members drawn as their class models, with HP/MP bars and effect markers above their heads
  const modelParty = useMemo(
    () => party.map(m => toMapMember(m, statusMarkers(partyBuffs[m.partyIndex] ?? [], partyHots[m.partyIndex] ?? [], partyDots[m.partyIndex] ?? []))),
    [party, partyBuffs, partyHots, partyDots],
  );
  const doorByKey = useMemo(() => new Map(doors.map(d => [posKey(d.pos), d])), [doors]);
  const chestByKey = useMemo(() => new Map(chests.map(c => [posKey(c.pos), c])), [chests]);
  // Doors, the exit rift and chests, drawn as their game objects' models. A door stands in its wall tile
  // facing the floor it opens onto; a chest stands with its back to a wall (its `facing`), its lid open once
  // it has been emptied (its 'open' animation).
  const emptiedKey = [...emptiedChests].sort().join('|');
  const mapObjects = useMemo(() => {
    const isFloor = (q: Pos) => floors.has(posKey(q));
    const out: MapObject[] = doors.map(d => ({ id: d.id, link: gameObjectModel(doorObject), pos: d.pos, facing: facingOpenSide(d.pos, isFloor) }));
    if (riftPos) out.push({ id: 'rift', link: RIFT_MODELS.rift.model, pos: riftPos, facing: facingOpenSide(riftPos, isFloor), tint: riftColor });
    for (const c of chests) {
      out.push({ id: c.id, link: gameObjectModel(c.object), pos: c.pos, facing: yawFromGridMove(...c.facing), played: emptiedChests.has(c.id) ? ['open'] : undefined });
    }
    return out;
  }, [doors, floors, riftPos, doorObject, riftColor, chests, emptiedKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!inCombat && (droppedItems[key]?.length || droppedKeys[key]) && isAdjacent(playerPos, p)) {
      onLootClick?.(p);
      return;
    }

    // Out of combat: clicking a party member selects their action bar
    if (!inCombat && member) { onMemberSelect(member.partyIndex); return; }

    if (riftPos && samePos(p, riftPos)) {
      if (!inCombat && isAdjacentToRift) onLocationChange('sanctum');
      return;
    }
    if (moveTargets.has(key)) onMove(p);
  };

  // Stable for the memoized tiles; always runs the latest handleClick
  const onTileClick = useStableHandler((p: Pos) => handleClick(p, floors.has(posKey(p))));

  const tile = (p: Pos) => {
    const key = posKey(p);
    const isRift = !!riftPos && samePos(p, riftPos);
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
    const tileKey = floor && isKnown(key) ? droppedKeys[key] : undefined;
    const isLootAdjacent = !inCombat && (!!tileItems?.length || !!tileKey) && isAdjacent(playerPos, p);
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
        {(tileItems?.[0] || tileKey) && (
          // The pile (or rift key) is drawn by ModelLayer; a glow on the floor under it shows it can be picked up,
          // in the key's own color for a key
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-8 h-8 rounded-full ${isLootAdjacent ? 'animate-pulse' : 'invisible'}`}
              style={{ boxShadow: `0 0 10px 3px color-mix(in srgb, ${tileKey ? riftGlowCss(DUNGEONS[tileKey].riftColor) : 'var(--rift-loot)'} 60%, transparent)` }} />
          </div>
        )}
        {/* A door, the rift or a chest the leader can use now: a soft pulsing glow on its tile (stronger on hover) */}
        {/* The rift, hovered from farther away: its edges glow faintly */}
        {isRift && !isAdjacentToRift && hover.isHovered(p) && <HoverEdgeGlow color={riftGlowCss(riftColor)} />}
        {((door && isDoorAdjacent && !inCombat) || (isRift && isAdjacentToRift)) && (
          <UsableGlow color={door ? gameObjectGlow(doorObject) : riftGlowCss(riftColor)} hovered={hover.isHovered(p)} />
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

      {/* A rift key's name while it is hovered */}
      {hoveredTile && droppedKeys[posKey(hoveredTile)] && isKnown(posKey(hoveredTile)) && (
        <ObjectTag board={board} x={hoveredTile.x} y={hoveredTile.y} height={KEY_TAG_HEIGHT} text={DUNGEONS[droppedKeys[posKey(hoveredTile)]].keyName} />
      )}

      {/* Where the exit rift leads, at once while it is hovered, wherever the party stands */}
      {riftPos && hoveredTile && samePos(hoveredTile, riftPos) && isKnown(posKey(riftPos)) && (
        <ObjectTag board={board} x={riftPos.x} y={riftPos.y} height={RIFT_TAG_HEIGHT} text={riftTag('The Sanctum')} />
      )}

      {/* Floating combat text */}
      {floatingTexts.filter(ft => isSeenNow(posKey({ x: ft.gridX, y: ft.gridY }))).map(ft => (
        <FloatingCombatText key={ft.id} ft={ft} at={board.toScreen(ft.gridX + 0.5, ft.gridY + 0.5, 0.5)} onComplete={onFloatingTextComplete} />
      ))}
    </Board>
  );
}

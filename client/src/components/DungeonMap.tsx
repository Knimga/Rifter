import { useMemo, useState, lazy, Suspense } from 'react';
import { FaCoins } from 'react-icons/fa';
import { loot } from '../data/gear/loot';
import { totalShards, type ShardCounts } from '../data/gear/shards';
import { formatGold } from '../data/detailStrings';
import type { AreaType, TargetType } from '../data/combat/abilities';
import type { ActiveBuff, ActiveHot, ActiveDot } from '../data/units/stats';
import { bodyOf, isAlly, type EnemyInstance } from '../data/units/enemies';
import type { DungeonChest, DungeonConfig, ZoneData } from '../data/world/dungeonGen';
import { sceneryObjects, zoneGround } from './zoneScenery';
import type { FogState } from '../hooks/useFogOfWar';
import type { EnemyAoePreview } from '../hooks/useEnemyTurn';
import { facingOpenSide, yawFromGridMove } from '../forge/core/facing';
import { buildTerrain } from '../forge/terrain/build';
import type { TerrainStyle } from '../forge/terrain/types';
import { affectedKeys, areaCenter, isArea } from '../data/combat/areas';
import { footprintKeys, inRangeAndSight, isAdjacent, keyPos, posKey, samePos, type Pos } from '../data/world/grid';
import type { Item } from '../data/gear';
import { unitKey } from '../data/combat/abilityExecution';
import type { FloatingText } from './FloatingCombatText';
import { MoveCostPips } from './MoveLine';
import { interactiveObjectGlow, interactiveObjectModel, interactiveObjectName } from '../data/world/interactiveObjects';
import { RIFT_MODELS, SANCTUM_RIFT_COLOR, riftGlowCss } from '../data/world/rifts';
import { DUNGEONS, type DungeonKey } from '../data/world/dungeons';
import { Board, FloorGrid, FloorTile, HoverEdgeGlow, MapFloats, MapTag, MoveLineOverlay, ObjectTag, RIFT_TAG_HEIGHT, TileHighlight, UprightAt, UsableGlow, riftTag, toMapMember, useBoard, useHoveredTile, useStableHandler, type PartyTokenData, TILE_HIGHLIGHT } from './mapParts';
import UnitStatus, { statusMarkers } from './hud/UnitStatus';
import type { MapLoot, MapObject, UnitAim, UnitFx } from './ModelLayer';

/** How high (world tiles) a rift key's name tag (or a gold pile's amount) sits over the floor it lies on. */
const KEY_TAG_HEIGHT = 0.35;
/** How high a container's name tag sits: just over a chest's lid (a dead adventurer, lying flat, is lower still). */
const CONTAINER_TAG_HEIGHT = 0.62;

// 3D party, enemy and loot models over the tile grid. Lazy: it pulls in three.js (GameScreen preloads it on mount).
const ModelLayer = lazy(() => import('./ModelLayer'));

/** Above an enemy's head: its effect markers (hoverable) over its HP bar, and its name over them while it is hovered. */
function enemyOverlay(enemy: EnemyInstance, hovered: boolean) {
  return (
    <>
      {hovered && <MapTag text={enemy.classData.name} className="mb-1" />}
      <UnitStatus markers={statusMarkers(enemy.buffs, enemy.hots, enemy.dots)} hp={enemy.currentHp} maxHp={enemy.stats.hp}
        mp={enemy.currentMp} maxMp={enemy.stats.mp} />
    </>
  );
}

interface Props {
  playerPos: Pos;                   // party leader (doors and loot adjacency)
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
  /** The zone's rift back to the Sanctum, if it has one (zoneRift), drawn in SANCTUM_RIFT_COLOR. */
  riftPos: Pos | null;
  partyBuffs: ActiveBuff[][];
  partyHots: ActiveHot[][];
  partyDots: ActiveDot[][];
  /** The dungeon's look: its 3D floor and walls are built from it and the zone's tiles (forge/terrain). */
  terrain: TerrainStyle;
  /** The dungeon's clutter (DungeonConfig.clutter), strewn over the zone's walls and floor by the view. */
  clutter?: DungeonConfig['clutter'];
  /** INTERACTIVE_OBJECTS id of this dungeon's doors (DungeonConfig). */
  doorObject: string;
  /** A creature's area ability about to land: its tiles, green when it helps (a buff or heal), red when it harms. */
  enemyAoePreview?: EnemyAoePreview | null;
  /** The unit (unitKey: a party member or summoned ally) a creature is about to hit; null when none. */
  enemyTargetKey: string | null;
  /** Tiles the selected 'tile' ability can be aimed at (GameScreen tileTargets); null when it isn't one. */
  tileTargets?: Set<string> | null;
  droppedItems?: Record<string, Item[]>;
  onLootClick?: (pos: Pos) => void;
  /** Rift keys lying on the floor ("x,y" → the dungeon whose key it is): drawn in its color, picked up by a click. */
  droppedKeys?: Record<string, DungeonKey>;
  /** Gold lying on the floor ("x,y" → how much): drawn as the Gold Coins model, picked up by a click. */
  droppedGold?: Record<string, number>;
  /** Affix shards lying on the floor ("x,y" → which): drawn as the Affix Shards model, picked up by a click. */
  droppedShards?: Record<string, ShardCounts>;
  /** Where each unit last aimed an ability; its model turns to face it. */
  aims?: Record<string, UnitAim>;
  /** The feedback each unit's model last showed (a hit's flash, a heal's or effect's glow): a new one plays. */
  fx?: Record<string, UnitFx>;
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

export default function DungeonMap({ playerPos, activeMoverPos, party, moveTargets, moveApCost, onMove, onLocationChange, onDoorClick, chests, emptiedChests, onOpenChest, activeTarget, activeAbilityArea, areaTone, actionRange, onAbilityUse, onAbilityDeselect, onMemberSelect, enemies, inCombat, isPlayerTurn, activeCombatantId, floatingTexts, onFloatingTextComplete, zone, riftPos, partyBuffs, partyHots, partyDots, terrain, clutter, doorObject, enemyAoePreview, enemyTargetKey, tileTargets = null, droppedItems = {}, droppedKeys = {}, droppedGold = {}, droppedShards = {}, onLootClick, aims, fx, highlightUnitId = null, fog, onReady }: Props) {
  const { width, height, floors, doors } = zone;
  const hover = useHoveredTile();
  const hoveredTile = hover.hovered;
  const board = useBoard(width, height);
  // Fog of war: tiles the party has seen at all (now or before), and tiles it sees now (no fog: everything)
  const isKnown = (key: string) => !fog || fog.visible.has(key) || fog.explored.has(key);
  const isSeenNow = (key: string) => !fog || fog.visible.has(key);
  // The zone's 3D floor and walls (the same zone always looks the same), drawn by ModelLayer: the floor on a canvas
  // under the tiles (the Board's `under` slot), the walls with the models
  const zoneTerrain = useMemo(
    () => buildTerrain({ cols: width, rows: height, floors: zoneGround(zone), doors: doors.map(d => d.pos), style: terrain, seed: zone.id }),
    [width, height, floors, doors, terrain, zone.id], // eslint-disable-line react-hooks/exhaustive-deps -- the zone object changes with its loot; its layout (obstacles too) by its id and floor
  );
  const [terrainHost, setTerrainHost] = useState<HTMLDivElement | null>(null);

  const isAoE = isArea({ area: activeAbilityArea });
  const canAct = !inCombat || isPlayerTurn;
  // The rift takes the party back from beside the one moving (the leader; in combat too, the member whose turn it is)
  const isAdjacentToRift = riftPos ? isAdjacent(activeMoverPos, riftPos) : false;

  // Per-tile lookups, built once per render instead of scanning lists for every tile
  // Living enemies drawn as models (stable array while `enemies` is unchanged, so ModelLayer can memo on it)
  const modelEnemies = useMemo(() => enemies.filter(e => e.currentHp > 0), [enemies]);
  // Every tile of each (all 4 of a large one's): hovering, clicking and highlighting work on any of them
  const enemyByKey = useMemo(() => new Map(modelEnemies.flatMap(e => footprintKeys(bodyOf(e)).map(k => [k, e] as const))), [modelEnemies]);
  const memberByKey = useMemo(() => new Map(party.map(m => [posKey(m.pos), m])), [party]);
  // Loot drawn as models: the top item of each pile, each rift key (the keystone, in its dungeon's color), each
  // pile of gold (its coins scattered by its tile: each pile looks its own) and each group of shards
  const modelLoot = useMemo(() => {
    const out: MapLoot[] = [];
    for (const [key, items] of Object.entries(droppedItems)) {
      const top = items[0];
      if (!top) continue;
      out.push({ id: top.id, link: top.model, pos: keyPos(key) });
    }
    for (const [key, dungeon] of Object.entries(droppedKeys)) {
      out.push({ id: `key-${dungeon}`, link: RIFT_MODELS.keystone.model, pos: keyPos(key), tint: DUNGEONS[dungeon].riftColor });
    }
    for (const key of Object.keys(droppedGold)) out.push({ id: `gold-${zone.id}-${key}`, link: loot('gold').model, pos: keyPos(key) });
    for (const key of Object.keys(droppedShards)) out.push({ id: `shards-${zone.id}-${key}`, link: loot('affix-shards').model, pos: keyPos(key) });
    return out;
  }, [droppedItems, droppedKeys, droppedGold, droppedShards, zone.id]);
  // Party members drawn as their class models, with HP/MP bars and effect markers above their heads
  const modelParty = useMemo(
    () => party.map(m => toMapMember(m, statusMarkers(partyBuffs[m.partyIndex] ?? [], partyHots[m.partyIndex] ?? [], partyDots[m.partyIndex] ?? []))),
    [party, partyBuffs, partyHots, partyDots],
  );
  const doorByKey = useMemo(() => new Map(doors.map(d => [posKey(d.pos), d])), [doors]);
  const chestByKey = useMemo(() => new Map(chests.map(c => [posKey(c.pos), c])), [chests]);
  // Doors, the zone's rift and chests, drawn as their interactive objects' models. A door stands in its wall tile
  // facing the floor it opens onto; a chest stands with its back to a wall (its `facing`), its lid open once
  // it has been emptied (its 'open' animation).
  const emptiedKey = [...emptiedChests].sort().join('|');
  // Its obstacles and clutter (zoneScenery): no clutter on or against a door, the rift or a chest
  const scenery = useMemo(
    () => sceneryObjects(zone, clutter, [...(riftPos ? [riftPos] : []), ...chests.map(c => c.pos)]),
    [zone.id, floors, doors, riftPos, chests, clutter], // eslint-disable-line react-hooks/exhaustive-deps -- the zone's layout, by its id and floor
  );
  const mapObjects = useMemo(() => {
    const isFloor = (q: Pos) => floors.has(posKey(q));
    const out: MapObject[] = doors.map(d => ({ id: d.id, link: interactiveObjectModel(doorObject), pos: d.pos, facing: facingOpenSide(d.pos, isFloor) }));
    if (riftPos) out.push({ id: 'rift', link: RIFT_MODELS.rift.model, pos: riftPos, facing: facingOpenSide(riftPos, isFloor), tint: SANCTUM_RIFT_COLOR });
    for (const c of chests) {
      out.push({ id: c.id, link: interactiveObjectModel(c.object), pos: c.pos, facing: yawFromGridMove(...c.facing), played: emptiedChests.has(c.id) ? ['open'] : undefined });
    }
    return [...out, ...scenery];
  }, [doors, floors, riftPos, doorObject, chests, emptiedKey, scenery]); // eslint-disable-line react-hooks/exhaustive-deps

  // What aiming at a tile aims at: the large creature on it (all of it), else the tile (as aimPartyAction does)
  const enemyBodies = useMemo(() => modelEnemies.map(bodyOf), [modelEnemies]);
  const aimAt = (p: Pos) => areaCenter(p, enemyBodies);
  const inRangeWithLOS = (p: Pos) => inRangeAndSight(activeMoverPos, aimAt(p), actionRange, zone.sight);

  // AoE preview tiles (computed from hover position)
  const aoeTiles = useMemo(() => {
    // Enemy abilities only in combat (on the party's turn); ally ones out of combat too
    if (!activeTarget || !isAoE || !hoveredTile || !canAct || (activeTarget === 'enemy' && !inCombat) || !inRangeWithLOS(hoveredTile)) return new Set<string>();
    return affectedKeys(activeMoverPos, aimAt(hoveredTile), activeAbilityArea, zone.sight);
  }, [activeTarget, isAoE, hoveredTile, inCombat, isPlayerTurn, activeMoverPos, actionRange, zone.sight, activeAbilityArea, enemyBodies]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!inCombat && (droppedItems[key]?.length || droppedKeys[key] || droppedGold[key] || droppedShards[key]) && isAdjacent(playerPos, p)) {
      onLootClick?.(p);
      return;
    }

    // Out of combat: clicking a party member selects their action bar
    if (!inCombat && member) { onMemberSelect(member.partyIndex); return; }

    if (riftPos && samePos(p, riftPos)) {
      if (isAdjacentToRift) onLocationChange('sanctum');
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
    const targetable = enemy && !isAlly(enemy) && activeTarget === 'enemy' && !isAoE && inCombat && isPlayerTurn && inRangeWithLOS(p);
    // A summoned ally takes the party's helpful abilities
    const isAllyUnit = !!member || (!!enemy && isAlly(enemy));
    const isMoverTile = samePos(p, activeMoverPos);
    const isSelfTile = activeTarget === 'self' && inCombat && isPlayerTurn && isMoverTile;
    const isDoorAdjacent = !!door && isAdjacent(playerPos, p);
    const chest = chestByKey.get(key);
    const isChestUsable = !!chest && !inCombat && !emptiedChests.has(chest.id) && isAdjacent(playerPos, p);
    const tileItems = floor && isKnown(key) ? droppedItems[key] : undefined;
    const tileKey = floor && isKnown(key) ? droppedKeys[key] : undefined;
    const tileGold = floor && isKnown(key) ? droppedGold[key] : undefined;
    const tileShards = floor && isKnown(key) ? droppedShards[key] : undefined;
    const isLootAdjacent = !inCombat && (!!tileItems?.length || !!tileKey || !!tileGold || !!tileShards) && isAdjacent(playerPos, p);
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
        brighten={floor && !door && !activeTarget && !highlight && moveTargets.has(key) && hover.isHovered(p)}>
        {(tileItems?.[0] || tileKey || tileGold || tileShards) && (
          // The pile (an item, a rift key, gold, shards) is drawn by ModelLayer; a soft round glow on the floor under
          // it, pale yellow whatever lies there, shows it can be picked up
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className={`w-10 h-10 rounded-full ${isLootAdjacent ? 'animate-pulse' : 'invisible'}`}
              style={{ background: 'radial-gradient(circle, color-mix(in srgb, var(--rift-loot-glow) 55%, transparent) 0%, color-mix(in srgb, var(--rift-loot-glow) 22%, transparent) 45%, transparent 70%)' }} />
          </div>
        )}
        {/* A door, the rift or a chest the leader can use now: a soft pulsing glow on its tile (stronger on hover) */}
        {/* The rift, hovered from farther away: its edges glow faintly */}
        {isRift && !isAdjacentToRift && hover.isHovered(p) && <HoverEdgeGlow color={riftGlowCss(SANCTUM_RIFT_COLOR)} />}
        {((door && isDoorAdjacent && !inCombat) || (isRift && isAdjacentToRift)) && (
          <UsableGlow color={door ? interactiveObjectGlow(doorObject) : riftGlowCss(SANCTUM_RIFT_COLOR)} hovered={hover.isHovered(p)} />
        )}
        {chest && isChestUsable && <UsableGlow color={interactiveObjectGlow(chest.object)} hovered={hover.isHovered(p)} />}
        {highlight && <TileHighlight kind={highlight} />}
        {isHighlightedUnit && <TileHighlight kind="hovered" />}
        {enemyAoePreview?.tiles.has(key) && <TileHighlight kind={enemyAoePreview.helpful ? 'areaHelp' : 'enemyArea'} className="z-20 animate-pulse" />}
      </FloorTile>
    );
  };

  // The enemy on the hovered tile, if the party sees it now: its name shows over its head
  const hoveredEnemyId = hoveredTile && isSeenNow(posKey(hoveredTile)) ? enemyByKey.get(posKey(hoveredTile))?.id : undefined;
  const renderEnemyOverlay = (e: EnemyInstance) => enemyOverlay(e, e.id === hoveredEnemyId);
  // The container on the hovered tile, if the party knows the tile: its name shows over it
  const hoveredContainer = hoveredTile && isKnown(posKey(hoveredTile)) ? chestByKey.get(posKey(hoveredTile)) : undefined;

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
    <Board board={board} floor={floor} under={<div ref={setTerrainHost} className="absolute inset-0 pointer-events-none" />}>
      <Suspense fallback={null}>
        {/* Keyed by zone: entering another zone places every model fresh instead of gliding it across */}
        <ModelLayer key={zone.id} board={board} party={modelParty} enemies={modelEnemies} loot={modelLoot} objects={mapObjects} renderEnemyOverlay={renderEnemyOverlay} aims={aims} fx={fx} fog={fog} onReady={onReady} terrain={zoneTerrain} terrainHost={terrainHost} />
      </Suspense>

      {/* The AP the hovered move costs, where its move line ends */}
      {hoveredMoveAp > 0 && hoveredTile && (
        <UprightAt board={board} x={hoveredTile.x} y={hoveredTile.y} className="z-20">
          <MoveCostPips ap={hoveredMoveAp} />
        </UprightAt>
      )}

      {/* How many items a pile holds, when more than one */}
      {Object.entries(droppedItems).filter(([key, items]) => items.length > 1 && isKnown(key)).map(([key, items]) => {
        const { x, y } = keyPos(key);
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

      {/* How much gold lies there, while it is hovered */}
      {hoveredTile && droppedGold[posKey(hoveredTile)] && isKnown(posKey(hoveredTile)) && (
        <ObjectTag board={board} x={hoveredTile.x} y={hoveredTile.y} height={KEY_TAG_HEIGHT}
          text={formatGold(droppedGold[posKey(hoveredTile)])} icon={<FaCoins aria-label="Gold" className="w-3 h-3 shrink-0" style={{ color: 'var(--rift-gold)' }} />} />
      )}

      {/* How many shards lie there, while they are hovered */}
      {hoveredTile && droppedShards[posKey(hoveredTile)] && isKnown(posKey(hoveredTile)) && (
        <ObjectTag board={board} x={hoveredTile.x} y={hoveredTile.y} height={KEY_TAG_HEIGHT}
          text={`${totalShards(droppedShards[posKey(hoveredTile)])} Affix Shards`} />
      )}

      {/* A container's name (a chest, a dead adventurer) while it is hovered */}
      {hoveredContainer && (
        <ObjectTag board={board} x={hoveredContainer.pos.x} y={hoveredContainer.pos.y} height={CONTAINER_TAG_HEIGHT} text={interactiveObjectName(hoveredContainer.object)} />
      )}

      {/* Where the exit rift leads, at once while it is hovered, wherever the party stands */}
      {riftPos && hoveredTile && samePos(hoveredTile, riftPos) && isKnown(posKey(riftPos)) && (
        <ObjectTag board={board} x={riftPos.x} y={riftPos.y} height={RIFT_TAG_HEIGHT} text={riftTag('The Sanctum')} />
      )}

      {/* Floating combat text, over tiles the party sees (a large creature's, between tiles: seen by the tile at its top left) */}
      <MapFloats board={board} floats={floatingTexts} onComplete={onFloatingTextComplete}
        shown={ft => isSeenNow(posKey({ x: Math.floor(ft.gridX), y: Math.floor(ft.gridY) }))} />
    </Board>
  );
}

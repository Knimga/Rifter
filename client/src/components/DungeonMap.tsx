import { useMemo, useState, lazy, Suspense, type ReactNode } from 'react';
import { FaCoins } from 'react-icons/fa';
import { loot } from '../data/gear/loot';
import { totalShards, type ShardCounts } from '../data/gear/shards';
import { formatGold } from '../data/detailStrings';
import type { AreaType, TargetType } from '../data/combat/abilities';
import type { ActiveBuff, ActiveHot, ActiveDot } from '../data/units/stats';
import { bodyOf, creatureName, isAlly, type EnemyInstance } from '../data/units/enemies';
import type { DungeonChest, DungeonConfig, ZoneData } from '../data/world/gen';
import { doorObjects, riftObject, sceneryObjects, zoneGround } from './zoneScenery';
import type { FogState } from '../hooks/useFogOfWar';
import type { EnemyAoePreview } from '../hooks/useEnemyTurn';
import { yawFromGridMove } from '../forge/core/facing';
import { buildTerrain } from '../forge/terrain/build';
import type { TerrainStyle } from '../forge/terrain/types';
import { affectedKeys, areaCenter, isArea } from '../data/combat/areas';
import { footprintKeys, inRangeAndSight, isAdjacent, keyPos, posKey, samePos, type Pos } from '../data/world/grid';
import { approachTile, closestReachable } from '../data/world/movement';
import type { Item } from '../data/gear';
import { unitKey } from '../data/combat/abilityExecution';
import type { FloatingText } from './FloatingCombatText';
import { MoveCostPips } from './MoveLine';
import { interactiveObjectGlow, interactiveObjectModel, interactiveObjectName } from '../data/world/interactiveObjects';
import { SANCTUM_RIFT_COLOR, riftGlowCss } from '../data/world/rifts';
import { DUNGEONS, type DungeonKey } from '../data/world/dungeons';
import type { QuestMark } from '../data/world/dialogue';
import { Board, FloorGrid, FloorTile, HoverEdgeGlow, KEY_TAG_HEIGHT, LootSparkle, MapFloats, MapTag, MoveLineOverlay, ObjectTag, RIFT_TAG_HEIGHT, TileHighlight, UprightAt, UsableGlow, riftTag, toMapMember, useBoard, useHoveredTile, useStableHandler, keyLoot, type PartyTokenData, TILE_HIGHLIGHT } from './mapParts';
import UnitStatus, { statusMarkers } from './hud/UnitStatus';
import type { MapLoot, MapObject, UnitAim, UnitFx, UnitMove } from './ModelLayer';
import type { MovePlan } from '../data/combat/abilityMoves';

/** How high a container's name tag sits: just over a chest's lid (a dead adventurer, lying flat, is lower still). */
const CONTAINER_TAG_HEIGHT = 0.62;
/** How high (world tiles) a quest marker floats over a rift key lying on the floor: above its keystone, clear of its name tag. */
const KEY_MARK_HEIGHT = 0.95;
/** How high (world tiles) a dialogue spoken over a tile points (a found key's): over the head and bars of the leader standing there. */
const DIALOGUE_HEIGHT = 1.6;

/** No extra map objects (DungeonMap's sceneObjects): one stable array. */
const NO_OBJECTS: MapObject[] = [];

// 3D party, enemy and loot models over the tile grid. Lazy: it pulls in three.js (GameScreen preloads it on mount).
const ModelLayer = lazy(() => import('./ModelLayer'));

/** Above an enemy's head: its effect markers (hoverable) over its HP bar, and its name over them while it is hovered. */
function enemyOverlay(enemy: EnemyInstance, hovered: boolean) {
  return (
    <>
      {hovered && <MapTag text={creatureName(enemy)} className="mb-1" />}
      <UnitStatus markers={statusMarkers(enemy.buffs, enemy.hots, enemy.dots)} hp={enemy.currentHp} maxHp={enemy.stats.hp}
        mp={enemy.currentMp} maxMp={enemy.stats.mp} />
    </>
  );
}

/** What a click on a tile does (DungeonMap's clickPlan): walk to `walk` if set, then `use` if set. */
interface ClickPlan { walk: Pos | null; use?: () => void }

interface Props {
  playerPos: Pos;                   // party leader (doors and loot adjacency)
  activeMoverPos: Pos;
  party: PartyTokenData[];
  /** Tiles the active mover can move to this turn (tile key -> steps), from GameScreen (partyMoveTargets). */
  moveTargets: Map<string, number>;
  /** In combat: the AP moving to a tile costs (shown on the hovered tile as pips; 0 = already paid for). */
  moveApCost?: (steps: number) => number;
  /** Move the active member to a reachable tile: true if it moved and no fight began (a click then uses what it walked to). */
  onMove: (pos: Pos) => boolean;
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
  /** Its rift hasn't opened yet (riftShut: the boss lives): not drawn, nor used. When it opens, it plays its opening. */
  riftShut?: boolean;
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
  /** The selected ability is a movement ability (Ability.move): it is aimed only at `moveAims`, whatever its target kind. */
  activeMove?: boolean;
  /** Where the selected movement ability can be aimed, with the move each makes (GameScreen moveAims); null: nowhere. */
  moveAims?: ReadonlyMap<string, MovePlan> | null;
  droppedItems?: Record<string, Item[]>;
  onLootClick?: (pos: Pos) => void;
  /** Rift keys lying on the floor ("x,y" → the dungeon whose key it is): drawn in its color, picked up by a click. */
  droppedKeys?: Record<string, DungeonKey>;
  /**
   * A quest marker over every rift key lying on the floor, if any: ? (a quest step waiting on one being picked up), !
   * (a found key that gives one: PassageConfig.foundKey).
   */
  keyMark?: QuestMark | null;
  /** A found key lying on the floor (PassageConfig.foundKey): what its tag calls it (the party doesn't know it yet). */
  foundKey?: { key: DungeonKey; name: string } | null;
  /** More map objects, for the moment (the opening's portals: zoneScenery arrivalPortal). */
  sceneObjects?: MapObject[];
  /** A dialogue spoken over a tile (a found key's, over where it lies: NpcDialogue), its point just over it. */
  dialogue?: { at: Pos; content: ReactNode } | null;
  /** Gold lying on the floor ("x,y" → how much): drawn as the Gold Coins model, picked up by a click. */
  droppedGold?: Record<string, number>;
  /** Affix shards lying on the floor ("x,y" → which): drawn as the Affix Shards model, picked up by a click. */
  droppedShards?: Record<string, ShardCounts>;
  /** Where each unit last aimed an ability; its model turns to face it. */
  aims?: Record<string, UnitAim>;
  /** How each unit's model plays its next move (a movement ability's dash or blink). */
  moves?: Record<string, UnitMove>;
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

export default function DungeonMap({ playerPos, activeMoverPos, party, moveTargets, moveApCost, onMove, onLocationChange, onDoorClick, chests, emptiedChests, onOpenChest, activeTarget, activeAbilityArea, areaTone, actionRange, onAbilityUse, onAbilityDeselect, onMemberSelect, enemies, inCombat, isPlayerTurn, activeCombatantId, floatingTexts, onFloatingTextComplete, zone, riftPos: riftTile, riftShut = false, partyBuffs, partyHots, partyDots, terrain, clutter, doorObject, enemyAoePreview, enemyTargetKey, tileTargets = null, activeMove = false, moveAims = null, droppedItems = {}, droppedKeys = {}, keyMark = null, foundKey = null, sceneObjects = NO_OBJECTS, dialogue = null, droppedGold = {}, droppedShards = {}, onLootClick, aims, moves, fx, highlightUnitId = null, fog, onReady }: Props) {
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
  // The rift, once open (a boss room's opens when its boss falls). One that opens while the party is in the zone
  // plays its opening; one already open when the party comes in stands open
  const riftPos = riftShut ? null : riftTile;
  const [riftSeen, setRiftSeen] = useState({ zone: zone.id, shut: riftShut });
  if (riftSeen.zone !== zone.id || (riftShut && !riftSeen.shut)) setRiftSeen({ zone: zone.id, shut: riftShut });
  const riftOpening = !!riftPos && riftSeen.zone === zone.id && riftSeen.shut;
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
    for (const [key, dungeon] of Object.entries(droppedKeys)) out.push(keyLoot(key, dungeon));
    for (const key of Object.keys(droppedGold)) out.push({ id: `gold-${zone.id}-${key}`, link: loot('gold').model, pos: keyPos(key) });
    for (const key of Object.keys(droppedShards)) out.push({ id: `shards-${zone.id}-${key}`, link: loot('affix-shards').model, pos: keyPos(key) });
    return out;
  }, [droppedItems, droppedKeys, droppedGold, droppedShards, zone.id]);
  // Every tile with loot lying on it (once each, whatever lies there)
  const lootKeys = useMemo(() => [...new Set([
    ...Object.keys(droppedItems).filter(k => droppedItems[k].length > 0),
    ...Object.keys(droppedKeys), ...Object.keys(droppedGold), ...Object.keys(droppedShards),
  ])], [droppedItems, droppedKeys, droppedGold, droppedShards]);
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
    () => sceneryObjects(zone, clutter, [...(riftTile ? [riftTile] : []), ...chests.map(c => c.pos)]),
    [zone.id, floors, doors, riftTile, chests, clutter], // eslint-disable-line react-hooks/exhaustive-deps -- the zone's layout, by its id and floor
  );
  const mapObjects = useMemo(() => {
    const out: MapObject[] = doorObjects(zone, doorObject);
    if (riftPos) out.push(riftObject(zone, riftPos, 'rift', riftOpening));
    for (const c of chests) {
      out.push({ id: c.id, link: interactiveObjectModel(c.object), pos: c.pos, facing: yawFromGridMove(...c.facing), played: emptiedChests.has(c.id) ? ['open'] : undefined });
    }
    return [...out, ...scenery, ...sceneObjects];
  }, [doors, floors, riftPos, riftOpening, doorObject, chests, emptiedKey, scenery, sceneObjects]); // eslint-disable-line react-hooks/exhaustive-deps -- the zone by its doors and floor; emptied chests by their key

  // What aiming at a tile aims at: the large creature on it (all of it), else the tile (as aimPartyAction does)
  const enemyBodies = useMemo(() => modelEnemies.map(bodyOf), [modelEnemies]);
  const aimAt = (p: Pos) => areaCenter(p, enemyBodies);
  const inRangeWithLOS = (p: Pos) => inRangeAndSight(activeMoverPos, aimAt(p), actionRange, zone.sight);
  // Whether the armed ability can be aimed at a tile: in range and sight, or (a movement ability) wherever it can go
  const canAim = (p: Pos) => (activeMove ? !!moveAims?.has(posKey(p)) : inRangeWithLOS(p));

  // AoE preview tiles (computed from hover position)
  const aoeTiles = useMemo(() => {
    // Enemy abilities only in combat (on the party's turn); ally ones out of combat too
    if (!activeTarget || !isAoE || !hoveredTile || !canAct || (activeTarget === 'enemy' && !inCombat) || !canAim(hoveredTile)) return new Set<string>();
    return affectedKeys(activeMoverPos, aimAt(hoveredTile), activeAbilityArea, zone.sight);
  }, [activeTarget, isAoE, hoveredTile, inCombat, isPlayerTurn, activeMoverPos, actionRange, zone.sight, activeAbilityArea, enemyBodies, activeMove, moveAims]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * What a click on `p` does: walk to the tile `walk` (if set), then `use` something (if set); null: nothing. The
   * click runs it and the hover shows its walk, so what is shown is what happens.
   *  - A door, an unemptied chest or the rift, clicked from afar, is walked up to (to a tile beside it) and then used;
   *    from beside it, just used. Doors and chests only out of combat (the rift in combat too, on the mover's AP).
   *  - Out of combat with no ability armed, a tile that can't be reached (a wall, an obstacle, fog, too far) walks as
   *    close to it as the party can get.
   */
  const clickPlan = (p: Pos, floor: boolean): ClickPlan | null => {
    if (!canAct) return null;
    const key = posKey(p);
    const mayWalkNear = !inCombat && !activeTarget;
    const nearer = (): ClickPlan | null => {
      const walk = mayWalkNear ? closestReachable(moveTargets, p, activeMoverPos) : null;
      return walk ? { walk } : null;
    };
    // `use` from beside `p`; from afar (if `walkUp`) after walking up to it; else as near as can be
    const actAt = (adjacent: boolean, use: () => void, walkUp: boolean): ClickPlan | null => {
      if (adjacent) return { walk: null, use };
      const walk = walkUp && !activeTarget ? approachTile(moveTargets, p, activeMoverPos) : null;
      return walk ? { walk, use } : nearer();
    };

    const door = doorByKey.get(key);
    if (door) return inCombat ? null : actAt(isAdjacent(playerPos, p), () => onDoorClick(door.id), isKnown(key));
    // A chest: open it from beside it, out of combat
    const chest = chestByKey.get(key);
    if (chest) return inCombat ? null : actAt(isAdjacent(playerPos, p), () => onOpenChest(chest.id), !emptiedChests.has(chest.id) && isKnown(key));
    if (!floor) return nearer();

    const enemy = enemyByKey.get(key);
    const member = memberByKey.get(key);

    // With ability active: route to attack handler
    if (activeTarget) {
      // Fires on a valid target for the ability's kind, else deselects ('self' fires only on the mover's own
      // tile: the handler deselects elsewhere; a movement ability, only where it can go)
      const valid = activeMove ? !!moveAims?.has(key)
        : activeTarget === 'self' ? true
        : activeTarget === 'ally' ? isAoE || !!member || (!!enemy && isAlly(enemy)) // an area can be aimed at any tile; range is checked on use
        : activeTarget === 'tile' ? !!tileTargets?.has(key)
        : isAoE || (!!enemy && !isAlly(enemy));
      return { walk: null, use: () => (valid ? onAbilityUse(p) : onAbilityDeselect()) };
    }

    if (enemy) return null; // can't walk onto enemies (or stop on a summoned ally)

    // Loot pickup: click adjacent dropped item out of combat
    if (!inCombat && (droppedItems[key]?.length || droppedKeys[key] || droppedGold[key] || droppedShards[key]) && isAdjacent(playerPos, p)) {
      return { walk: null, use: () => onLootClick?.(p) };
    }

    // Out of combat: clicking a party member selects their action bar
    if (member) return inCombat ? null : { walk: null, use: () => onMemberSelect(member.partyIndex) };

    if (riftPos && samePos(p, riftPos)) return actAt(isAdjacentToRift, () => onLocationChange('sanctum'), true);
    return moveTargets.has(key) ? { walk: p } : nearer();
  };

  /** Runs the click's plan: the walk first, then the use (not if the walk was refused or started a fight). */
  const handleClick = (p: Pos, floor: boolean) => {
    const plan = clickPlan(p, floor);
    if (!plan) return;
    if (!plan.walk || onMove(plan.walk)) plan.use?.();
  };

  // Stable for the memoized tiles; always runs the latest handleClick
  const onTileClick = useStableHandler((p: Pos) => handleClick(p, floors.has(posKey(p))));

  // Where a click on the hovered tile would walk to (its move line and cost end there, the tile lights)
  const hoverWalk = hoveredTile ? clickPlan(hoveredTile, floors.has(posKey(hoveredTile)))?.walk ?? null : null;
  // A movement ability armed: the move the hovered aim would make (its line is drawn, its landing tile lit)
  const hoverMove = activeMove && canAct && hoveredTile ? moveAims?.get(posKey(hoveredTile)) : undefined;

  const tile = (p: Pos) => {
    const key = posKey(p);
    const isRift = !!riftPos && samePos(p, riftPos);
    const floor = floors.has(key);
    const member = memberByKey.get(key);
    const enemy = floor && !member ? enemyByKey.get(key) : undefined;
    const door = doorByKey.get(key);
    const targetable = enemy && !isAlly(enemy) && activeTarget === 'enemy' && !isAoE && inCombat && isPlayerTurn && canAim(p);
    // A summoned ally takes the party's helpful abilities
    const isAllyUnit = !!member || (!!enemy && isAlly(enemy));
    const isMoverTile = samePos(p, activeMoverPos);
    const isSelfTile = activeTarget === 'self' && inCombat && isPlayerTurn && isMoverTile;
    const isDoorAdjacent = !!door && isAdjacent(playerPos, p);
    const chest = chestByKey.get(key);
    const isChestUsable = !!chest && !inCombat && !emptiedChests.has(chest.id) && isAdjacent(playerPos, p);
    const unitOnTile = member ? unitKey({ side: 'party', idx: member.partyIndex }) : enemy?.id;
    const isEnemyTargeted = enemyTargetKey !== null && unitOnTile === enemyTargetKey;
    // A 'tile' ability: every tile it can be aimed at, softly; the hovered one as the target. A movement ability: every
    // empty tile it can go to (units it can be aimed at are outlined as any target is); where the hovered aim lands it, too
    const isTileTarget = isPlayerTurn && (activeMove ? !!moveAims?.has(key) && !enemy && !isAllyUnit : activeTarget === 'tile' && !!tileTargets?.has(key));
    const isLanding = !!hoverMove && hoverMove.path.length > 0 && samePos(p, hoverMove.landing);

    // Overlay on the tile (the floor stays visible under its muted tint)
    const highlight: keyof typeof TILE_HIGHLIGHT | null =
      enemy && enemy.id === activeCombatantId ? 'acting'
      : isSelfTile || (activeTarget === 'ally' && isAllyUnit && canAim(p)) || (isTileTarget && !isAoE && hover.isHovered(p)) || isLanding ? 'ally'
      : targetable || isEnemyTargeted ? 'enemy'
      : aoeTiles.has(key) ? (areaTone === 'help' || (areaTone === 'mixed' && !(enemy && !isAlly(enemy))) ? 'areaHelp' : 'areaHarm')
      : isTileTarget ? 'areaHelp'
      : inCombat && isPlayerTurn && isMoverTile ? 'mover'
      : null;
    const isHighlightedUnit = !!highlightUnitId && (enemy?.id === highlightUnitId || (!!member && `player-${member.partyIndex}` === highlightUnitId));

    return (
      <FloorTile key={key} p={p} hover={hover} onClick={onTileClick}
        brighten={floor && !door && !highlight && !!hoverWalk && samePos(p, hoverWalk)}>
        {/* A door, the rift or a chest the leader can use now: a soft pulsing glow on its tile (stronger on hover); a door also
            glows when hovered from farther away (or in combat) */}
        {/* The rift, hovered from farther away: its edges glow faintly */}
        {isRift && !isAdjacentToRift && hover.isHovered(p) && <HoverEdgeGlow color={riftGlowCss(SANCTUM_RIFT_COLOR)} />}
        {((door && ((isDoorAdjacent && !inCombat) || (isKnown(key) && hover.isHovered(p)))) || (isRift && isAdjacentToRift)) && (
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
  const hoveredMoveAp = hoverWalk && moveApCost ? moveApCost(moveTargets.get(posKey(hoverWalk))!) : 0;
  const floor = (
    <>
      <FloorGrid cols={width} rows={height} tile={tile} />
      {hoverWalk && (
        <MoveLineOverlay from={activeMoverPos} to={hoverWalk} />
      )}
      {hoverMove && hoverMove.path.length > 0 && (
        <MoveLineOverlay from={activeMoverPos} to={hoverMove.landing} />
      )}
    </>
  );

  // No frame: the board floats on the game screen's background
  return (
    <Board board={board} floor={floor} under={<div ref={setTerrainHost} className="absolute inset-0 pointer-events-none" />}>
      <Suspense fallback={null}>
        {/* Keyed by zone: entering another zone places every model fresh instead of gliding it across */}
        <ModelLayer key={zone.id} board={board} party={modelParty} enemies={modelEnemies} loot={modelLoot} objects={mapObjects} renderEnemyOverlay={renderEnemyOverlay} aims={aims} moves={moves} fx={fx} fog={fog} onReady={onReady} terrain={zoneTerrain} terrainHost={terrainHost} />
      </Suspense>

      {/* The AP the hovered move costs, where its move line ends */}
      {hoveredMoveAp > 0 && hoverWalk && (
        <UprightAt board={board} x={hoverWalk.x} y={hoverWalk.y} className="z-20">
          <MoveCostPips ap={hoveredMoveAp} />
        </UprightAt>
      )}

      {/* Every pile the party knows of (an item, a rift key, gold, shards; drawn by ModelLayer) sparkles */}
      {lootKeys.filter(isKnown).map(key => {
        const { x, y } = keyPos(key);
        return <LootSparkle key={`sparkle-${key}`} board={board} x={x} y={y} />;
      })}

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

      {/* A quest marker over each rift key lying where the party has seen (a quest step waiting on one being picked up) */}
      {keyMark && Object.keys(droppedKeys).filter(isKnown).map((key) => {
        const { x, y } = keyPos(key);
        return (
          <UprightAt key={`mark-${key}`} board={board} x={x} y={y} height={KEY_MARK_HEIGHT} className="z-30">
            <span role="img" aria-label={keyMark === '!' ? 'Quest available' : 'Quest: pick up the key'} className={`rf-quest-mark ${keyMark === '!' ? 'text-[24px]' : 'text-[30px]'}`}>{keyMark}</span>
          </UprightAt>
        );
      })}

      {/* A dialogue spoken over a tile (a found key's) */}
      {dialogue && (
        <UprightAt board={board} x={dialogue.at.x} y={dialogue.at.y} height={DIALOGUE_HEIGHT} className="z-40">
          <div className="absolute bottom-1/2 left-1/2 -translate-x-1/2 mb-2">{dialogue.content}</div>
        </UprightAt>
      )}

      {/* A rift key's name while it is hovered */}
      {hoveredTile && droppedKeys[posKey(hoveredTile)] && isKnown(posKey(hoveredTile)) && (
        <ObjectTag board={board} x={hoveredTile.x} y={hoveredTile.y} height={KEY_TAG_HEIGHT} text={droppedKeys[posKey(hoveredTile)] === foundKey?.key ? foundKey.name : DUNGEONS[droppedKeys[posKey(hoveredTile)]].keyName} />
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

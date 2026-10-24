import { lazy, Suspense, useMemo } from 'react';
import type { TargetType } from '../data/combat/abilities';
import { gameObjectGlow, gameObjectModel } from '../data/world/gameObjects';
import { isAdjacent, posKey, type Pos } from '../data/world/grid';
import { yawFromGridMove } from '../forge/core/facing';
import { DUNGEON_PRESETS, type DungeonKey } from '../data/world/dungeonPresets';
import { SANCTUM_FLOOR_COLOR, SANCTUM_WALL_COLOR } from '../data/constants';
import { SANCTUM, isSanctumWall, sanctumPortalAt } from '../data/world/sanctum';
import { Board, FloorGrid, FloorTile, HoverEdgeGlow, MoveLineOverlay, ObjectTag, PORTAL_TAG_HEIGHT, TileHighlight, UsableGlow, portalTag, toMapMember, useBoard, useHoveredTile, useStableHandler, type PartyTokenData } from './mapParts';

// 3D party models over the tile grid. Lazy: it pulls in three.js (GameScreen preloads it on mount).
const ModelLayer = lazy(() => import('./ModelLayer'));
import type { MapObject, UnitAim } from './ModelLayer';

/** The Sanctum's game objects: its portals, one into each dungeon, facing into the room. */
const SANCTUM_OBJECTS: MapObject[] = SANCTUM.portals.map((p) => ({
  id: `sanctum-portal-${p.dungeon}`, link: gameObjectModel(p.object), pos: p.pos, facing: yawFromGridMove(...p.facing),
}));

interface Props {
  playerPos: Pos;
  activeMoverPos: Pos;
  party: PartyTokenData[];
  /** Tiles the active mover can move to this turn (tile key -> steps), from GameScreen (partyMoveTargets). */
  moveTargets: Map<string, number>;
  onMove: (pos: Pos) => void;
  /** A portal was used: enter its dungeon. */
  onEnterDungeon: (dungeon: DungeonKey) => void;
  activeTarget: TargetType | null;  // target type of the selected ability (null = none selected)
  onAbilityUse: (pos: Pos) => void;
  onAbilityDeselect: () => void;
  onMemberSelect: (partyIndex: number) => void;
  /** Where each unit last aimed an ability; its model turns to face it. */
  aims?: Record<string, UnitAim>;
  /** The 3D layer has drawn its first frame (ModelLayer onReady): the page stops hiding the map. */
  onReady?: () => void;
}

export default function SanctumMap({ playerPos, activeMoverPos, party, moveTargets, onMove, onEnterDungeon, activeTarget, onAbilityUse, onAbilityDeselect, onMemberSelect, aims, onReady }: Props) {
  const hover = useHoveredTile();
  const hoveredPortal = hover.hovered ? sanctumPortalAt(hover.hovered) : undefined;
  const board = useBoard(SANCTUM.width, SANCTUM.height);

  const memberByKey = useMemo(() => new Map(party.map(m => [posKey(m.pos), m])), [party]);
  // Party members drawn as their class models (HP/MP bars above their heads)
  const modelParty = useMemo(() => party.map(m => toMapMember(m)), [party]);
  const canMoveTo = (p: Pos) => moveTargets.has(posKey(p));

  const handleClick = (p: Pos) => {
    if (isSanctumWall(p)) return;
    const member = memberByKey.get(posKey(p));
    if (activeTarget) {
      if (activeTarget === 'self') onAbilityUse(p);
      else if (activeTarget === 'ally' && member) onAbilityUse(p);
      else onAbilityDeselect();
      return;
    }
    // Clicking a party member selects their action bar
    if (member) { onMemberSelect(member.partyIndex); return; }
    // A portal next to the leader takes the party into its dungeon
    const portal = sanctumPortalAt(p);
    if (portal) {
      if (isAdjacent(playerPos, portal.pos)) onEnterDungeon(portal.dungeon);
      return;
    }
    if (canMoveTo(p)) onMove(p);
  };

  // Stable for the memoized tiles; always runs the latest handleClick
  const onTileClick = useStableHandler(handleClick);

  const tile = (p: Pos) => {
    const isWall = isSanctumWall(p);
    const portal = sanctumPortalAt(p);
    const allyTarget = !isWall && activeTarget === 'ally' && memberByKey.has(posKey(p));
    return (
      <FloorTile key={posKey(p)} p={p} hover={hover} onClick={onTileClick}
        color={isWall ? SANCTUM_WALL_COLOR : SANCTUM_FLOOR_COLOR}
        brighten={!isWall && !activeTarget && canMoveTo(p) && hover.isHovered(p)}>
        {allyTarget && <TileHighlight kind="ally" />}
        {/* A portal (a model, see SANCTUM_OBJECTS) glows on its tile while the leader can use it; hovered from
            farther away, its edges glow faintly */}
        {portal && (isAdjacent(playerPos, portal.pos)
          ? <UsableGlow color={gameObjectGlow(portal.object)} hovered={hover.isHovered(p)} />
          : hover.isHovered(p) && <HoverEdgeGlow color={gameObjectGlow(portal.object)} />)}
      </FloorTile>
    );
  };

  const floor = (
    <>
      <FloorGrid cols={SANCTUM.width} rows={SANCTUM.height} tile={tile} />
      {!activeTarget && hover.hovered && canMoveTo(hover.hovered) && (
        <MoveLineOverlay from={activeMoverPos} to={hover.hovered} />
      )}
    </>
  );

  // No frame: the board floats on the game screen's background
  return (
    <Board board={board} floor={floor}>
      <Suspense fallback={null}>
        <ModelLayer board={board} party={modelParty} objects={SANCTUM_OBJECTS} aims={aims} onReady={onReady} />
      </Suspense>
      {/* Where a hovered portal leads, at once, wherever the party stands */}
      {hoveredPortal && <ObjectTag board={board} x={hoveredPortal.pos.x} y={hoveredPortal.pos.y} height={PORTAL_TAG_HEIGHT} text={portalTag(DUNGEON_PRESETS[hoveredPortal.dungeon].name)} />}
    </Board>
  );
}

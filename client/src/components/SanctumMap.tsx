import { lazy, Suspense, useMemo } from 'react';
import type { TargetType } from '../data/combat/abilities';
import { gameObjectGlow, gameObjectModel } from '../data/world/gameObjects';
import { isAdjacent, posKey, type Pos } from '../data/world/grid';
import { yawFromGridMove } from '../forge/core/facing';
import { DUNGEONS, type DungeonKey } from '../data/world/dungeons';
import { SANCTUM_FLOOR_COLOR, SANCTUM_WALL_COLOR } from '../data/constants';
import { SANCTUM, isSanctumWall, sanctumRiftAt } from '../data/world/sanctum';
import { Board, FloorGrid, FloorTile, HoverEdgeGlow, MoveLineOverlay, ObjectTag, RIFT_TAG_HEIGHT, TileHighlight, UsableGlow, riftTag, toMapMember, useBoard, useHoveredTile, useStableHandler, type PartyTokenData } from './mapParts';

// 3D party models over the tile grid. Lazy: it pulls in three.js (GameScreen preloads it on mount).
const ModelLayer = lazy(() => import('./ModelLayer'));
import type { MapObject, UnitAim } from './ModelLayer';

/** The Sanctum's game objects: its rifts, one into each dungeon, facing into the room. */
const SANCTUM_OBJECTS: MapObject[] = SANCTUM.rifts.map((p) => ({
  id: `sanctum-rift-${p.dungeon}`, link: gameObjectModel(p.object), pos: p.pos, facing: yawFromGridMove(...p.facing),
}));

interface Props {
  playerPos: Pos;
  activeMoverPos: Pos;
  party: PartyTokenData[];
  /** Tiles the active mover can move to this turn (tile key -> steps), from GameScreen (partyMoveTargets). */
  moveTargets: Map<string, number>;
  onMove: (pos: Pos) => void;
  /** A rift was used: enter its dungeon. */
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
  const hoveredRift = hover.hovered ? sanctumRiftAt(hover.hovered) : undefined;
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
    // A rift next to the leader takes the party into its dungeon
    const rift = sanctumRiftAt(p);
    if (rift) {
      if (isAdjacent(playerPos, rift.pos)) onEnterDungeon(rift.dungeon);
      return;
    }
    if (canMoveTo(p)) onMove(p);
  };

  // Stable for the memoized tiles; always runs the latest handleClick
  const onTileClick = useStableHandler(handleClick);

  const tile = (p: Pos) => {
    const isWall = isSanctumWall(p);
    const rift = sanctumRiftAt(p);
    const allyTarget = !isWall && activeTarget === 'ally' && memberByKey.has(posKey(p));
    return (
      <FloorTile key={posKey(p)} p={p} hover={hover} onClick={onTileClick}
        color={isWall ? SANCTUM_WALL_COLOR : SANCTUM_FLOOR_COLOR}
        brighten={!isWall && !activeTarget && canMoveTo(p) && hover.isHovered(p)}>
        {allyTarget && <TileHighlight kind="ally" />}
        {/* A rift (a model, see SANCTUM_OBJECTS) glows on its tile while the leader can use it; hovered from
            farther away, its edges glow faintly */}
        {rift && (isAdjacent(playerPos, rift.pos)
          ? <UsableGlow color={gameObjectGlow(rift.object)} hovered={hover.isHovered(p)} />
          : hover.isHovered(p) && <HoverEdgeGlow color={gameObjectGlow(rift.object)} />)}
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
      {/* Where a hovered rift leads, at once, wherever the party stands */}
      {hoveredRift && <ObjectTag board={board} x={hoveredRift.pos.x} y={hoveredRift.pos.y} height={RIFT_TAG_HEIGHT} text={riftTag(DUNGEONS[hoveredRift.dungeon].name)} />}
    </Board>
  );
}

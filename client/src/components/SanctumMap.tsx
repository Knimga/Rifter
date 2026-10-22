import { lazy, Suspense, useMemo } from 'react';
import type { TargetType } from '../data/classes';
import { gameObjectGlow, gameObjectModel } from '../data/gameObjects';
import { isAdjacent, posKey, type Pos } from '../data/dungeonHelpers';
import { yawFromGridMove } from '../forge/core/facing';
import type { DungeonKey } from '../data/dungeonPresets';
import { SANCTUM_FLOOR_COLOR, SANCTUM_WALL_COLOR } from '../data/constants';
import { SANCTUM, isSanctumWall, sanctumPortalAt } from '../data/sanctum';
import { Board, FloorGrid, FloorTile, MoveLineOverlay, TileHighlight, UsableGlow, toMapMember, useBoard, useHoveredTile, useStableHandler, type PartyTokenData } from './mapParts';

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
}

export default function SanctumMap({ playerPos, activeMoverPos, party, moveTargets, onMove, onEnterDungeon, activeTarget, onAbilityUse, onAbilityDeselect, onMemberSelect, aims }: Props) {
  const hover = useHoveredTile();
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
        {/* A portal (a model, see SANCTUM_OBJECTS) glows on its tile while the leader can use it */}
        {portal && isAdjacent(playerPos, portal.pos) && <UsableGlow color={gameObjectGlow(portal.object)} hovered={hover.isHovered(p)} />}
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
        <ModelLayer board={board} party={modelParty} objects={SANCTUM_OBJECTS} aims={aims} />
      </Suspense>
    </Board>
  );
}

import { lazy, Suspense, useMemo } from 'react';
import type { TargetType } from '../data/classes';
import { gameObjectModel } from '../data/gameObjects';
import { isAdjacent, posKey, type Pos } from '../data/dungeonHelpers';
import { SANCTUM_FLOOR_COLOR, SANCTUM_WALL_COLOR } from '../data/constants';
import { SANCTUM, isSanctumPortal, isSanctumWall, isSanctumWalkable } from '../data/sanctum';
import { Board, FloorGrid, FloorTile, MoveLineOverlay, TileHighlight, UsableGlow, facingOpenSide, toMapMember, useBoard, useHoveredTile, type PartyTokenData } from './mapParts';

// 3D party models over the tile grid. Lazy: it pulls in three.js (GameScreen preloads it on mount).
const ModelLayer = lazy(() => import('./ModelLayer'));
import type { MapObject, UnitAim } from './ModelLayer';

/** The Sanctum's game objects: its portal into the dungeon, facing the open floor. */
const SANCTUM_OBJECTS: MapObject[] = [
  { id: 'sanctum-portal', link: gameObjectModel(SANCTUM.portalObject), pos: SANCTUM.portalPos, facing: facingOpenSide(SANCTUM.portalPos, isSanctumWalkable) },
];

interface Props {
  playerPos: Pos;
  activeMoverPos: Pos;
  party: PartyTokenData[];
  /** Tiles the active mover can move to this turn (tile key -> steps), from GameScreen (partyMoveTargets). */
  moveTargets: Map<string, number>;
  onMove: (pos: Pos) => void;
  onLocationChange: (location: 'dungeon') => void;
  activeTarget: TargetType | null;  // target type of the selected ability (null = none selected)
  onAbilityUse: (pos: Pos) => void;
  onAbilityDeselect: () => void;
  onMemberSelect: (partyIndex: number) => void;
  /** Where each unit last aimed an ability; its model turns to face it. */
  aims?: Record<string, UnitAim>;
}

export default function SanctumMap({ playerPos, activeMoverPos, party, moveTargets, onMove, onLocationChange, activeTarget, onAbilityUse, onAbilityDeselect, onMemberSelect, aims }: Props) {
  const hover = useHoveredTile();
  const board = useBoard(SANCTUM.width, SANCTUM.height);

  const memberByKey = useMemo(() => new Map(party.map(m => [posKey(m.pos), m])), [party]);
  // Party members drawn as their class models (HP/MP bars above their heads)
  const modelParty = useMemo(() => party.map(m => toMapMember(m)), [party]);
  const isAdjacentToPortal = isAdjacent(playerPos, SANCTUM.portalPos);
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
    if (isSanctumPortal(p)) {
      if (isAdjacentToPortal) onLocationChange('dungeon');
      return;
    }
    if (canMoveTo(p)) onMove(p);
  };

  const tile = (p: Pos) => {
    const isWall = isSanctumWall(p);
    const allyTarget = !isWall && activeTarget === 'ally' && memberByKey.has(posKey(p));
    return (
      <FloorTile key={posKey(p)} p={p} hover={hover} onClick={() => handleClick(p)}
        color={isWall ? SANCTUM_WALL_COLOR : SANCTUM_FLOOR_COLOR}
        brighten={!isWall && !activeTarget && canMoveTo(p) && hover.isHovered(p)}>
        {allyTarget && <TileHighlight kind="ally" />}
        {/* The portal (a model, see SANCTUM_OBJECTS) glows on its tile while the leader can use it */}
        {isSanctumPortal(p) && isAdjacentToPortal && <UsableGlow color="var(--rift-portal)" hovered={hover.isHovered(p)} />}
      </FloorTile>
    );
  };

  const floor = (
    <>
      <FloorGrid cols={SANCTUM.width} rows={SANCTUM.height} tile={tile} />
      {!activeTarget && hover.hovered && canMoveTo(hover.hovered) && (
        <MoveLineOverlay from={activeMoverPos} to={hover.hovered} cols={SANCTUM.width} rows={SANCTUM.height} />
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

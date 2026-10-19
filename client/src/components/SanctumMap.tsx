import { lazy, Suspense, useMemo, useState } from 'react';
import type { TargetType } from '../data/classes';
import { gameObjectModel } from '../data/gameObjects';
import { brightenHex, isAdjacent, posKey, type Pos } from '../data/dungeonHelpers';
import { SANCTUM_FLOOR_COLOR, SANCTUM_WALL_COLOR } from '../data/constants';
import { TILE_SIZE } from '../viewEngine/board';
import { SANCTUM, isSanctumPortal, isSanctumWall, isSanctumWalkable } from '../data/sanctum';
import { Board, MoveLineOverlay, TILE_BORDER_CLASS, UsableGlow, facingOpenSide, toMapMember, useBoard, type PartyTokenData } from './mapParts';

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
  const [hoveredTile, setHoveredTile] = useState<Pos | null>(null);
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
    // Select party member's action bar by clicking their token
    if (member) { onMemberSelect(member.partyIndex); return; }
    if (isSanctumPortal(p)) {
      if (isAdjacentToPortal) onLocationChange('dungeon');
      return;
    }
    if (canMoveTo(p)) onMove(p);
  };

  const floor = (
    <>
        {Array.from({ length: SANCTUM.height }).map((_, y) => (
          <div key={y} className="flex">
            {Array.from({ length: SANCTUM.width }).map((_, x) => {
              const p = { x, y };
              const isPortal = isSanctumPortal(p);
              const isWall = isSanctumWall(p);
              const member = memberByKey.get(posKey(p));
              const allyHighlight = activeTarget === 'ally' && !!member;
              const isHovered = hoveredTile?.x === x && hoveredTile?.y === y;

              return (
                <div
                  key={`${x}-${y}`}
                  onClick={() => handleClick(p)}
                  onMouseEnter={() => setHoveredTile(p)}
                  onMouseLeave={() => setHoveredTile(prev => prev?.x === x && prev?.y === y ? null : prev)}
                  style={{
                    width: TILE_SIZE, height: TILE_SIZE,
                    backgroundColor: allyHighlight
                      ? undefined
                      : isWall
                        ? SANCTUM_WALL_COLOR
                        : !activeTarget && isHovered && canMoveTo(p)
                          ? brightenHex(SANCTUM_FLOOR_COLOR, 1.5)
                          : SANCTUM_FLOOR_COLOR,
                  }}
                  className={`relative shrink-0 border flex items-center justify-center text-xs ${
                    !isWall && allyHighlight
                      ? 'bg-green-900/40 border-2 border-green-400 cursor-crosshair'
                      : TILE_BORDER_CLASS
                  } ${isPortal && isAdjacentToPortal ? 'cursor-pointer' : ''}`}
                >
                  {/* The portal (a model, see SANCTUM_OBJECTS) glows on its tile while the leader can use it */}
                  {isPortal && isAdjacentToPortal && <UsableGlow color="178, 236, 192" hovered={isHovered} />}
                </div>
              );
            })}
          </div>
        ))}

        {!activeTarget && hoveredTile && canMoveTo(hoveredTile) && (
          <MoveLineOverlay from={activeMoverPos} to={hoveredTile} cols={SANCTUM.width} rows={SANCTUM.height} />
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

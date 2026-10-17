import { useMemo, useState } from 'react';
import { GiMagicPortal } from 'react-icons/gi';
import type { TargetType } from '../data/classes';
import { brightenHex, isAdjacent, isValidMoveTarget, posKey, type Pos } from '../data/dungeonHelpers';
import { TILE_SIZE, SANCTUM_FLOOR_COLOR, SANCTUM_WALL_COLOR } from '../data/constants';
import { SANCTUM, isSanctumPortal, isSanctumWall, isSanctumWalkable } from '../data/sanctum';
import { MoveLineOverlay, PartyToken, TILE_BORDER_CLASS, type PartyTokenData } from './mapParts';

interface Props {
  playerPos: Pos;
  activeMoverPos: Pos;
  party: PartyTokenData[];
  movement: number;
  onMove: (pos: Pos) => void;
  onLocationChange: (location: 'dungeon') => void;
  activeTarget: TargetType | null;  // target type of the selected ability (null = none selected)
  onAbilityUse: (pos: Pos) => void;
  onAbilityDeselect: () => void;
  onMemberSelect: (partyIndex: number) => void;
}

export default function SanctumMap({ playerPos, activeMoverPos, party, movement, onMove, onLocationChange, activeTarget, onAbilityUse, onAbilityDeselect, onMemberSelect }: Props) {
  const [hoveredTile, setHoveredTile] = useState<Pos | null>(null);

  const memberByKey = useMemo(() => new Map(party.map(m => [posKey(m.pos), m])), [party]);
  const isAdjacentToPortal = isAdjacent(playerPos, SANCTUM.portalPos);
  const canMoveTo = (p: Pos) =>
    isValidMoveTarget(p, activeMoverPos, movement, isSanctumWalkable, q => memberByKey.has(posKey(q)), isSanctumPortal);

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

  return (
    <div className="flex flex-col items-center">
      <div className="bg-gray-800 p-4 rounded-lg inline-block">
        <div className="relative">
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
                  className={`shrink-0 border flex items-center justify-center text-xs ${
                    !isWall && allyHighlight
                      ? 'bg-green-900/40 border-2 border-green-400 cursor-crosshair'
                      : TILE_BORDER_CLASS
                  }`}
                >
                  {member && <PartyToken member={member} />}
                  {!member && isPortal && (
                    <div
                      className={`transition-all ${isAdjacentToPortal ? 'cursor-pointer animate-pulse' : ''}`}
                      style={{ filter: isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(192,132,252,0.8))' : 'none' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'drop-shadow(0 0 12px rgba(192,132,252,1))'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(192,132,252,0.8))' : 'none'; }}
                    >
                      <GiMagicPortal className="w-9 h-9 text-purple-400" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {!activeTarget && hoveredTile && canMoveTo(hoveredTile) && (
          <MoveLineOverlay from={activeMoverPos} to={hoveredTile} cols={SANCTUM.width} rows={SANCTUM.height} />
        )}
        </div>
      </div>
    </div>
  );
}

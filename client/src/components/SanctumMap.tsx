import { useState } from 'react';
import { GiMagicPortal } from 'react-icons/gi';
import { CLASSES, type ClassKey } from '../data/classes';
import { isValidMoveTarget, brightenHex } from '../data/dungeonHelpers';
import { TILE_SIZE, SANCTUM_FLOOR_COLOR, SANCTUM_WALL_COLOR } from '../data/constants';
import MoveLine from './MoveLine';

interface PartyFollower {
  pos: { x: number; y: number };
  classKey: ClassKey;
  hp: number;
  maxHp: number;
  mp: number;
  maxMp: number;
  partyIndex: number;
}

interface Props {
  selectedClass: ClassKey;
  playerPos: { x: number; y: number };
  activeMoverPos: { x: number; y: number };
  partyFollowers: PartyFollower[];
  movement: number;
  onMove: (pos: { x: number; y: number }) => void;
  onLocationChange: (location: 'dungeon') => void;
  activeAbility: unknown;
  isSelfTargetAbility: boolean;
  isAllyTargetAbility: boolean;
  onAbilityUse: (pos: { x: number; y: number }) => void;
  onAbilityDeselect: () => void;
  onMemberSelect: (partyIndex: number) => void;
  playerHp: number;
  playerMaxHp: number;
  playerMp: number;
  playerMaxMp: number;
}

const PORTAL_POS = { x: 5, y: 2 };

export default function SanctumMap({ selectedClass, playerPos, activeMoverPos, partyFollowers, movement, onMove, onLocationChange, activeAbility, isSelfTargetAbility, isAllyTargetAbility, onAbilityUse, onAbilityDeselect, onMemberSelect, playerHp, playerMaxHp, playerMp, playerMaxMp }: Props) {
  const [hoveredTile, setHoveredTile] = useState<{ x: number; y: number } | null>(null);

  const isAdjacent = (x: number, y: number) => {
    const dx = Math.abs(x - playerPos.x);
    const dy = Math.abs(y - playerPos.y);
    return dx <= 1 && dy <= 1 && (dx + dy) > 0;
  };

  const isAdjacentToPortal = isAdjacent(PORTAL_POS.x, PORTAL_POS.y);

  const isMoveWalkable = (p: { x: number; y: number }) => p.x > 0 && p.x < 10 && p.y > 0 && p.y < 10;
  const isMoveOccupied = (p: { x: number; y: number }) => partyFollowers.some(f => f.pos.x === p.x && f.pos.y === p.y);
  const isMoveSpecial = (p: { x: number; y: number }) => PORTAL_POS.x === p.x && PORTAL_POS.y === p.y;

  const handleClick = (x: number, y: number, isWall: boolean, isPortal: boolean) => {
    if (isWall) return;
    if (activeAbility) {
      if (isSelfTargetAbility) {
        onAbilityUse({ x, y });
      } else if (isAllyTargetAbility) {
        const isPartyMemberHere = (playerPos.x === x && playerPos.y === y) ||
          partyFollowers.some(f => f.pos.x === x && f.pos.y === y);
        if (isPartyMemberHere) onAbilityUse({ x, y });
        else onAbilityDeselect();
      } else {
        onAbilityDeselect();
      }
      return;
    }
    // Select party member's action bar by clicking their token
    if (playerPos.x === x && playerPos.y === y) { onMemberSelect(0); return; }
    const followerHere = partyFollowers.find(f => f.pos.x === x && f.pos.y === y);
    if (followerHere) { onMemberSelect(followerHere.partyIndex); return; }
    if (isPortal) {
      if (isAdjacentToPortal) onLocationChange('dungeon');
      return;
    }
    if (isValidMoveTarget({ x, y }, activeMoverPos, movement, isMoveWalkable, isMoveOccupied, isMoveSpecial)) onMove({ x, y });
  };

  return (
    <div className="flex flex-col items-center">
      <div className="bg-gray-800 p-4 rounded-lg inline-block">
        <div className="relative">
        {Array.from({ length: 11 }).map((_, y) => (
          <div key={y} className="flex">
            {Array.from({ length: 11 }).map((_, x) => {
              const isPlayer = playerPos.x === x && playerPos.y === y;
              const isPortal = PORTAL_POS.x === x && PORTAL_POS.y === y;
              const isWall = x === 0 || x === 10 || y === 0 || y === 10;
              const follower = !isPlayer ? partyFollowers.find(f => f.pos.x === x && f.pos.y === y) : undefined;

              return (
                <div
                  key={`${x}-${y}`}
                  onClick={() => handleClick(x, y, isWall, isPortal)}
                  onMouseEnter={() => setHoveredTile({ x, y })}
                  onMouseLeave={() => setHoveredTile(prev => prev?.x === x && prev?.y === y ? null : prev)}
                  style={{
                    width: TILE_SIZE, height: TILE_SIZE,
                    backgroundColor: isAllyTargetAbility && (isPlayer || !!follower)
                      ? undefined
                      : isWall
                        ? SANCTUM_WALL_COLOR
                        : !isWall && !activeAbility && isValidMoveTarget({ x, y }, activeMoverPos, movement, isMoveWalkable, isMoveOccupied, isMoveSpecial) && hoveredTile?.x === x && hoveredTile?.y === y
                          ? brightenHex(SANCTUM_FLOOR_COLOR, 1.5)
                          : SANCTUM_FLOOR_COLOR,
                  }}
                  className={`shrink-0 border flex items-center justify-center text-xs ${
                    isWall
                      ? 'border-gray-700/30'
                      : isAllyTargetAbility && (isPlayer || !!follower)
                        ? 'bg-green-900/40 border-2 border-green-400 cursor-crosshair'
                        : 'border-gray-700/30'
                  }`}
                >
                  {isPlayer && (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full" style={{ backgroundColor: CLASSES[selectedClass].color }} />
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 flex flex-col gap-px">
                        <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 transition-all" style={{ width: `${(playerHp / playerMaxHp) * 100}%` }} />
                        </div>
                        <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all" style={{ width: `${(playerMp / playerMaxMp) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {!isPlayer && follower && (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <div className="w-7 h-7 rounded-full opacity-75" style={{ backgroundColor: CLASSES[follower.classKey].color }} />
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-7 flex flex-col gap-px">
                        <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 transition-all" style={{ width: `${(follower.hp / follower.maxHp) * 100}%` }} />
                        </div>
                        <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 transition-all" style={{ width: `${(follower.mp / follower.maxMp) * 100}%` }} />
                        </div>
                      </div>
                    </div>
                  )}
                  {!follower && isPortal && (
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

        {/* Movement line overlay */}
        {(() => {
          if (activeAbility || !hoveredTile) return null;
          const { x: hx, y: hy } = hoveredTile;
          if (!isValidMoveTarget({ x: hx, y: hy }, activeMoverPos, movement, isMoveWalkable, isMoveOccupied, isMoveSpecial)) return null;

          const half = TILE_SIZE / 2;
          const x1 = activeMoverPos.x * TILE_SIZE + half;
          const y1 = activeMoverPos.y * TILE_SIZE + half;
          const x2 = hx * TILE_SIZE + half;
          const y2 = hy * TILE_SIZE + half;

          return (
            <MoveLine
              svgWidth={11 * TILE_SIZE} svgHeight={11 * TILE_SIZE}
              x1={x1} y1={y1} x2={x2} y2={y2}
            />
          );
        })()}
        </div>
      </div>
    </div>
  );
}

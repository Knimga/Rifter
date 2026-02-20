import React from 'react';
import { Zap } from 'lucide-react';
import { CLASSES, type ClassKey } from '../data/classes';
import { TILE_SIZE } from '../data/constants';

interface Props {
  selectedClass: ClassKey;
  playerPos: { x: number; y: number };
  movement: number;
  onMove: (pos: { x: number; y: number }) => void;
  onLocationChange: (location: 'dungeon') => void;
  activeAbility: unknown;
  onAbilityDeselect: () => void;
  playerHp: number;
  playerMaxHp: number;
}

const PORTAL_POS = { x: 5, y: 2 };

export default function SanctumMap({ selectedClass, playerPos, movement, onMove, onLocationChange, activeAbility, onAbilityDeselect, playerHp, playerMaxHp }: Props) {
  const isAdjacent = (x: number, y: number) => {
    const dx = Math.abs(x - playerPos.x);
    const dy = Math.abs(y - playerPos.y);
    return dx <= 1 && dy <= 1 && (dx + dy) > 0;
  };

  const isAdjacentToPortal = isAdjacent(PORTAL_POS.x, PORTAL_POS.y);

  const handleClick = (x: number, y: number, isWall: boolean, isPortal: boolean) => {
    if (isWall) return;
    if (activeAbility) {
      onAbilityDeselect();
      return;
    }
    if (isPortal) {
      if (isAdjacentToPortal) onLocationChange('dungeon');
      return;
    }
    const distance = Math.max(Math.abs(x - playerPos.x), Math.abs(y - playerPos.y));
    if (distance <= movement) onMove({ x, y });
  };

  return (
    <div className="flex flex-col items-center">
      <div className="bg-gray-800 p-4 rounded-lg inline-block">
        {Array.from({ length: 11 }).map((_, y) => (
          <div key={y} className="flex">
            {Array.from({ length: 11 }).map((_, x) => {
              const isPlayer = playerPos.x === x && playerPos.y === y;
              const isPortal = PORTAL_POS.x === x && PORTAL_POS.y === y;
              const isWall = x === 0 || x === 10 || y === 0 || y === 10;

              return (
                <div
                  key={`${x}-${y}`}
                  onClick={() => handleClick(x, y, isWall, isPortal)}
                  style={{ width: TILE_SIZE, height: TILE_SIZE }}
                  className={`shrink-0 border border-gray-700 flex items-center justify-center text-xs ${
                    isWall
                      ? 'bg-gray-950'
                      : Math.max(Math.abs(x - playerPos.x), Math.abs(y - playerPos.y)) <= movement && !isWall && !isPortal && !(x === playerPos.x && y === playerPos.y)
                        ? 'bg-gray-900 hover:bg-gray-800'
                        : 'bg-gray-900'
                  }`}
                >
                  {isPlayer && (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <div className={`w-8 h-8 ${CLASSES[selectedClass].color} rounded flex items-center justify-center`}>
                        {React.createElement(CLASSES[selectedClass].token, { className: 'w-5 h-5 text-white' })}
                      </div>
                      <div className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-8 h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green-500 transition-all"
                          style={{ width: `${(playerHp / playerMaxHp) * 100}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {isPortal && (
                    <div
                      className={`transition-all ${isAdjacentToPortal ? 'cursor-pointer animate-pulse' : ''}`}
                      style={{ filter: isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(192,132,252,0.8))' : 'none' }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.filter = 'drop-shadow(0 0 12px rgba(192,132,252,1))'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.filter = isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(192,132,252,0.8))' : 'none'; }}
                    >
                      <Zap className="w-6 h-6 text-purple-400" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

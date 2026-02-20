import React, { useState, useEffect, useRef } from 'react';
import { isWeaponItem, WEAPON_ICON_PATH, type GearSlots } from '../data/gear';
import type { Ability } from '../data/classes';

// ─── Slot types ─────────────────────────────────────────────────────────────

export type SlotContent = 'weapon-attack' | Ability | null;

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  gear: GearSlots;
  abilities: Ability[];
  slots: SlotContent[];
  onSlotsChange: (slots: SlotContent[]) => void;
  activeSlot: number | null;
  onActiveSlotChange: (slot: number | null) => void;
  inCombat: boolean;
  isPlayerTurn: boolean;
  playerActedThisTurn: boolean;
}

export default function ActionBar({ gear, abilities, slots, onSlotsChange, activeSlot, onActiveSlotChange, inCombat, isPlayerTurn, playerActedThisTurn }: Props) {
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const weapon = gear.mainhand && isWeaponItem(gear.mainhand) ? gear.mainhand : null;

  // Close menu on outside click
  useEffect(() => {
    if (openMenu === null) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [openMenu]);

  const disabled = inCombat && (!isPlayerTurn || playerActedThisTurn);

  const handleClick = (i: number) => {
    if (disabled) return;
    if (slots[i] === null) return;
    onActiveSlotChange(activeSlot === i ? null : i);
  };

  const handleRightClick = (e: React.MouseEvent, i: number) => {
    e.preventDefault();
    setOpenMenu(openMenu === i ? null : i);
  };

  const assign = (i: number, ability: SlotContent) => {
    onSlotsChange(slots.map((s, idx) => idx === i ? ability : s));
    if (ability === null && activeSlot === i) onActiveSlotChange(null);
    setOpenMenu(null);
  };

  return (
    <div className="flex justify-center gap-3">
      {slots.map((slot, i) => {
        const weaponIconSrc = weapon ? WEAPON_ICON_PATH[weapon.weaponType] : undefined;
        const isOpen = openMenu === i;
        const isActive = activeSlot === i && slot !== null;

        return (
          <div key={i} className="relative">

            {/* Dropup menu */}
            {isOpen && (
              <div
                ref={menuRef}
                className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-800 border border-gray-600 rounded-lg shadow-xl py-1 min-w-[152px] z-10"
              >
                {weapon && (
                  <button
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => assign(i, 'weapon-attack')}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                  >
                    {weaponIconSrc && <img src={weaponIconSrc} alt="" className="w-4 h-4 shrink-0" />}
                    Weapon Attack
                  </button>
                )}
                {abilities.map((ability) => (
                  <button
                    key={ability.name}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={() => assign(i, ability)}
                    className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-gray-700 flex items-center gap-2"
                  >
                    {React.createElement(ability.icon, { className: 'w-4 h-4 text-gray-300 shrink-0' })}
                    {ability.name}
                  </button>
                ))}
                {!weapon && abilities.length === 0 && (
                  <div className="px-3 py-2 text-sm text-gray-500 italic">No abilities</div>
                )}
                <div className="border-t border-gray-700 my-1" />
                <button
                  onMouseDown={(e) => e.stopPropagation()}
                  onClick={() => assign(i, null)}
                  className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-700 rounded-b-lg"
                >
                  — None —
                </button>
              </div>
            )}

            {/* Slot */}
            <div
              onClick={() => handleClick(i)}
              onContextMenu={(e) => handleRightClick(e, i)}
              className={`w-16 h-16 border rounded-lg transition-colors flex items-center justify-center
                ${disabled
                  ? 'bg-blue-950 border-blue-800 opacity-50'
                  : isActive
                    ? 'bg-yellow-500 border-yellow-300'
                    : isOpen
                      ? 'bg-blue-800 border-blue-500'
                      : 'bg-blue-900 hover:bg-blue-800 border-blue-700'
                }`}
            >
              {slot === 'weapon-attack' && weaponIconSrc && (
                <img
                  src={weaponIconSrc}
                  alt=""
                  className={`w-8 h-8 ${isActive ? 'brightness-0' : ''}`}
                />
              )}
              {slot !== null && slot !== 'weapon-attack' && (
                React.createElement(slot.icon, { className: `w-8 h-8 ${isActive ? 'text-gray-900' : 'text-gray-200'}` })
              )}
            </div>

          </div>
        );
      })}
    </div>
  );
}

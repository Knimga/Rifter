import React from 'react';
import {
  X, Crown, Shirt, Hand, Footprints, Sword, Shield,
} from 'lucide-react';
import {
  CLASSES, getTotalAttribute,
  type ClassKey, type AttributeKey, type Stats
} from '../data/classes';
import {
  GEAR_SLOTS, isArmorItem, isShieldItem, isWeaponItem,
  WEAPON_ICON_PATH,
  type GearSlots, type GearSlot
} from '../data/gear';
import type { ComponentType } from 'react';
import { Tooltip, WeaponTooltipContent, ArmorTooltipContent } from './Tooltip';

interface Props {
  characterName: string;
  selectedClass: ClassKey;
  pointsSpent: Record<AttributeKey, number>;
  stats: Stats;
  playerHp: number;
  gear: GearSlots;
  onClose: () => void;
}

const ATTRIBUTES: AttributeKey[] = ['strength', 'toughness', 'finesse', 'mind', 'spirit'];
const ATTR_LABEL: Record<AttributeKey, string> = {
  strength: 'STRENGTH', toughness: 'TOUGHNESS', finesse: 'FINESSE', mind: 'MIND', spirit: 'SPIRIT',
};

const SLOT_LABEL: Record<GearSlot, string> = {
  helm: 'Helm', chest: 'Chest', gloves: 'Gloves', boots: 'Boots',
  mainhand: 'Main Hand', offhand: 'Off Hand',
};

const SLOT_ICON: Record<GearSlot, ComponentType<{ className?: string }>> = {
  helm: Crown, chest: Shirt, gloves: Hand, boots: Footprints,
  mainhand: Sword, offhand: Shield,
};

// Grid position for each slot (col, row) in a 3×4 CSS grid
const SLOT_POS: Record<GearSlot, { col: number; row: number }> = {
  helm:     { col: 2, row: 1 },
  chest:    { col: 2, row: 2 },
  mainhand: { col: 1, row: 3 },
  gloves:   { col: 2, row: 3 },
  offhand:  { col: 3, row: 3 },
  boots:    { col: 2, row: 4 },
};

function Stat({ label, value, color }: { label: string; value: string | number; color?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className={`font-semibold ${color ?? ''}`}>{value}</span>
    </div>
  );
}

function GearSlotPane({ slot, gear, stats }: { slot: GearSlot; gear: GearSlots; stats: Stats }) {
  const item = gear[slot];
  const Icon = SLOT_ICON[slot];

  const tooltipContent = item
    ? isWeaponItem(item)
      ? <WeaponTooltipContent item={item} stats={stats} />
      : (isArmorItem(item) || isShieldItem(item))
        ? <ArmorTooltipContent item={item} />
        : null
    : null;

  return (
    <Tooltip
      content={tooltipContent}
      className="flex flex-col items-center"
      style={{ gridColumn: SLOT_POS[slot].col, gridRow: SLOT_POS[slot].row }}
    >
      <div
        className={`w-14 h-14 rounded-lg border flex flex-col items-center pt-1 ${
          item ? 'bg-gray-700 border-gray-500' : 'bg-gray-800 border-gray-700'
        }`}
      >
        <span className="text-[9px] font-semibold text-gray-500 leading-none">{SLOT_LABEL[slot]}</span>
        <div className="flex-1 flex items-center justify-center">
          {item && isWeaponItem(item) && WEAPON_ICON_PATH[item.weaponType]
            ? <img src={WEAPON_ICON_PATH[item.weaponType]} alt="" className="w-7 h-7" />
            : <Icon className={item ? 'w-7 h-7 text-gray-200' : 'w-5 h-5 text-gray-600 opacity-30'} />
          }
        </div>
      </div>
    </Tooltip>
  );
}

const INVENTORY_COLS = 12;
const INVENTORY_ROWS = 5;

export default function CharacterSheet({ characterName, selectedClass, pointsSpent, stats, playerHp, gear, onClose }: Props) {
  const classData = CLASSES[selectedClass];
  const Token = classData.token;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />

      <div
        className="relative bg-gray-900 border border-gray-700 rounded-xl w-[860px] max-h-[85vh] overflow-y-auto p-6"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-300">
          <X className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3 mb-5">
          <div className={`${classData.color} p-2 rounded`}>
            {React.createElement(Token, { className: 'w-6 h-6 text-white' })}
          </div>
          <div>
            <h2 className="text-xl font-bold text-red-500">{characterName}</h2>
            <p className="text-sm text-gray-400">{classData.name} - Level {stats.level}</p>
          </div>
        </div>

        {/* Main layout: Equipment (left) | Stats (right) */}
        <div className="flex gap-4">
          {/* Equipment — body layout */}
          <div className="shrink-0">
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Equipment</h3>
            <div className="grid grid-cols-3 gap-2 justify-items-center" style={{ gridTemplateRows: 'repeat(4, auto)' }}>
              {GEAR_SLOTS.map(slot => (
                <GearSlotPane key={slot} slot={slot} gear={gear} stats={stats} />
              ))}
            </div>
          </div>

          {/* Right side — all stats */}
          <div className="flex-1 min-w-0">
            {/* Attributes + Derived Stats */}
            <div className="grid grid-cols-2 gap-4 mb-4">
              {/* Attributes */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Attributes</h3>
                <div className="space-y-1.5 text-sm">
                  {ATTRIBUTES.map(attr => (
                    <div key={attr} className="flex justify-between">
                      <span className="text-gray-400">{ATTR_LABEL[attr]}</span>
                      <span className="font-bold text-yellow-400">{getTotalAttribute(attr, pointsSpent, selectedClass)}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Core + Defense */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Stats</h3>
                <div className="space-y-1.5 text-sm">
                  <Stat label="HP" value={`${playerHp} / ${stats.hp}`} color="text-green-400" />
                  <Stat label="MP" value={stats.mp} color="text-blue-400" />
                  <Stat label="Initiative" value={stats.initiative} />
                  <Stat label="Movement" value={stats.movement} />
                  <Stat label="Armor" value={stats.armor} />
                  <Stat label="Dodge" value={`${stats.dodge}%`} />
                  <Stat label="Magic Res" value={stats.magicResistance} />
                </div>
              </div>
            </div>

            {/* Offense */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              {([['Melee', 'melee', 'text-red-400'], ['Ranged', 'ranged', 'text-green-400'], ['Magic', 'magic', 'text-purple-400']] as const).map(([label, key, color]) => (
                <div key={key} className="bg-gray-800 rounded-lg p-4">
                  <h3 className={`text-xs font-bold uppercase tracking-wide mb-3 ${color}`}>{label}</h3>
                  <div className="space-y-1.5 text-sm">
                    <Stat label="Hit" value={`${stats[key].hitBonus}%`} />
                    <Stat label="Damage" value={`+${stats[key].damage}`} />
                    <Stat label="Crit" value={`${stats[key].crit}%`} />
                  </div>
                </div>
              ))}
            </div>

            {/* Inventory */}
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Inventory</h3>
              <div
                className="grid gap-px"
                style={{ gridTemplateColumns: `repeat(${INVENTORY_COLS}, 40px)`, gridTemplateRows: `repeat(${INVENTORY_ROWS}, 40px)` }}
              >
                {Array.from({ length: INVENTORY_COLS * INVENTORY_ROWS }).map((_, i) => (
                  <div key={i} className="bg-gray-700 border border-gray-600 rounded-sm" />
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

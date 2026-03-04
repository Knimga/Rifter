import { useState, useRef, useEffect } from 'react';
import {
  X, Crown, Shirt, Hand, Footprints, Sword, Shield,
} from 'lucide-react';
import { CLASSES, type ClassKey } from '../data/classes';
import type { AttributeKey, ActiveBuff } from '../data/stats';
import { calculateStats, type Stats } from '../data/stats';
import {
  GEAR_SLOTS, getGearArmorBonus, isArmorItem, isShieldItem, isWeaponItem,
  WEAPON_ICON_PATH, ARMOR_ICON, SHIELD_ICON,
  type GearSlots, type GearSlot
} from '../data/gear';
import type { ComponentType } from 'react';
import { Tooltip, WeaponTooltipContent, ArmorTooltipContent } from './Tooltip';

interface PartyEntry {
  characterName: string;
  selectedClass: ClassKey;
  pointsSpent: Record<AttributeKey, number>;
  gear: GearSlots;
}

interface Props {
  party: PartyEntry[];
  partyHp: number[];
  partyStats: Stats[];
  partyBuffs: ActiveBuff[][];
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

function Stat({ label, value, delta }: { label: string; value: string | number; delta?: number }) {
  const color = !delta ? 'text-white' : delta > 0 ? 'text-green-400' : 'text-red-400';
  return (
    <div className="flex justify-between">
      <span className="text-gray-400">{label}</span>
      <span className={`font-semibold ${color}`}>{value}</span>
    </div>
  );
}

function GearSlotPane({ slot, gear, stats }: { slot: GearSlot; gear: GearSlots; stats: Stats }) {
  const item = gear[slot];
  const EmptyIcon = SLOT_ICON[slot];

  const tooltipContent = item
    ? isWeaponItem(item)
      ? <WeaponTooltipContent item={item} stats={stats} />
      : (isArmorItem(item) || isShieldItem(item))
        ? <ArmorTooltipContent item={item} />
        : null
    : null;

  let iconContent;
  if (item && isWeaponItem(item) && WEAPON_ICON_PATH[item.weaponType]) {
    iconContent = <img src={WEAPON_ICON_PATH[item.weaponType]} alt="" className="w-9 h-9" />;
  } else if (item && isShieldItem(item)) {
    const Icon = SHIELD_ICON;
    iconContent = <Icon className="w-9 h-9 text-gray-200" />;
  } else if (item && isArmorItem(item)) {
    const Icon = ARMOR_ICON[item.armorType][item.slot];
    iconContent = <Icon className="w-9 h-9 text-gray-200" />;
  } else {
    iconContent = <EmptyIcon className={item ? 'w-9 h-9 text-gray-200' : 'w-5 h-5 text-gray-600 opacity-30'} />;
  }

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
          {iconContent}
        </div>
      </div>
    </Tooltip>
  );
}

const INVENTORY_COLS = 12;
const INVENTORY_ROWS = 5;

export default function CharacterSheet({ party, partyHp, partyStats, partyBuffs, onClose }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const statsScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    statsScrollRef.current?.scrollTo(0, 0);
  }, [selectedIdx]);

  const member = party[selectedIdx];
  const { characterName, selectedClass, pointsSpent, gear } = member;
  const stats = partyStats[selectedIdx];
  const playerHp = partyHp[selectedIdx] ?? stats.hp;

  // Base stats (no buffs) for delta coloring
  const baseStats = calculateStats(selectedClass, pointsSpent, getGearArmorBonus(gear));

  const classData = CLASSES[selectedClass];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />

      <div
        className="relative bg-gray-900 border border-gray-700 rounded-xl w-[940px] max-h-[85vh] flex overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Left sidebar ─────────────────────────────────────────── */}
        <div className="w-44 shrink-0 bg-gray-800 border-r border-gray-700 p-4 flex flex-col">
          <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Party</h2>

          <div className="space-y-2">
            {party.map((m, i) => {
              const isActive = selectedIdx === i;
              const cd = CLASSES[m.selectedClass];

              return (
                <button
                  key={i}
                  onClick={() => setSelectedIdx(i)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                    isActive
                      ? 'bg-gray-700 border-gray-500'
                      : 'bg-gray-900/50 border-gray-700 hover:bg-gray-700/50'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: cd.color }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: cd.color }}>
                        {m.characterName.trim() || `Character ${i + 1}`}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{cd.name}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Main content ─────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Close button */}
          <button onClick={onClose} className="absolute top-4 right-4 text-gray-500 hover:text-gray-300">
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-full shrink-0" style={{ backgroundColor: classData.color }} />
            <div>
              <h2 className="text-xl font-bold" style={{ color: classData.color }}>{characterName}</h2>
              <p className="text-sm text-gray-400">{classData.name} — Level {stats.level}</p>
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
                    {ATTRIBUTES.map(attr => {
                      const value = stats.attributes[attr];
                      const delta = value - baseStats.attributes[attr];
                      const color = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-white';
                      return (
                        <div key={attr} className="flex justify-between">
                          <span className="text-gray-400">{ATTR_LABEL[attr]}</span>
                          <span className={`font-bold ${color}`}>{value}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Core + Defense */}
                <div className="bg-gray-800 rounded-lg p-4">
                  <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">Stats</h3>
                  <div
                    ref={statsScrollRef}
                    className="space-y-1.5 text-sm overflow-y-auto max-h-[168px] thin-scrollbar pr-1"
                  >
                    <Stat label="HP" value={`${playerHp} / ${stats.hp}`} delta={stats.hp - baseStats.hp} />
                    <Stat label="HP Regen" value={stats.hpRegen} delta={stats.hpRegen - baseStats.hpRegen} />
                    <Stat label="MP" value={stats.mp} delta={stats.mp - baseStats.mp} />
                    <Stat label="MP Regen" value={stats.mpRegen} delta={stats.mpRegen - baseStats.mpRegen} />
                    <Stat label="Initiative" value={stats.initiative} delta={stats.initiative - baseStats.initiative} />
                    <Stat label="Movement" value={stats.movement} delta={stats.movement - baseStats.movement} />
                    <Stat label="Armor" value={stats.armor} delta={stats.armor - baseStats.armor} />
                    <Stat label="Dodge" value={`${stats.dodge}%`} delta={stats.dodge - baseStats.dodge} />
                    <Stat label="Magic Res" value={stats.magicResistance} delta={stats.magicResistance - baseStats.magicResistance} />
                    <Stat label="Healing" value={stats.healing} delta={stats.healing - baseStats.healing} />
                  </div>
                </div>
              </div>

              {/* Offense */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                {([['Melee', 'melee', 'text-red-400'], ['Ranged', 'ranged', 'text-green-400'], ['Magic', 'magic', 'text-purple-400']] as const).map(([label, key, color]) => (
                  <div key={key} className="bg-gray-800 rounded-lg p-4">
                    <h3 className={`text-xs font-bold uppercase tracking-wide mb-3 ${color}`}>{label}</h3>
                    <div className="space-y-1.5 text-sm">
                      <Stat label="Hit" value={`${stats[key].hitBonus}%`} delta={stats[key].hitBonus - baseStats[key].hitBonus} />
                      <Stat label="Damage" value={`+${stats[key].damage}`} delta={stats[key].damage - baseStats[key].damage} />
                      <Stat label="Crit" value={`${stats[key].crit}%`} delta={stats[key].crit - baseStats[key].crit} />
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
    </div>
  );
}

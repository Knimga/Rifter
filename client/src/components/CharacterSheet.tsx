import { useState, useRef, useEffect } from 'react';
import {
  X, Crown, Shirt, Hand, Footprints, Sword, Shield,
} from 'lucide-react';
import { CLASSES } from '../data/classes';
import { PARTY_MEMBER_COLOR } from '../data/constants';
import { ATTRIBUTE_KEYS, recomputeStats, formatStat, type Stats } from '../data/stats';
import { GEAR_SLOTS, getGearArmorBonus, getGearBuffs, type GearSlots, type GearSlot, type Item } from '../data/gear';
import type { PartyMemberConfig } from '../data/party';
import type { ComponentType } from 'react';
import { Tooltip, ItemTooltipContent } from './Tooltip';
import ItemIcon from './ItemIcon';
import { INVENTORY_COLS, INVENTORY_ROWS, INVENTORY_SIZE, canEquip, canUnequip, isProficient, type Inventory } from '../data/inventory';
import { AttributeTooltips, ATTR_LABEL, SLOT_LABEL } from '../data/detailStrings';

interface Props {
  party: PartyMemberConfig[];
  partyHp: number[];
  partyStats: Stats[];
  inventory: Inventory;
  onClose: () => void;
  onEquipItem?: (inventoryIdx: number, charIdx: number) => void;
  onUnequipItem?: (slot: GearSlot, charIdx: number) => void;
}

// Stats pane rows: [label, stat key]. Values go through formatStat (adds % where applicable).
type StatRowKey = 'hpRegen' | 'mp' | 'mpRegen' | 'initiative' | 'movement' | 'armor' | 'dodge'
  | 'parry' | 'block' | 'glancingBlow' | 'magicResistance' | 'healing';
const STAT_ROWS: [string, StatRowKey][] = [
  ['HP Regen', 'hpRegen'], ['MP', 'mp'], ['MP Regen', 'mpRegen'], ['Initiative', 'initiative'], ['Movement', 'movement'],
  ['Armor', 'armor'], ['Dodge', 'dodge'], ['Parry', 'parry'], ['Block', 'block'], ['Glancing Blow', 'glancingBlow'],
  ['Magic Res', 'magicResistance'], ['Healing', 'healing'],
];

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

/** Right-click handler that suppresses the browser menu on item cells and runs `action` when allowed. */
const rightClick = (hasItem: boolean, action: (() => void) | null) => (e: React.MouseEvent) => {
  if (!hasItem) return;
  e.preventDefault();
  action?.();
};

function GearSlotPane({ slot, gear, stats, onUnequip }: { slot: GearSlot; gear: GearSlots; stats: Stats; onUnequip: (() => void) | null }) {
  const item = gear[slot];
  const EmptyIcon = SLOT_ICON[slot];

  return (
    <Tooltip
      content={item && <ItemTooltipContent item={item} stats={stats} clickAction={onUnequip ? 'Unequip' : undefined} />}
      className="flex flex-col items-center"
      style={{ gridColumn: SLOT_POS[slot].col, gridRow: SLOT_POS[slot].row }}
    >
      <div
        className={`w-14 h-14 rounded-lg border bg-gray-800 flex flex-col items-center pt-1 ${
          item ? 'border-gray-500' : 'border-gray-700'
        } ${item && onUnequip ? 'cursor-pointer' : ''}`}
        onContextMenu={rightClick(!!item, onUnequip)}
      >
        <span className="text-[9px] font-semibold text-gray-500 leading-none">{SLOT_LABEL[slot]}</span>
        <div className="flex-1 flex items-center justify-center">
          {item
            ? <ItemIcon item={item} className="w-9 h-9" />
            : <EmptyIcon className="w-5 h-5 text-gray-600 opacity-30" />}
        </div>
      </div>
    </Tooltip>
  );
}

export default function CharacterSheet({ party, partyHp, partyStats, inventory, onClose, onEquipItem, onUnequipItem }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const statsScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    statsScrollRef.current?.scrollTo(0, 0);
  }, [selectedIdx]);

  const member = party[selectedIdx];
  const { characterName, selectedClass, gear } = member;
  const stats = partyStats[selectedIdx];
  const classData = CLASSES[selectedClass!];
  const playerHp = partyHp[selectedIdx] ?? stats.hp;

  // Base stats (gear affixes, no combat buffs) for delta coloring
  const baseStats = recomputeStats(
    { mode: 'player', classKey: selectedClass, gearArmorBonus: getGearArmorBonus(gear) },
    getGearBuffs(gear),
  );

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
              const cd = CLASSES[m.selectedClass!];

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
                    <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: PARTY_MEMBER_COLOR }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: PARTY_MEMBER_COLOR }}>
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
            <div className="w-10 h-10 rounded-full shrink-0" style={{ backgroundColor: PARTY_MEMBER_COLOR }} />
            <div>
              <h2 className="text-xl font-bold" style={{ color: PARTY_MEMBER_COLOR }}>{characterName}</h2>
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
                  <GearSlotPane
                    key={slot} slot={slot} gear={gear} stats={stats}
                    onUnequip={onUnequipItem && canUnequip(inventory, gear, slot) ? () => onUnequipItem(slot, selectedIdx) : null}
                  />
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
                    {ATTRIBUTE_KEYS.map(attr => {
                      const value = stats.attributes[attr];
                      const delta = value - baseStats.attributes[attr];
                      const color = delta > 0 ? 'text-green-400' : delta < 0 ? 'text-red-400' : 'text-white';
                      return (
                        <div key={attr} className="flex justify-between">
                          <Tooltip
                            className="group"
                            content={<div className="px-3 py-2 max-w-[220px]"><p className="italic text-gray-300 text-sm">{AttributeTooltips[attr]}</p></div>}
                          >
                            <span className="text-gray-400 group-hover:text-gray-200 transition-colors cursor-default">{ATTR_LABEL[attr]}</span>
                          </Tooltip>
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
                    {STAT_ROWS.map(([label, key]) => (
                      <Stat key={key} label={label} value={formatStat(key, stats[key])} delta={stats[key] - baseStats[key]} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Offense */}
              <div className="grid grid-cols-3 gap-4 mb-4">
                {([['Melee', 'melee', 'text-red-400'], ['Ranged', 'ranged', 'text-green-400'], ['Magic', 'magic', 'text-purple-400']] as const).map(([label, key, color]) => (
                  <div key={key} className="bg-gray-800 rounded-lg p-4">
                    <h3 className={`text-xs font-bold uppercase tracking-wide mb-3 ${color}`}>{label}</h3>
                    <div className="space-y-1.5 text-sm">
                      <Stat label="Hit" value={formatStat(`${key}Hit`, stats[key].hit)} delta={stats[key].hit - baseStats[key].hit} />
                      <Stat label="Damage" value={`+${stats[key].damage}`} delta={stats[key].damage - baseStats[key].damage} />
                      <Stat label="Crit" value={formatStat(`${key}Crit`, stats[key].crit)} delta={stats[key].crit - baseStats[key].crit} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Inventory */}
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-3">
                  Inventory <span className="text-gray-600 font-normal normal-case tracking-normal">{inventory.length} / {INVENTORY_SIZE}</span>
                </h3>
                <div
                  className="grid gap-px"
                  style={{ gridTemplateColumns: `repeat(${INVENTORY_COLS}, 40px)`, gridTemplateRows: `repeat(${INVENTORY_ROWS}, 40px)` }}
                >
                  {Array.from({ length: INVENTORY_SIZE }).map((_, i) => {
                    const item: Item | undefined = inventory[i];
                    const proficient = item ? isProficient(classData, item) : undefined;
                    const equip = onEquipItem && canEquip(classData, item) ? () => onEquipItem(i, selectedIdx) : null;

                    return (
                      <Tooltip key={i} content={item && <ItemTooltipContent item={item} stats={stats} proficient={proficient} clickAction={equip ? 'Equip' : undefined} />}>
                        <div
                          className={`w-full h-full flex items-center justify-center border rounded-sm ${
                            item ? 'bg-gray-700 border-gray-500' : 'bg-gray-900/50 border-gray-700/50'
                          } ${equip ? 'cursor-pointer' : ''}`}
                          onContextMenu={rightClick(!!item, equip)}
                        >
                          {item && <ItemIcon item={item} className="w-7 h-7" />}
                        </div>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

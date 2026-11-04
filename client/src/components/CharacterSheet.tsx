// The party window: party rail, the member's model and equipment, the shared
// inventory (or, its Shards tab, the party's affix shards, or its Keys tab, the keyring), and their attributes,
// skills and stats (StatsPanel). Values raised or
// lowered by gear, buffs and debuffs show green / red (a green one's tooltip says by how much), pulse yellow when
// the gear changes them, and (the stats, not the attributes and skills themselves) glow yellow while placed
// level-up points change them.
// Level-up: the party's XP bar on the rail; a member with points to
// spend is marked on the rail, gets a header banner (Reset, Confirm) and + / - on their attribute and skill
// rows. Placed points stay pending (kept by GameScreen, so closing the window keeps them) until Confirm.
import { lazy, Suspense, useMemo, useState, type ComponentType, type MouseEvent } from 'react';
import { Crown, Shirt, Hand, Footprints, Sword, Shield, Gem, CircleDot } from 'lucide-react';
import { CLASSES } from '../data/units/classes';
import { ATTRIBUTE_KEYS, SKILL_KEYS, recomputeStats, type ActiveBuff, type Stats } from '../data/units/stats';
import { GEAR_SLOTS, getGearBuffs, type GearSlot, type Item } from '../data/gear';
import { equipCompare, hasPointsToSpend, memberStatInput, memberStats, noPendingPoints, pointsLeft, spendPoints, type PartyMemberConfig, type PendingPoints } from '../data/units/party';
import { xpToNext, type PartyProgress } from '../data/units/xp';
import { INVENTORY_COLS, INVENTORY_SIZE, canEquip, canSwapGear, canUnequip, isProficient, type Inventory } from '../data/gear/inventory';
import { AttributeTooltips, SkillTooltips, ATTR_LABEL, SLOT_LABEL, capitalize } from '../data/detailStrings';
import { Tooltip, ItemTooltipContent, TextTip } from './Tooltip';
import ItemIcon, { rarityGlow } from './ItemIcon';
import ItemGrid from './ItemGrid';
import { sameSpot, useItemDrag, type ItemSpot } from '../hooks/useItemDrag';
import Portrait from './hud/Portrait';
import { PanelTitle } from './ui/Panel';
import { XpBar } from './hud/XpBar';
import { characterLookKey, characterModel, heldGear } from './characterModel';
import StatsPanel, { GearChange, Val, type Shift, type StatShift } from './StatsPanel';
import Keyring from './Keyring';
import ShardsTab, { type ShardFilter } from './ShardsTab';
import type { ShardCounts } from '../data/gear/shards';
import ModalWindow, { WindowCloseButton } from './ui/ModalWindow';
import GoldAmount from './ui/GoldAmount';
import type { DungeonKey } from '../data/world/dungeons';

// The turning model (lazy: it pulls in three.js)
const ModelTurntable = lazy(() => import('./ModelTurntable'));

interface Props {
  party: PartyMemberConfig[];
  partyHp: number[];
  partyMp: number[];
  partyStats: Stats[];
  /** Each member's active buffs and debuffs (effects, not gear): what colors their stats red. */
  partyBuffs: ActiveBuff[][];
  inventory: Inventory;
  /** The party's gold (shared, like the inventory). */
  gold: number;
  /** The party's affix shards (shared, like the inventory): how many of each type it carries. */
  shards: ShardCounts;
  /** The party's rift keys (shared, like the inventory), in the order obtained. */
  keys: readonly DungeonKey[];
  /** A key was obtained since the Keys tab was last opened: the tab glows gold. */
  hasNewKey: boolean;
  /** The Keys tab was opened (the new key has been seen). */
  onSeeKeys: () => void;
  /** Shards were picked up since the Shards tab was last opened: the tab glows gold, as the Keys tab does. */
  hasNewShards: boolean;
  /** The Shards tab was opened (the new shards have been seen). */
  onSeeShards: () => void;
  onClose: () => void;
  /** Equip an inventory item on a member: in its own slot, or `slot` (dragged onto it). */
  onEquipItem?: (inventoryIdx: number, charIdx: number, slot?: GearSlot) => void;
  /** Unequip a member's item: into inventory slot `to` (an empty one it was dragged to), else the first empty one. */
  onUnequipItem?: (slot: GearSlot, charIdx: number, to?: number) => void;
  /** Move an inventory item to another slot (dragged there), trading places with any item there. */
  onMoveItem?: (from: number, to: number) => void;
  /** Swap a member's items in two gear slots (one dragged onto the other: a ring to the other ring slot). */
  onSwapGear?: (from: GearSlot, to: GearSlot, charIdx: number) => void;
  /** The party's shared level and XP. */
  progress: PartyProgress;
  /** Each member's placed, unconfirmed level-up points. */
  pending: PendingPoints[];
  /** Change a member's placed points: `update` gets the latest ones (so quick clicks never overwrite each other). */
  onPendingChange: (charIdx: number, update: (pending: PendingPoints) => PendingPoints) => void;
  /** Spend the member's pending points (Confirm). */
  onConfirmPoints: (charIdx: number) => void;
}

/** The window's design size (px); it scales down to fit smaller screens. */
const WIDTH = 1296, HEIGHT = 830;

const SLOT_ICON: Record<GearSlot, ComponentType<{ className?: string }>> = {
  helm: Crown, chest: Shirt, gloves: Hand, boots: Footprints,
  mainhand: Sword, offhand: Shield,
  amulet: Gem, ring1: CircleDot, ring2: CircleDot,
};

// Grid position for each slot (col, row) in the 3×5 equipment grid: the head, the amulet under it, the hands
// beside the chest, the rings beside the gloves, the boots at the bottom
const SLOT_POS: Record<GearSlot, { col: number; row: number }> = {
  helm:     { col: 2, row: 1 },
  amulet:   { col: 2, row: 2 },
  mainhand: { col: 1, row: 3 },
  chest:    { col: 2, row: 3 },
  offhand:  { col: 3, row: 3 },
  ring1:    { col: 1, row: 4 },
  gloves:   { col: 2, row: 4 },
  ring2:    { col: 3, row: 4 },
  boots:    { col: 2, row: 5 },
};

/** Level-up controls on an attribute or skill row. */
interface PointControls {
  /** Points placed here, not yet confirmed (shown as "+n"). */
  pending: number;
  /** The panel still has points to place: show "+". */
  canAdd: boolean;
  onAdd: () => void;
}

/**
 * A labelled value on a dark strip (attributes and skills); hovering or focusing the label explains it.
 * While levelling up, "+" adds a point (the banner's Reset takes them all back); the value includes placed points.
 */
function TipRow({ label, tip, shift, caps, points }: { label: string; tip: string; shift: Shift; caps?: boolean; points?: PointControls }) {
  const name = capitalize(label.toLowerCase());
  return (
    <div className="flex items-center justify-between gap-1.5 box-border min-h-6 px-2.5 bg-rift-void border border-rift-seam rounded-sm">
      <Tooltip content={<TextTip>{tip}</TextTip>} gap={6}>
        <span tabIndex={0} className={`rf-tiplabel text-[11px] ${caps ? 'tracking-[0.08em]' : ''}`}>{label}</span>
      </Tooltip>
      <span className="flex items-center gap-1.5">
        {points && points.pending > 0 && <span className="text-[11px]" style={{ color: 'var(--glow)' }}>+{points.pending}</span>}
        {points?.canAdd && (
          <button type="button" className="rf-pt" aria-label={`Add point to ${name}`} onClick={points.onAdd}>
            <svg aria-hidden="true" width="8" height="8" viewBox="0 0 8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"><path d="M1 4h6M4 1v6" /></svg>
          </button>
        )}
        {/* Never yellow for placed points: the "+n" beside it shows those; only the stats they feed glow */}
        <Val shift={{ ...shift, pending: false }} className="text-sm min-w-[2ch] justify-end">{shift.value}</Val>
      </span>
    </div>
  );
}

/** The level-up banner's Reset and Confirm: small raised buttons in the technical font. */
const BANNER_BTN = 'rf-btn relative min-h-[36px] px-4 font-tech text-[11px] tracking-[0.14em]';

/** "n left" beside an Attributes / Skills heading while levelling up, "Done" once all are placed. */
function PointsLeft({ left }: { left: number }) {
  return <span className="text-[11px] tracking-[0.04em]" style={{ color: 'var(--glow)' }}>{left > 0 ? `${left} left` : 'Done'}</span>;
}

/** Right-click handler that suppresses the browser menu on item cells and runs `action` when allowed. */
const rightClick = (hasItem: boolean, action: (() => void) | null) => (e: MouseEvent) => {
  if (!hasItem) return;
  e.preventDefault();
  action?.();
};

function GearSlotBox({ slot, item: worn, stats, onUnequip, drag }: {
  slot: GearSlot; item: Item | null; stats: Stats; onUnequip: (() => void) | null;
  /** Dragging items (useItemDrag): an equipped item can be dragged out, and its slot shows empty meanwhile. */
  drag: ReturnType<typeof useItemDrag>;
}) {
  const EmptyIcon = SLOT_ICON[slot];
  const pos = { gridColumn: SLOT_POS[slot].col, gridRow: SLOT_POS[slot].row };
  const here: ItemSpot = { kind: 'gear', slot };
  const item = sameSpot(drag.dragging, here) ? null : worn;
  if (!item) {
    return (
      <div className="rf-eqs" style={pos} role="img" aria-label={`${SLOT_LABEL[slot]}: empty`} data-drop-gear={slot}>
        <EmptyIcon className="w-5 h-5 text-rift-rim" />
        <span className="text-[10px] tracking-[0.08em] uppercase">{SLOT_LABEL[slot]}</span>
      </div>
    );
  }
  return (
    <Tooltip gap={10} style={pos} content={<ItemTooltipContent item={item} stats={stats} clickAction={onUnequip ? 'Unequip' : undefined} />}>
      <div className={`rf-eqs is-filled ${rarityGlow(item).className}`} style={rarityGlow(item).style} aria-label={`${SLOT_LABEL[slot]}: ${item.name}`} data-drop-gear={slot} onContextMenu={rightClick(true, onUnequip)} onPointerDown={(e) => drag.start(here, e)}>
        <ItemIcon item={item} className="w-[28px] h-[28px]" />
        <span className="text-[10px] tracking-[0.08em] uppercase">{SLOT_LABEL[slot]}</span>
      </div>
    </Tooltip>
  );
}

export default function CharacterSheet({ party, partyHp, partyMp, partyStats, partyBuffs, inventory, gold, shards, keys, hasNewKey, onSeeKeys, hasNewShards, onSeeShards, onClose, onEquipItem, onUnequipItem, onMoveItem, onSwapGear, progress, pending: pendingAll, onPendingChange, onConfirmPoints }: Props) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  // The Inventory panel's tab: the shared inventory, the party's shards, or the keyring
  const [tab, setTab] = useState<'items' | 'shards' | 'keys'>('items');
  const showKeys = () => { setTab('keys'); onSeeKeys(); };
  const showShards = () => { setTab('shards'); onSeeShards(); };
  // The Shards tab's selected category and Carried / All toggle: kept while the window stays open, and (the window
  // being new each time it opens) starting at All and Carried every time
  const [shardCategory, setShardCategory] = useState<ShardFilter>('all');
  const [shardsAll, setShardsAll] = useState(false);

  const member = party[selectedIdx];
  const { characterName, selectedClass, gear } = member;
  // Level-up: the member's placed points and what's left to place. Every value shows the placed points as if
  // confirmed (a point in Evasion raises Dodge, Parry and Glancing Blow too); `shown` is the member with them spent.
  const pending = pendingAll[selectedIdx];
  const leveling = hasPointsToSpend(member);
  const left = pointsLeft(member, pending);
  const placed = left.attr < member.unspentAttributePoints || left.skill < member.unspentSkillPoints;
  const buffs = partyBuffs[selectedIdx] ?? [];
  const shown = placed ? spendPoints(member, pending) : member;
  const stats = placed ? memberStats(shown, partyStats[selectedIdx].level, buffs) : partyStats[selectedIdx];
  const classData = CLASSES[selectedClass];
  // Dragging items. From the inventory: onto another slot (it moves, or trades places), or onto a gear slot of the
  // selected member's it fits and they can wear (it is equipped there). From the member's gear: onto an empty
  // inventory slot (unequipped there), onto an item there that can take its place (they trade places), or onto
  // another of their gear slots it fits (a ring to the other ring slot: they swap).
  const drag = useItemDrag({
    canDrop: (from, to) => {
      if (from.kind === 'inventory') {
        return to.kind === 'inventory' ? !!onMoveItem : !!onEquipItem && canEquip(classData, inventory[from.idx], inventory, gear, to.slot);
      }
      if (to.kind === 'gear') return !!onSwapGear && canSwapGear(gear, from.slot, to.slot);
      const there = inventory[to.idx];
      return there ? !!onEquipItem && canEquip(classData, there, inventory, gear, from.slot) : !!onUnequipItem;
    },
    onDrop: (from, to) => {
      if (from.kind === 'inventory') {
        if (to.kind === 'inventory') onMoveItem?.(from.idx, to.idx);
        else onEquipItem?.(from.idx, selectedIdx, to.slot);
      } else if (to.kind === 'gear') onSwapGear?.(from.slot, to.slot, selectedIdx);
      else if (inventory[to.idx]) onEquipItem?.(to.idx, selectedIdx, from.slot);
      else onUnequipItem?.(from.slot, selectedIdx, to.idx);
    },
  });
  const hp = partyHp[selectedIdx] ?? stats.hp;
  const mp = partyMp[selectedIdx] ?? stats.mp;

  // What colors a stat: its base (class, level, spent points, class passives and the gear's armor values, with
  // what they feed like glancing blow: no affixes, implicits or effects) and the stats without the effects lowering
  // them. Green: raised above the base by an affix, implicit or effect on that stat itself (not through another:
  // Subtlety on gear raises crit too, but only Subtlety is green); red: an effect is lowering it now, even if it is
  // still above its base.
  // The tooltip's shares count only bonuses on the stat itself: the gear's, its affixes and implicits on that stat (whole
  // numbers: +Block counts toward Block, Evasion or Finesse on gear doesn't, though they raise it through their formulas);
  // the effects', the buffs and debuffs on that stat over that. Yellow: the placed, unconfirmed points change it (from
  // the member's confirmed stats).
  const statInput = memberStatInput(shown, stats.level);
  const baseStats = recomputeStats(statInput, []);
  const unlowered = memberStats(shown, stats.level, buffs.filter(b => b.amount >= 0 && (b.percent ?? 0) >= 0));
  const gearBuffs = getGearBuffs(gear);
  const raised = new Set([...gearBuffs, ...buffs].filter(b => b.amount > 0 || (b.percent ?? 0) > 0).map(b => b.stat));
  /**
   * How a stat stands: `dir` −1 an effect lowers it, 1 gear or an effect on it (`stat`) raises it above its base, 0
   * neither (Val's colors); and what the gear and the effects on it add (its tooltip).
   */
  const shift: StatShift = (stat, get) => {
    const value = get(stats);
    const gearOnly = get(recomputeStats(statInput, gearBuffs.filter(b => b.stat === stat)));
    const withEffects = get(recomputeStats(statInput, [...gearBuffs, ...buffs].filter(b => b.stat === stat)));
    return {
      value,
      dir: value < get(unlowered) ? -1 : raised.has(stat) && value > get(baseStats) ? 1 : 0,
      gear: gearOnly - get(baseStats),
      effects: withEffects - gearOnly,
      pending: placed && value !== get(partyStats[selectedIdx]),
    };
  };
  // What the member wears: a stat their gear changes pulses (Val)
  const worn = { member: selectedIdx, gear: GEAR_SLOTS.map(s => gear[s]?.id ?? '').join(',') };

  // The member's model, holding their equipped weapon and offhand
  const held = heldGear(gear);
  const lookKey = characterLookKey(selectedClass, held.weapon, held.offhand);
  const model = useMemo(() => characterModel(selectedClass, held.weapon, held.offhand), [lookKey]); // eslint-disable-line react-hooks/exhaustive-deps


  const ready = leveling && left.attr === 0 && left.skill === 0;
  const setPending = (fn: (p: PendingPoints) => PendingPoints) => onPendingChange(selectedIdx, fn);
  const attrPoints = (k: (typeof ATTRIBUTE_KEYS)[number]): PointControls | undefined => leveling ? {
    pending: pending.attr[k], canAdd: left.attr > 0,
    onAdd: () => setPending(p => (pointsLeft(member, p).attr > 0 ? { ...p, attr: { ...p.attr, [k]: p.attr[k] + 1 } } : p)),
  } : undefined;
  const skillPoints = (k: (typeof SKILL_KEYS)[number]): PointControls | undefined => leveling ? {
    pending: pending.skill[k], canAdd: left.skill > 0,
    onAdd: () => setPending(p => (pointsLeft(member, p).skill > 0 ? { ...p, skill: { ...p.skill, [k]: p.skill[k] + 1 } } : p)),
  } : undefined;
  const hint = ready ? 'All points spent. Confirm to apply.'
    : `Spend ${[left.attr > 0 && `${left.attr} attribute`, left.skill > 0 && `${left.skill} skill`].filter(Boolean).join(' and ')} point${left.attr + left.skill === 1 ? '' : 's'}`;

  return (
    <ModalWindow width={WIDTH} height={HEIGHT} labelledBy="party-who" closeLabel="Close party window" onClose={onClose} className="flex gap-4 px-6 py-5">
        {/* ── Party rail ── */}
        <nav aria-label="Party members" className="flex-none w-[188px] flex flex-col gap-2">
          {/* The heading block: "Party" and the party's XP toward the next level */}
          <div className="h-14 flex flex-col justify-center gap-2">
            <PanelTitle variant="heading">Party</PanelTitle>
            <div className="flex items-center gap-2.5 text-[10px] tracking-[0.1em]">
              <span className="flex-none uppercase text-rift-muted">LV {progress.level}</span>
              <XpBar progress={progress} className="flex-1" />
              <span className="flex-none text-rift-soft">{progress.xp} / {xpToNext(progress.level)}</span>
            </div>
          </div>
          {party.map((m, i) => {
            const sel = i === selectedIdx;
            const held = heldGear(m.gear);
            const memberLeveling = hasPointsToSpend(m);
            const memberLeft = pointsLeft(m, pendingAll[i]);
            return (
              <button key={i} type="button" aria-pressed={sel} onClick={() => setSelectedIdx(i)}
                className={`rf-row ${sel ? 'is-view' : ''} ${memberLeveling ? 'is-levelup' : ''} flex items-center gap-3 w-full min-h-16 box-border px-3 py-2 text-left text-inherit`}>
                <Portrait classKey={m.selectedClass} {...held} size={36} />
                <span className="flex-1 min-w-0">
                  <span className={`block text-[13px] truncate ${sel ? 'text-rift-bright' : 'text-rift-soft'}`}>{m.characterName}</span>
                  <span className="block mt-[3px] text-[11px] tracking-[0.08em] uppercase text-rift-label">{CLASSES[m.selectedClass].name}</span>
                  {memberLeveling && (
                    <span className="rf-levelup-label block mt-[3px]">{memberLeft.attr === 0 && memberLeft.skill === 0 ? 'Confirm' : 'Level up'}</span>
                  )}
                </span>
                {sel && <span aria-hidden="true" className="flex-none w-1.5 h-1.5 rotate-45" style={{ background: 'var(--glow)' }} />}
              </button>
            );
          })}
          <p className="mt-auto mb-0 text-[10px] leading-[1.7] tracking-[0.08em] uppercase text-rift-label">I &nbsp;toggle<br />Esc &nbsp;close</p>
        </nav>

        <div className="flex-1 min-w-0 flex flex-col">
          {/* ── Header ── */}
          <header className="flex-none flex items-center justify-between gap-4 min-h-14">
            <div className="min-w-0">
              <h2 id="party-who" className="m-0 font-display font-normal text-[26px] tracking-[0.06em] leading-[1.1] text-rift-bright">{characterName}</h2>
              <p className="mt-1.5 mb-0 text-xs tracking-[0.14em] uppercase text-rift-muted">{classData.name} · Level {stats.level}</p>
            </div>
            {leveling && (
              <div role="status" className="relative ml-auto flex items-center gap-4">
                <span className="relative text-right">
                  {/* A pale yellow wedge glowing behind the label and hint (tall on the right, tapering to a point
                      about 64px left of the text). Blurred on a wrapper: the clip on the inner shape keeps its form,
                      the blur on the outside softens its edges. */}
                  <span aria-hidden="true" className="absolute -left-16 right-0 -top-2.5 -bottom-2.5 pointer-events-none" style={{ filter: 'blur(14px)' }}>
                    <span className="absolute inset-0" style={{ background: 'color-mix(in srgb, var(--rift-levelup) 16%, transparent)', clipPath: 'polygon(0 50%, 100% 0, 100% 100%)' }} />
                  </span>
                  <span className="relative block font-display text-base tracking-[0.04em] text-rift-bright">Level up</span>
                  <span className="relative block mt-0.5 text-xs text-rift-soft">{hint}</span>
                </span>
                <button type="button" className={BANNER_BTN} disabled={!placed} onClick={() => onPendingChange(selectedIdx, noPendingPoints)}>Reset</button>
                <button type="button" className={BANNER_BTN} disabled={!ready} onClick={() => onConfirmPoints(selectedIdx)}>Confirm</button>
              </div>
            )}
            <WindowCloseButton onClose={onClose} />
          </header>

          <div className="flex-1 min-h-0 flex gap-4 mt-3">
            {/* ── Left: model, equipment, inventory ── */}
            <div className="flex-none w-[624px] flex flex-col gap-3">
              <div className="flex-1 min-h-0 flex gap-3">
                <div className="rf-panel relative flex-1 min-w-0 overflow-hidden"
                  style={{ backgroundImage: 'radial-gradient(ellipse 70% 55% at 50% 62%, color-mix(in srgb, var(--glow) 14%, transparent) 0%, transparent 100%)' }}>
                  <Suspense fallback={null}>
                    <ModelTurntable model={model} scale={1.3} />
                  </Suspense>
                </div>

                <section aria-label="Equipment" className="rf-panel flex-none flex flex-col px-3.5 pt-3.5 pb-3">
                  <PanelTitle variant="heading">Equipment</PanelTitle>
                  <div className="flex-1 grid content-between mt-3.5 gap-x-6 gap-y-1.5" style={{ gridTemplateColumns: 'repeat(3, 84px)', gridTemplateRows: 'repeat(5, 48px)' }}>
                    {GEAR_SLOTS.map(slot => (
                      <GearSlotBox key={slot} slot={slot} item={gear[slot]} stats={stats}
                        onUnequip={onUnequipItem && canUnequip(inventory, gear, slot) ? () => onUnequipItem(slot, selectedIdx) : null} drag={drag} />
                    ))}
                  </div>
                </section>
              </div>

              <section aria-label="Inventory" className="rf-panel flex-none p-3.5">
                {/* Three tabs, the shared inventory, the party's shards and the keyring; the panel keeps its
                    size between them */}
                <div className="flex items-baseline justify-between mb-2.5">
                  <div role="tablist" aria-label="Shared storage" className="flex items-baseline gap-[22px]">
                    <button type="button" role="tab" aria-selected={tab === 'items'} className={`rf-h rf-tab ${tab === 'items' ? 'is-on' : ''}`} onClick={() => setTab('items')}>
                      Inventory <span className="font-tech text-[10px] tracking-[0.1em] text-rift-label">Shared</span>
                    </button>
                    <span aria-hidden="true" className="rf-tabsep" />
                    <button type="button" role="tab" aria-selected={tab === 'shards'} className={`rf-h rf-tab ${tab === 'shards' ? 'is-on' : ''} ${hasNewShards ? 'is-new' : ''}`} onClick={showShards}>
                      Shards
                    </button>
                    <span aria-hidden="true" className="rf-tabsep" />
                    <button type="button" role="tab" aria-selected={tab === 'keys'} className={`rf-h rf-tab ${tab === 'keys' ? 'is-on' : ''} ${hasNewKey ? 'is-new' : ''}`} onClick={showKeys}>
                      Keys
                    </button>
                  </div>
                  {tab === 'keys'
                    ? <span className="text-xs text-rift-muted">{keys.length} {keys.length === 1 ? 'key' : 'keys'}</span>
                    : <GoldAmount amount={gold} label="Party gold" className="text-xs text-rift-soft" />}
                </div>
                {tab === 'shards' ? (
                  <ShardsTab counts={shards} category={shardCategory} onCategory={setShardCategory} showAll={shardsAll} onShowAll={setShardsAll} />
                ) : tab === 'items' ? (
                  <ItemGrid items={inventory} cols={INVENTORY_COLS} size={INVENTORY_SIZE} stats={stats}
                    canUse={(item) => isProficient(classData, item)}
                    action={(item) => (onEquipItem && canEquip(classData, item, inventory, gear) ? 'Equip' : null)}
                    onAction={(i) => onEquipItem?.(i, selectedIdx)} unusableNote=", not proficient"
                    compareWith={(item, other) => equipCompare(shown, item, stats, other)} drag={drag} />
                ) : <Keyring keys={keys} />}
              </section>
            </div>

            {/* ── Right: attributes, skills, stats ── */}
            <GearChange value={worn}>
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex-none flex gap-2 items-stretch">
                  <section aria-label="Attributes" className="rf-panel flex-1 min-w-0 p-3 flex flex-col">
                    <div className="flex items-baseline justify-between">
                      <PanelTitle variant="heading">Attributes</PanelTitle>
                      {leveling && <PointsLeft left={left.attr} />}
                    </div>
                    <div className="flex-1 min-h-0 grid grid-cols-1 auto-rows-fr gap-1 mt-2">
                      {ATTRIBUTE_KEYS.map(attr => (
                        <TipRow key={attr} label={ATTR_LABEL[attr]} tip={AttributeTooltips[attr]} caps points={attrPoints(attr)}
                          shift={shift(attr, s => s.attributes[attr])} />
                      ))}
                    </div>
                  </section>
                  <section aria-label="Skills" className="rf-panel flex-1 min-w-0 p-3">
                    <div className="flex items-baseline justify-between">
                      <PanelTitle variant="heading">Skills</PanelTitle>
                      {leveling && <PointsLeft left={left.skill} />}
                    </div>
                    <div className="grid grid-cols-1 gap-1 mt-2">
                      {SKILL_KEYS.map(skill => (
                        <TipRow key={skill} label={capitalize(skill)} tip={SkillTooltips[skill]} points={skillPoints(skill)}
                          shift={shift(skill, s => s.skills[skill])} />
                      ))}
                    </div>
                  </section>
                </div>

                <StatsPanel stats={stats} hp={hp} mp={mp} shift={shift} />
              </div>
            </GearChange>
          </div>
        </div>
    </ModalWindow>
  );
}

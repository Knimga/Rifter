// A grid of item slots (the party inventory, a chest's window, a vendor's wares): each item's icon in a cell, with
// its rarity glow; hover for its tooltip, right-click for its action (equip it, take it, trade it). Items the viewer
// can't use show a red tint, their tooltip marked "Not proficient". Empty slots fill out the grid. With `compareWith`,
// holding Ctrl over an item the member can equip shows its stat changes and what they wear beside it. With `trade` (the
// vendor window), each item's price and trade show in its tooltip, its cell takes the marks it calls for
// (`marks`), and a focused item is traded with Enter or Space too. With `leading` (a chest's gold), that cell takes
// the first slot and the items follow it.
import type { KeyboardEvent, MouseEvent, ReactNode } from 'react';
import { FaCoins } from 'react-icons/fa';
import type { Item } from '../data/gear';
import type { Stats } from '../data/units/stats';
import type { EquipCompare } from '../data/units/party';
import { ItemCompareTooltip, ItemTooltipContent, Tooltip, type ItemClickAction, type ItemTrade } from './Tooltip';
import ItemIcon, { rarityGlow } from './ItemIcon';
import { useKeyHeld } from '../hooks/useKeyHeld';

/** A trading cell's marks (index.css .rf-cell): can't be traded now, just traded this visit. */
export interface CellMarks {
  dim?: boolean;
  isNew?: boolean;
}

export default function ItemGrid({ items, cols, size, canUse, action, onAction, stats, unusableNote, compareWith, trade, marks, tooltipBelow, label, leading }: {
  /** The items by slot (a gap is an empty slot); slots past the list's end are empty too. */
  items: readonly (Item | null)[];
  cols: number;
  /** Slots in all. */
  size: number;
  /** Whether the viewer can use an item. */
  canUse: (item: Item) => boolean;
  /** What right-clicking the item at this slot does, if anything (shown in its tooltip). */
  action?: (item: Item, idx: number) => ItemClickAction | null;
  /** Right-click on an item that has an action, or (with `trade`) on any item: its trade, or why it fails. */
  onAction: (idx: number) => void;
  /** The viewer's stats, for the tooltip (e.g. a weapon's damage with them). */
  stats?: Stats;
  /** Screen-reader note on an item the viewer can't use, e.g. ', not proficient'. */
  unusableNote: string;
  /** Comparing `item` with what a member wears (equipCompare; null: they can't equip it), shown by holding Ctrl. */
  compareWith?: (item: Item) => EquipCompare | null;
  /** The item's side of a trade (the vendor window): its price and what right-clicking does. */
  trade?: (item: Item, idx: number) => ItemTrade;
  /** The marks a trading cell shows (with `trade`; they replace the plain red tint of `canUse`). */
  marks?: (item: Item, idx: number) => CellMarks;
  /** Whether this slot's tooltip opens below it (the top rows of a grid near the top of its window). */
  tooltipBelow?: (idx: number) => boolean;
  /** The grid's name, for screen readers. */
  label?: string;
  /** A cell before the items, in the first slot (a chest's gold, GoldCell): the items fill the slots after it. */
  leading?: ReactNode;
}) {
  const comparing = useKeyHeld('Control');
  return (
    <div role={trade ? 'grid' : undefined} aria-label={label} className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 46px)` }}>
      {leading}
      {Array.from({ length: leading ? size - 1 : size }).map((_, i) => {
        const item = items[i];
        if (!item) return <div key={i} className="rf-cell" />;
        const usable = canUse(item);
        const act = action?.(item, i) ?? null;
        const deal = trade?.(item, i);
        const mark = marks?.(item, i) ?? {};
        const glow = rarityGlow(item);
        const run = () => { if (act || deal) onAction(i); };
        const rightClick = (e: MouseEvent) => {
          e.preventDefault(); // never the browser's menu over an item
          run();
        };
        const key = (e: KeyboardEvent) => {
          if (deal && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); run(); }
        };
        const cls = `${usable ? '' : 'is-unusable'} ${mark.dim ? 'is-dim' : ''} ${mark.isNew ? 'is-new' : ''}`;
        const aria = deal
          ? `${item.name}, ${item.rarity}, ${deal.label} ${deal.price}${usable ? '' : unusableNote}${mark.isNew ? ', new' : ''}`
          : `${item.name}${usable ? '' : unusableNote}`;
        const tip = { item, stats, proficient: usable, clickAction: act ?? undefined, trade: deal };
        return (
          // Keyed by slot, not item: when an item leaves and the next one moves into this slot, the tooltip
          // under the cursor stays open and shows it (a new Tooltip would wait for the mouse to enter again)
          <Tooltip key={i} gap={10} bare={!!compareWith} placement={tooltipBelow?.(i) ? 'below' : 'above'}
            content={compareWith ? <ItemCompareTooltip {...tip} compareWith={compareWith} comparing={comparing} /> : <ItemTooltipContent {...tip} />}>
            <div className={`rf-cell is-filled ${glow.className} ${cls}`} style={glow.style} aria-label={aria}
              tabIndex={deal ? 0 : undefined} onContextMenu={rightClick} onKeyDown={key}>
              <ItemIcon item={item} className="w-[30px] h-[30px]" />
              {deal && mark.isNew && <FaCoins aria-hidden className="rf-cell-coin" />}
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

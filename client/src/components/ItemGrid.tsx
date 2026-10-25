// A grid of item slots (the party inventory, a chest's window): each item's icon in a cell, with its rarity
// glow; hover for its tooltip, right-click for its action (equip it, take it). Items the viewer can't use
// show a red tint, their tooltip marked "Not proficient". Empty slots fill out the grid. With `equippedFor`, holding
// Ctrl over an item shows the equipped item in its slot beside its tooltip, to compare.
import type { MouseEvent } from 'react';
import type { Item } from '../data/gear';
import type { Stats } from '../data/units/stats';
import { ItemCompareTooltip, ItemTooltipContent, Tooltip, type ItemClickAction } from './Tooltip';
import ItemIcon, { rarityGlow } from './ItemIcon';
import { useKeyHeld } from '../hooks/useKeyHeld';

export default function ItemGrid({ items, cols, size, canUse, action, onAction, stats, unusableNote, equippedFor }: {
  items: Item[];
  cols: number;
  /** Slots in all: items fill the first ones, the rest show empty. */
  size: number;
  /** Whether the viewer can use an item. */
  canUse: (item: Item) => boolean;
  /** What right-clicking the item at this slot does, if anything (shown in its tooltip). */
  action: (item: Item, idx: number) => ItemClickAction | null;
  /** Right-click on an item that has an action. */
  onAction: (idx: number) => void;
  /** The viewer's stats, for the tooltip (e.g. a weapon's damage with them). */
  stats?: Stats;
  /** Screen-reader note on an item the viewer can't use, e.g. ', not proficient'. */
  unusableNote: string;
  /** The item equipped in the same slot as `item` (the party window's member), to compare with by holding Ctrl. */
  equippedFor?: (item: Item) => Item | null;
}) {
  const comparing = useKeyHeld('Control');
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, 46px)` }}>
      {Array.from({ length: size }).map((_, i) => {
        const item = items[i];
        if (!item) return <div key={i} className="rf-cell" />;
        const usable = canUse(item);
        const act = action(item, i);
        const glow = rarityGlow(item);
        const rightClick = (e: MouseEvent) => {
          e.preventDefault(); // never the browser's menu over an item
          if (act) onAction(i);
        };
        return (
          // Keyed by slot, not item: when an item leaves and the next one moves into this slot, the tooltip
          // under the cursor stays open and shows it (a new Tooltip would wait for the mouse to enter again)
          <Tooltip key={i} gap={10} bare={!!equippedFor} content={equippedFor
            ? <ItemCompareTooltip item={item} stats={stats} proficient={usable} clickAction={act ?? undefined} equipped={equippedFor(item)} comparing={comparing} />
            : <ItemTooltipContent item={item} stats={stats} proficient={usable} clickAction={act ?? undefined} />}>
            <div className={`rf-cell is-filled ${glow.className} ${usable ? '' : 'is-unusable'}`} style={glow.style} aria-label={`${item.name}${usable ? '' : unusableNote}`} onContextMenu={rightClick}>
              <ItemIcon item={item} className="w-[30px] h-[30px]" />
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
}

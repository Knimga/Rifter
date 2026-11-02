// A container's window (a treasure chest): its name, an X, and a small grid of what it holds, like the party
// inventory: its gold first, in a slot of its own (GoldCell), then its affix shards in one (ShardsCell), then its
// items. Hover one for its tooltip; right-click it to take it (an item into the party inventory, gold into the party's
// gold, shards into the party's shards). A HUD pane: the rest of the screen stays as it is (not dimmed). GameScreen
// closes it on Escape, the X, or when the leader moves out of reach.
import type { Item } from '../data/gear';
import { CONTAINER_COLS, CONTAINER_SIZE } from '../data/gear/containers';
import { totalShards, type ShardCounts } from '../data/gear/shards';
import ItemGrid from './ItemGrid';
import GoldCell from './GoldCell';
import ShardsCell from './ShardsCell';
import { PanelTitle } from './ui/Panel';

export default function ContainerWindow({ name, items, gold, shards, usable, onLoot, onLootGold, onLootShards, onClose }: {
  /** The container's name, e.g. 'Worn Treasure Chest'. */
  name: string;
  items: Item[];
  /** Its gold (0: none, and no gold slot). */
  gold: number;
  /** Its affix shards (none: no shards slot). */
  shards: ShardCounts;
  /** Whether someone in the party can use an item (unusable items show faded, as in the inventory). */
  usable: (item: Item) => boolean;
  /** Take the item at this index. */
  onLoot: (idx: number) => void;
  /** Take its gold. */
  onLootGold: () => void;
  /** Take its shards. */
  onLootShards: () => void;
  onClose: () => void;
}) {
  const leading = [
    ...(gold > 0 ? [<GoldCell key="gold" amount={gold} onTake={onLootGold} />] : []),
    ...(totalShards(shards) > 0 ? [<ShardsCell key="shards" shards={shards} onTake={onLootShards} />] : []),
  ];
  return (
    <section role="dialog" aria-label={name} className="rf-hud p-3.5 font-tech text-rift-ink"
      style={{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.03), 0 12px 30px rgba(0, 0, 0, 0.5)' }}>
      <header className="flex items-center justify-between gap-4 mb-2.5">
        <PanelTitle variant="heading">{name}</PanelTitle>
        <button type="button" className="rf-icon-btn w-6 h-6 p-0" aria-label="Close" onClick={onClose}>
          <svg aria-hidden="true" width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
        </button>
      </header>
      <ItemGrid items={items} cols={CONTAINER_COLS} size={CONTAINER_SIZE} canUse={usable}
        action={() => 'Loot'} onAction={onLoot} unusableNote=", no one can use it" leading={leading} />
    </section>
  );
}

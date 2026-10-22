// A container's window (a treasure chest): its name, an X, and a small grid of its items, like the party
// inventory. Hover an item for its tooltip; right-click it to take it into the party inventory. A HUD pane:
// the rest of the screen stays as it is (not dimmed). GameScreen closes it on Escape, the X, or when the
// leader moves out of reach.
import type { Item } from '../data/gear';
import { CONTAINER_COLS, CONTAINER_SIZE } from '../data/containers';
import ItemGrid from './ItemGrid';
import { PanelTitle } from './ui/Panel';

export default function ContainerWindow({ name, items, usable, onLoot, onClose }: {
  /** The container's name, e.g. 'Basic Treasure Chest'. */
  name: string;
  items: Item[];
  /** Whether someone in the party can use an item (unusable items show faded, as in the inventory). */
  usable: (item: Item) => boolean;
  /** Take the item at this index. */
  onLoot: (idx: number) => void;
  onClose: () => void;
}) {
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
        action={() => 'Loot'} onAction={onLoot} unusableNote=", no one can use it" />
    </section>
  );
}

// Dragging an item (the party window's inventory and equipment): press on an item and move, and the whole item cell
// lifts off and follows the pointer, exactly as drawn (its icon, rarity glow, tint and outline: a copy of the cell),
// its own slot left empty. A slot it can be dropped on lights up under it (red where it can't), and letting go there
// drops it; anywhere else (or Escape) puts it back. Drop targets are marked in the DOM: data-drop-inv (an inventory
// slot's index) and data-drop-gear (a gear slot). A press without a move is still a click.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { GearSlot } from '../data/gear';
import { useLatest } from './useLatest';

/** Where an item is dragged from, or dropped: an inventory slot (by index), or a gear slot of the member shown. */
export type ItemSpot = { kind: 'inventory'; idx: number } | { kind: 'gear'; slot: GearSlot };

/** Whether two spots are the same one. */
export const sameSpot = (a: ItemSpot | null, b: ItemSpot) =>
  !!a && a.kind === b.kind && (a.kind === 'inventory' ? a.idx === (b as { idx: number }).idx : a.slot === (b as { slot: GearSlot }).slot);

/** How far (px) the pointer moves, pressed, before a press becomes a drag. */
const DRAG_THRESHOLD = 4;

/** The drop target under a point, and its element. The dragged copy ignores the pointer, so it never hides one. */
function targetAt(x: number, y: number): { el: HTMLElement; target: ItemSpot } | null {
  const el = document.elementFromPoint(x, y)?.closest<HTMLElement>('[data-drop-inv], [data-drop-gear]');
  if (!el) return null;
  if (el.dataset.dropInv !== undefined) return { el, target: { kind: 'inventory', idx: Number(el.dataset.dropInv) } };
  return { el, target: { kind: 'gear', slot: el.dataset.dropGear as GearSlot } };
}

export function useItemDrag({ canDrop, onDrop }: {
  /** Whether the item at `from` can be dropped on `to` (it lights up green, else red). */
  canDrop: (from: ItemSpot, to: ItemSpot) => boolean;
  /** Drop the item at `from` on `to` (only called when canDrop allows it). */
  onDrop: (from: ItemSpot, to: ItemSpot) => void;
}) {
  // Where the item being dragged comes from (its slot shows empty)
  const [dragging, setDragging] = useState<ItemSpot | null>(null);
  const latest = useLatest({ canDrop, onDrop });
  // Ends a press or drag under way without dropping (the window closing mid-drag)
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);

  /** A press on the item at `from` (its cell): it becomes a drag once the pointer moves. */
  const start = (from: ItemSpot, e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0) return;
    const cell = e.currentTarget, sx = e.clientX, sy = e.clientY;
    const rect = cell.getBoundingClientRect();
    // The window may be drawn scaled (useFitScale): the copy is drawn at the cell's size on screen
    const scale = rect.width / cell.offsetWidth, ox = sx - rect.left, oy = sy - rect.top;
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;

    const mark = (el: HTMLElement | null, ok: boolean) => {
      over?.classList.remove('is-drop-ok', 'is-drop-bad');
      over = el;
      el?.classList.add(ok ? 'is-drop-ok' : 'is-drop-bad');
    };
    const move = (ev: PointerEvent) => {
      if (!ghost) {
        if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < DRAG_THRESHOLD) return;
        ghost = cell.cloneNode(true) as HTMLElement;
        ghost.classList.add('rf-drag-ghost');
        Object.assign(ghost.style, { width: `${cell.offsetWidth}px`, height: `${cell.offsetHeight}px` });
        document.body.appendChild(ghost);
        document.body.classList.add('rf-dragging');
        setDragging(from);
      }
      ghost.style.transform = `translate(${ev.clientX - ox}px, ${ev.clientY - oy}px) scale(${scale})`;
      const t = targetAt(ev.clientX, ev.clientY);
      mark(t?.el ?? null, !!t && latest.current.canDrop(from, t.target));
    };
    const finish = (drop: PointerEvent | null) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', stop);
      window.removeEventListener('keydown', key, true);
      cancel.current = null;
      mark(null, false);
      if (!ghost) return;
      ghost.remove();
      document.body.classList.remove('rf-dragging');
      setDragging(null);
      const t = drop && targetAt(drop.clientX, drop.clientY);
      if (t && latest.current.canDrop(from, t.target)) latest.current.onDrop(from, t.target);
    };
    const up = (ev: PointerEvent) => finish(ev);
    const stop = () => finish(null);
    // Escape puts a dragged item back (and doesn't close the window)
    const key = (ev: KeyboardEvent) => {
      if (ev.key !== 'Escape' || !ghost) return;
      ev.stopImmediatePropagation();
      finish(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', stop);
    window.addEventListener('keydown', key, true);
    cancel.current = stop;
  };

  return { dragging, start };
}

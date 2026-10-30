// Trading with a vendor (an NPC with the 'vendor' service: data/world/npcs.ts). The vendor has two shelves of fixed
// slots, like the party inventory: his wares, sold at BUY_MARKUP times an item's sell value (Item.value), and the
// buy-back shelf, where the items the party sold him go, sold back at what he paid. An item taken leaves a hole, one
// put on a shelf takes its first empty slot. Every trade of a visit can be undone, the item going back to its slot
// (or the first empty one) and the gold back exactly; a visit's trades are forgotten when it ends, and his shelves
// close their holes (endVisit).
import type { Item } from './types';
import { generateLootItem } from '.';
import { firstEmptySlot, isFull, setSlot, type Inventory } from './inventory';
import { randInt } from '../random';
import { formatGold } from '../detailStrings';

export const VENDOR_COLS = 12;
export const VENDOR_ROWS = 5;
export const VENDOR_SIZE = VENDOR_COLS * VENDOR_ROWS;

/** A vendor's prices: this many times what an item sells for. */
export const BUY_MARKUP = 4;

/** What a vendor charges for an item. */
export const buyPrice = (item: Item): number => item.value * BUY_MARKUP;

/** How many items a vendor's fresh stock holds: [fewest, most]. */
const STOCK_COUNT: [number, number] = [16, 24];

/** A vendor's wares: random items of the party's level (any weapon, armor, offhand or jewelry), favouring what it can use. */
export function vendorStock(partyLevel: number, usable?: (item: Item) => boolean): (Item | null)[] {
  const n = randInt(...STOCK_COUNT);
  return Array.from({ length: VENDOR_SIZE }, (_, i) => (i < n ? generateLootItem(partyLevel, { usable, partyLevel }) : null));
}

/** An empty buy-back shelf. */
export const emptyBuyback = (): (Item | null)[] => Array.from({ length: VENDOR_SIZE }, () => null);

/** A shelf with its holes closed: its items in order from the first slot, the empty slots after them. */
export const closeGaps = (slots: readonly (Item | null)[]): (Item | null)[] => {
  const items = slots.filter((it): it is Item => !!it);
  return Array.from({ length: slots.length }, (_, i) => items[i] ?? null);
};

/** A vendor's shelf: his wares, or the items the party sold him. */
export type Shelf = 'stock' | 'buyback';

/**
 * A trade made this visit, by the traded item's id: what it was, the slot it came from, the gold it moved, and
 * (bought) the shelf it came off.
 */
export interface TradeRecord {
  kind: 'bought' | 'sold';
  origin: number;
  amount: number;
  shelf?: Shelf;
}

/** Everything a trade changes: the party's inventory and gold, the vendor's shelves, and this visit's trades. */
export interface TradeState {
  inventory: Inventory;
  stock: (Item | null)[];
  buyback: (Item | null)[];
  gold: number;
  trades: Readonly<Record<string, TradeRecord>>;
}

/** A trade's result: the new state and what to tell the player, or (it fails) only why. */
export type TradeResult = { ok: true; state: TradeState; message: string } | { ok: false; message: string };

/** The slot an item goes back to on an undo: its own, unless something has taken it. */
const backTo = (slots: readonly (Item | null)[], origin: number) => (slots[origin] ? firstEmptySlot(slots) : origin);

const withoutTrade = (trades: TradeState['trades'], id: string) => Object.fromEntries(Object.entries(trades).filter(([k]) => k !== id));

/** What buying an item off a shelf costs: his price for his wares, what he paid for the party's. */
const shelfPrice = (shelf: Shelf, item: Item) => (shelf === 'stock' ? buyPrice(item) : item.value);

/** Right-clicking the item in slot `idx` of a vendor's shelf: buy it, or (sold this visit) undo the sale. */
export function tradeShelfItem(s: TradeState, shelf: Shelf, idx: number): TradeResult {
  const slots = s[shelf];
  const item = slots[idx];
  if (!item) return { ok: false, message: '' };
  const record = s.trades[item.id];
  if (record?.kind === 'sold') {
    if (s.gold < record.amount) return { ok: false, message: `Not enough gold to undo the sale of ${item.name}.` };
    const to = backTo(s.inventory, record.origin);
    if (to < 0) return { ok: false, message: 'Inventory full.' };
    return {
      ok: true,
      state: { ...s, inventory: setSlot(s.inventory, to, item), [shelf]: setSlot(slots, idx, null), gold: s.gold - record.amount, trades: withoutTrade(s.trades, item.id) },
      message: `Undid sale of ${item.name}. −${formatGold(record.amount)} gold.`,
    };
  }
  const price = shelfPrice(shelf, item);
  const to = firstEmptySlot(s.inventory);
  if (to < 0) return { ok: false, message: 'Inventory full.' };
  if (s.gold < price) return { ok: false, message: `Not enough gold for ${item.name}.` };
  return {
    ok: true,
    state: {
      ...s, inventory: setSlot(s.inventory, to, item), [shelf]: setSlot(slots, idx, null), gold: s.gold - price,
      trades: { ...s.trades, [item.id]: { kind: 'bought', origin: idx, amount: price, shelf } },
    },
    message: `${shelf === 'stock' ? 'Bought' : 'Bought back'} ${item.name} for ${formatGold(price)}.`,
  };
}

/**
 * Right-clicking the party's item in slot `idx`: sell it (onto the buy-back shelf), or (bought this visit) undo the
 * purchase (back onto the shelf it came off). A full buy-back shelf lets its first item go to make room.
 */
export function tradePartyItem(s: TradeState, idx: number): TradeResult {
  const item = s.inventory[idx];
  if (!item) return { ok: false, message: '' };
  const record = s.trades[item.id];
  if (record?.kind === 'bought') {
    const shelf = record.shelf ?? 'stock';
    const to = backTo(s[shelf], record.origin);
    if (to < 0) return { ok: false, message: 'Vendor has no room.' };
    return {
      ok: true,
      state: { ...s, inventory: setSlot(s.inventory, idx, null), [shelf]: setSlot(s[shelf], to, item), gold: s.gold + record.amount, trades: withoutTrade(s.trades, item.id) },
      message: `Undid purchase of ${item.name}. +${formatGold(record.amount)} gold.`,
    };
  }
  const shelf = isFull(s.buyback) ? [...s.buyback.slice(1), null] : s.buyback;
  const to = firstEmptySlot(shelf);
  return {
    ok: true,
    state: {
      ...s, inventory: setSlot(s.inventory, idx, null), buyback: setSlot(shelf, to, item), gold: s.gold + item.value,
      trades: { ...s.trades, [item.id]: { kind: 'sold', origin: idx, amount: item.value } },
    },
    message: `Sold ${item.name} for ${formatGold(item.value)}.`,
  };
}

/** An item's side of a trade now, for its tooltip and cell: its price, and what right-clicking does or why it can't. */
export interface TradeLine {
  label: 'Price' | 'Sells for' | 'Sold for' | 'Bought for';
  price: number;
  /** The party can't pay it. */
  short: boolean;
  action?: 'Buy' | 'Buy back' | 'Sell' | 'Undo sale' | 'Undo purchase';
  reason?: string;
  undo: boolean;
}

/** The trade line of an item on a vendor's shelf. */
export function shelfItemLine(s: TradeState, shelf: Shelf, item: Item): TradeLine {
  const record = s.trades[item.id];
  if (record?.kind === 'sold') {
    const short = s.gold < record.amount;
    const reason = short ? 'Not enough gold to undo' : isFull(s.inventory) ? 'Inventory full' : undefined;
    return { label: 'Sold for', price: record.amount, short, undo: true, ...(reason ? { reason } : { action: 'Undo sale' }) };
  }
  const price = shelfPrice(shelf, item);
  const short = s.gold < price;
  const reason = isFull(s.inventory) ? 'Inventory full' : short ? 'Not enough gold' : undefined;
  return { label: 'Price', price, short, undo: false, ...(reason ? { reason } : { action: shelf === 'stock' ? 'Buy' : 'Buy back' }) };
}

/** The trade line of the party's item. */
export function partyItemLine(s: TradeState, item: Item): TradeLine {
  const record = s.trades[item.id];
  if (record?.kind === 'bought') {
    const room = !isFull(s[record.shelf ?? 'stock']);
    return { label: 'Bought for', price: record.amount, short: false, undo: true, ...(room ? { action: 'Undo purchase' } : { reason: 'Vendor has no room' }) };
  }
  return { label: 'Sells for', price: item.value, short: false, undo: false, action: 'Sell' };
}

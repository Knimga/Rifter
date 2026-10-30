// The Sanctum vendor's trade: his wares (fresh each time the party defeats a boss: restock), the items the party sold
// him (bought back at what he paid, until he restocks), and the trades of the current visit (each can be undone while
// it lasts; forgotten when it ends, and his shelves close their holes: endVisit). A trade writes the party's
// inventory and gold (useInventory) and his shelves together.
import { useCallback, useState, type Dispatch, type SetStateAction } from 'react';
import type { Item } from '../data/gear';
import type { Inventory } from '../data/gear/inventory';
import { closeGaps, emptyBuyback, tradePartyItem, tradeShelfItem, vendorStock, type Shelf, type TradeResult, type TradeState } from '../data/gear/vendor';

export function useVendor({ partyLevel, partyCanUse, inventory, setInventory, gold, setGold }: {
  partyLevel: number;
  /** Whether someone in the party can use an item: his wares favour those. */
  partyCanUse: (item: Item) => boolean;
  inventory: Inventory;
  setInventory: Dispatch<SetStateAction<Inventory>>;
  gold: number;
  setGold: Dispatch<SetStateAction<number>>;
}) {
  const [stock, setStock] = useState<(Item | null)[]>(() => vendorStock(partyLevel, partyCanUse));
  const [buyback, setBuyback] = useState<(Item | null)[]>(emptyBuyback);
  const [trades, setTrades] = useState<TradeState['trades']>({});
  const state: TradeState = { inventory, stock, buyback, gold, trades };

  const apply = (result: TradeResult): TradeResult => {
    if (result.ok) {
      setInventory(result.state.inventory);
      setStock(result.state.stock);
      setBuyback(result.state.buyback);
      setGold(result.state.gold);
      setTrades(result.state.trades);
    }
    return result;
  };

  /** Right-click on an item on one of his shelves (buy it, or undo its sale); the result says what happened. */
  const tradeShelf = (shelf: Shelf, idx: number) => apply(tradeShelfItem(state, shelf, idx));
  /** Right-click on one of the party's items (sell it, or undo its purchase). */
  const tradeParty = (idx: number) => apply(tradePartyItem(state, idx));

  /** The visit is over: its trades can no longer be undone, their markers clear, and his shelves close their holes. */
  const endVisit = useCallback(() => {
    setTrades({});
    setStock(closeGaps);
    setBuyback(closeGaps);
  }, []);

  /** Fresh wares for a party of `level` (a boss has fallen); what the party sold him is gone. */
  const restock = useCallback((level: number) => {
    setStock(vendorStock(level, partyCanUse));
    setBuyback(emptyBuyback());
  }, [partyCanUse]);

  return { state, tradeShelf, tradeParty, endVisit, restock };
}

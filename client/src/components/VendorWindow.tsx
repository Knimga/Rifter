// A vendor's window (an NPC with the 'vendor' service, data/world/npcs.ts), opened by speaking to them: their shelves
// above (two tabs: their wares, and Buy Back, what the party sold them), the party's inventory and gold below.
// Right-click (or Enter / Space on a focused item) to buy an item off their shelf or sell one of the party's items; an item traded this visit is marked new, and right-clicking it again undoes
// the trade (data/gear/vendor.ts). Picking a party member in the header tints red what they can't use, in both
// grids, and holding Ctrl over an item they can use shows how it changes their stats and what they wear in its slot. Every trade pulses the party's gold (red when one fails), and the line at the bottom says what happened.
// The game around it isn't dimmed (the vendor turns to face the leader while it is open).
import { Fragment, useState } from 'react';
import { PiMouseRightClickFill } from 'react-icons/pi';
import ModalWindow, { WindowCloseButton } from './ui/ModalWindow';
import GoldAmount from './ui/GoldAmount';
import ItemGrid from './ItemGrid';
import Portrait from './hud/Portrait';
import { heldGear } from './characterModel';
import type { NpcData } from '../data/world/npcs';
import { equipCompare, type PartyMemberConfig } from '../data/units/party';
import type { Item } from '../data/gear';
import type { Stats } from '../data/units/stats';
import { CLASSES } from '../data/units/classes';
import { INVENTORY_COLS, INVENTORY_SIZE, isProficient } from '../data/gear/inventory';
import { VENDOR_COLS, VENDOR_SIZE, partyItemLine, shelfItemLine, type Shelf, type TradeLine, type TradeResult, type TradeState } from '../data/gear/vendor';
import { formatGold } from '../data/detailStrings';

/** The window's design size (px). */
const WIDTH = 672, HEIGHT = 744;

/** The wares' top rows open their tooltips downward (above them is the window's header). */
const TOOLTIP_BELOW_ROWS = 2;

/** The vendor panel's tabs. */
const SHELVES: { shelf: Shelf; name: string }[] = [{ shelf: 'stock', name: 'Wares' }, { shelf: 'buyback', name: 'Buy Back' }];

/** A panel heading's hint: the mouse with its right button filled, and what right-clicking does. */
function RightClickHint({ text, label }: { text: string; label: string }) {
  return (
    <span aria-label={label} className="ml-2.5 inline-flex items-center gap-1.5 font-tech text-[10px] tracking-[0.1em] uppercase text-rift-off">
      <PiMouseRightClickFill aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
      {text}
    </span>
  );
}

export default function VendorWindow({ vendor, party, partyStats, state, onTradeShelf, onTradeParty, onClose }: {
  vendor: NpcData;
  party: PartyMemberConfig[];
  /** Each member's stats, for the tooltips while they are picked (e.g. a weapon's damage with them). */
  partyStats: Stats[];
  /** The trade as it stands: the party's inventory and gold, the wares, this visit's trades. */
  state: TradeState;
  /** Right-click on an item on one of the vendor's shelves / on a party item: the result (its message, and whether it went through). */
  onTradeShelf: (shelf: Shelf, idx: number) => TradeResult;
  onTradeParty: (idx: number) => TradeResult;
  onClose: () => void;
}) {
  // The member whose proficiencies tint the grids (none when the window opens)
  const [member, setMember] = useState<number | null>(null);
  // The vendor's shelf shown: his wares (when the window opens) or the items the party sold him
  const [shelf, setShelf] = useState<Shelf>('stock');
  const [message, setMessage] = useState<{ text: string; bad: boolean }>({ text: 'Right-click an item to buy or sell it.', bad: false });
  // The gold readout's pulse: a count, so each trade restarts it (two copies of each animation, alternating)
  const [pulse, setPulse] = useState<{ bad: boolean; n: number }>({ bad: false, n: 0 });

  const trade = (result: TradeResult) => {
    if (!result.message) return;
    setMessage({ text: result.message, bad: !result.ok });
    setPulse((p) => ({ bad: !result.ok, n: p.n + 1 }));
  };
  const chosen = member !== null ? party[member] : null;
  const unusable = (item: Item) => !!chosen && !isProficient(CLASSES[chosen.selectedClass], item);
  const goldCls = pulse.n === 0 ? '' : `${pulse.bad ? 'bad' : 'fx'}-${pulse.n % 2 ? 'a' : 'b'}`;
  const marks = (line: (item: Item) => TradeLine, dims: boolean) => (item: Item) => {
    const l = line(item);
    return { dim: dims && !l.action, isNew: !!state.trades[item.id] };
  };
  const shelfLine = (item: Item) => shelfItemLine(state, shelf, item);
  const ownLine = (item: Item) => partyItemLine(state, item);
  const note = chosen ? `, not proficient for ${chosen.characterName}` : '';
  // With a member picked: their stats in the tooltips, and Ctrl compares an item they can use with what they wear
  // in its slot
  const memberTips = chosen && member !== null
    ? { stats: partyStats[member], compareWith: (item: Item) => equipCompare(chosen, item) }
    : {};

  return (
    <ModalWindow width={WIDTH} height={HEIGHT} labelledBy="vendor-title" closeLabel={`Stop talking to ${vendor.name}`} onClose={onClose} dim={false}
      className="flex flex-col pt-5 px-6 pb-[22px]">
      <header className="flex-none flex items-center justify-between gap-4 min-h-[52px]">
        <div className="min-w-0">
          <h2 id="vendor-title" className="m-0 font-display font-normal text-[26px] tracking-[0.06em] leading-[1.1] text-rift-bright">{vendor.name}</h2>
          <p className="mt-1.5 mb-0 text-xs tracking-[0.14em] uppercase text-rift-muted">{vendor.title}</p>
        </div>
        {/* Who to check items against: click one to tint what they can't use, again to clear it */}
        <div role="radiogroup" aria-label="Compare items for" className="flex-none ml-auto mr-4 flex gap-1.5">
          {party.map((m, i) => (
            <button key={i} type="button" role="radio" aria-checked={member === i} className={`rf-mem ${member === i ? 'is-sel' : ''}`}
              onClick={() => setMember(member === i ? null : i)}>
              <Portrait classKey={m.selectedClass} {...heldGear(m.gear)} size={30} />
              <span className={`block text-xs whitespace-nowrap ${member === i ? 'text-rift-bright' : 'text-rift-soft'}`}>{m.characterName}</span>
            </button>
          ))}
        </div>
        <WindowCloseButton onClose={onClose} />
      </header>

      {/* The vendor's shelves: two tabs, his wares and what the party sold him; the panel keeps its size between them */}
      <section aria-label="Vendor inventory" className="rf-panel flex-none mt-3 p-3.5">
        <div className="flex items-baseline mb-2.5">
          <div role="tablist" aria-label="Vendor's shelves" className="flex items-baseline gap-[22px]">
            {SHELVES.map(({ shelf: s, name }, i) => (
              <Fragment key={s}>
                {i > 0 && <span aria-hidden="true" className="rf-tabsep" />}
                <button type="button" role="tab" aria-selected={shelf === s} className={`rf-h rf-tab ${shelf === s ? 'is-on' : ''}`} onClick={() => setShelf(s)}>
                  {name}
                </button>
              </Fragment>
            ))}
          </div>
          {shelf === 'stock'
              ? <RightClickHint text="Buy" label="Right-click to buy" />
            : <RightClickHint text="Buy back" label="Right-click to buy back" />}
        </div>
        <ItemGrid label={shelf === 'stock' ? 'Vendor inventory' : 'Buy back'} items={state[shelf]} cols={VENDOR_COLS} size={VENDOR_SIZE}
          canUse={(item) => !unusable(item)} unusableNote={note} {...memberTips}
          trade={shelfLine} marks={marks(shelfLine, true)}
          tooltipBelow={(idx) => idx < VENDOR_COLS * TOOLTIP_BELOW_ROWS}
          onAction={(idx) => trade(onTradeShelf(shelf, idx))} />
      </section>

      {/* The party's inventory and gold */}
      <section aria-label="Party inventory" className="rf-panel flex-none mt-3 p-3.5">
        <div className="flex items-baseline justify-between mb-2.5">
          <h3 className="rf-h">Inventory <RightClickHint text="Sell" label="Right-click to sell" /></h3>
          <span role="status" aria-label={`Party gold: ${formatGold(state.gold)}`} className={`rf-gold ${goldCls}`}>
            <GoldAmount amount={state.gold} label="Party gold" iconClassName="w-4 h-4" style={{ gap: 7 }} />
          </span>
        </div>
        <ItemGrid label="Party inventory" items={state.inventory} cols={INVENTORY_COLS} size={INVENTORY_SIZE}
          canUse={(item) => !unusable(item)} unusableNote={note} {...memberTips}
          trade={ownLine} marks={marks(ownLine, false)}
          onAction={(idx) => trade(onTradeParty(idx))} />
      </section>

      {/* What the last trade did */}
      <div role="status" aria-live="polite" className={`flex-none mt-2 h-[18px] text-xs leading-[18px] whitespace-nowrap overflow-hidden text-ellipsis ${message.bad ? 'text-rift-down' : 'text-rift-muted'}`}>
        {message.text}
      </div>
    </ModalWindow>
  );
}

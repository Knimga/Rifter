// The pieces trading windows share (the vendor's, the enchanter's): the party's gold readout, which pulses on every
// trade (red when one fails for want of gold), and the status line at the bottom saying what the last action did.
import { useState } from 'react';
import GoldAmount from './GoldAmount';
import { formatGold } from '../../data/detailStrings';

/**
 * The gold readout's pulse: `pulse(bad)` plays it (red if `bad`), `cls` is its class for the readout. A count, so each
 * pulse restarts it (two copies of each animation, alternating: index.css .rf-gold).
 */
export function useGoldPulse() {
  const [state, setState] = useState<{ bad: boolean; n: number }>({ bad: false, n: 0 });
  const cls = state.n === 0 ? '' : `${state.bad ? 'bad' : 'fx'}-${state.n % 2 ? 'a' : 'b'}`;
  const pulse = (bad = false) => setState((p) => ({ bad, n: p.n + 1 }));
  return { cls, pulse };
}

/** The party's gold, pulsing with `cls` (useGoldPulse). */
export function PartyGold({ gold, cls }: { gold: number; cls: string }) {
  return (
    <span role="status" aria-label={`Party gold: ${formatGold(gold)}`} className={`rf-gold ${cls}`}>
      <GoldAmount amount={gold} label="Party gold" iconClassName="w-4 h-4" style={{ gap: 7 }} />
    </span>
  );
}

/** The window's last word: what the last action did, or (`bad`, in red) why it couldn't. */
export function StatusLine({ text, bad }: { text: string; bad: boolean }) {
  return (
    <div role="status" aria-live="polite" className={`flex-none mt-2 h-[18px] text-xs leading-[18px] whitespace-nowrap overflow-hidden text-ellipsis ${bad ? 'text-rift-down' : 'text-rift-muted'}`}>
      {text}
    </div>
  );
}

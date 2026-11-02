// A panel heading's hint (the vendor's and the enchanter's windows): the mouse with its right button filled, and what
// right-clicking does there ('Sell', 'Bench').
import { PiMouseRightClickFill } from 'react-icons/pi';

/** `text` shows beside the mouse; `label` says it all for screen readers ('Right-click to sell'). */
export default function RightClickHint({ text, label }: { text: string; label: string }) {
  return (
    <span aria-label={label} className="ml-2.5 inline-flex items-center gap-1.5 font-tech text-[10px] tracking-[0.1em] uppercase text-rift-off">
      <PiMouseRightClickFill aria-hidden="true" className="w-3.5 h-3.5 shrink-0" />
      <span aria-hidden="true">{text}</span>
    </span>
  );
}

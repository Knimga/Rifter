// A new player's hint (data/world/hints.ts) on the HUD: a small pane under what it points at (the Party button), its
// pointer toward it, its words and a way to dismiss it. It never blocks play: the map goes on under it.
import type { HintData } from '../../data/world/hints';

export default function HintPane({ hint, onDismiss }: { hint: HintData; onDismiss: () => void }) {
  return (
    <div role="status" className="rf-hud rf-hint relative w-[260px] box-border px-3.5 py-3 text-xs leading-[1.55] text-rift-soft">
      <span aria-hidden="true" className="rf-hint-pointer" />
      {hint.text}{hint.strong && <> <strong className="font-normal text-rift-bright">{hint.strong}</strong></>}
      <div className="mt-2 flex justify-end">
        <button type="button" onClick={onDismiss} className="rf-link text-[11px] tracking-[0.1em] uppercase text-rift-muted">Got it</button>
      </div>
    </div>
  );
}

// The party's XP. One pool for the whole party, so it shows once:
// a slim 3px bar (XpBar) in the party window's rail, and the strip under the game screen's top buttons
// (XpStrip) with its level, a hover tooltip, and a fading "+N XP" after each award.
import { xpToNext, type PartyProgress } from '../../data/units/xp';
import { TextTip, Tooltip } from '../Tooltip';

/** The bar alone: the share of the way to the next level, sliding to its new width when XP is gained. */
export function XpBar({ progress, className = '' }: { progress: PartyProgress; className?: string }) {
  const share = Math.min(1, progress.xp / xpToNext(progress.level));
  return (
    <span className={`rf-xpbar block ${className}`} role="progressbar" aria-label="Party XP"
      aria-valuemin={0} aria-valuemax={xpToNext(progress.level)} aria-valuenow={progress.xp}>
      {/* Keyed by level: a new level starts its bar fresh instead of sliding back from full */}
      <span key={progress.level} style={{ width: `${share * 100}%` }} />
    </span>
  );
}

/** An XP award to announce: how much, and a sequence number that changes with each (re)announcement. */
export interface XpGain {
  amount: number;
  seq: number;
}

/**
 * The game screen's XP strip: `LV n` and the bar, with "Party XP current / next" on hover or focus, and the
 * latest award ("+N XP") to its left, fading out over 6 s (restarted by each award: its key changes).
 */
export function XpStrip({ progress, gain }: { progress: PartyProgress; gain: XpGain | null }) {
  return (
    <div className="relative flex items-center gap-2.5 w-[203px]">
      {/* The latest award, left of the strip, in a polite live region for screen readers */}
      <span aria-live="polite" className="absolute right-full mr-3 whitespace-nowrap text-[11px] tracking-[0.1em] uppercase text-[var(--rift-levelup)]">
        {gain && <span key={gain.seq} className="rf-xpgain">+{gain.amount} XP</span>}
      </span>
      <Tooltip placement="below-end" gap={8} className="flex flex-1 items-center gap-2.5 min-w-0"
        content={<TextTip>Party XP {progress.xp} / {xpToNext(progress.level)}</TextTip>}>
        <span tabIndex={0} className="flex flex-1 items-center gap-2.5 min-w-0 outline-none">
          <span className="flex-none text-[10px] tracking-[0.12em] uppercase text-rift-muted">LV {progress.level}</span>
          <XpBar progress={progress} className="flex-1" />
        </span>
      </Tooltip>
    </div>
  );
}

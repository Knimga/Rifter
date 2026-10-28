// The action bar's AP tracker: label, one pip per action point, `available / total`, and
// a chip for AP lost to debuffs. Pips light from the left, so spending dims them from the right. Order: the
// usable base pips, then lost pips (a stun: black, counted in neither number), then extra pips (a haste:
// white). An armed ability's cost pulses on the pips it would spend. Hover or focus for the breakdown.
import { Tooltip } from '../Tooltip';
import { formatSigned } from '../../data/detailStrings';
import type { ActiveBuff } from '../../data/units/stats';

export interface ApState {
  /** AP left this turn. */
  available: number;
  /** This turn's AP: apMax with its buffs and debuffs. */
  total: number;
  /** apMax without them. */
  base: number;
  /** The buffs and debuffs on it, by source (e.g. Haste +1, Shield Bash −1). */
  mods: { source: string; amount: number }[];
}

/** A unit's ApState: `apMax` (its stat, buffs included), split into its base and the flat buffs and debuffs on it. */
export function apState(apMax: number, buffs: ActiveBuff[], available: number): ApState {
  const bySource = new Map<string, number>();
  for (const b of buffs) if (b.stat === 'apMax' && b.amount) bySource.set(b.source ?? 'Effect', (bySource.get(b.source ?? 'Effect') ?? 0) + b.amount);
  const mods = [...bySource].map(([source, amount]) => ({ source, amount }));
  return { available, total: apMax, base: apMax - mods.reduce((sum, m) => sum + m.amount, 0), mods };
}

export default function ApTracker({ ap, previewCost = 0, movement }: {
  ap: ApState;
  /** The armed ability's AP cost, previewed on the pips (0: nothing armed). */
  previewCost?: number;
  /** Tiles 1 AP moves (the tooltip's note). */
  movement: number;
}) {
  const { available, total, base, mods } = ap;
  const lost = Math.max(0, base - total);
  const extra = Math.max(0, total - base);
  // The usable pips (base then extra) light from the left; the cost preview takes the last lit ones
  const usable = (i: number) => {
    const lit = i < available;
    const preview = lit && i >= available - previewCost;
    return preview ? 'is-preview' : lit ? 'is-lit' : '';
  };
  const baseUsable = base - lost;
  const breakdown = [`Base ${base}`, ...mods.map((m) => `${m.source} ${formatSigned(m.amount)}`)].join(' · ');

  return (
    <Tooltip gap={10} placement="above" content={
      <div className="w-[232px] box-border px-3.5 py-3 text-xs">
        <div className="font-display text-[15px] tracking-[0.04em] text-rift-bright">Action points</div>
        <div className="mt-1 text-[11px] tracking-[0.12em] uppercase text-rift-label">{available} of {total} left this turn</div>
        <div className="mt-2.5 text-rift-ink">{breakdown}</div>
        <div className="mt-2.5 leading-[1.55] text-rift-muted">1 AP moves up to {movement} tiles. Abilities cost 1 to 3 AP.</div>
      </div>
    }>
      <div className="rf-ap" tabIndex={0} role="img"
        aria-label={`Action points: ${available} of ${total} left${lost ? `, ${lost} lost` : ''}${extra ? `, ${extra} extra` : ''}`}>
        <span className="rf-ap-label">AP</span>
        <span className="rf-ap-pips">
          {Array.from({ length: baseUsable }, (_, i) => <span key={`b${i}`} className={`rf-ap-pip ${usable(i)}`} />)}
          {Array.from({ length: lost }, (_, i) => <span key={`l${i}`} className="rf-ap-pip is-lost" />)}
          {Array.from({ length: extra }, (_, i) => <span key={`e${i}`} className={`rf-ap-pip is-extra ${usable(baseUsable + i)}`} />)}
        </span>
        <span className="rf-ap-count">{available} <span>/ {total}</span></span>
        {lost > 0 && <span className="rf-ap-chip">{formatSigned(-lost)}</span>}
      </div>
    </Tooltip>
  );
}

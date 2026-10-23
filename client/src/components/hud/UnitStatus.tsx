// Status shown above a unit on the map (UI handoff, game screen): a row of effect markers (buffs and
// debuffs, each with a tooltip) over a thin HP bar, and an MP bar for party members.
import type { ActiveBuff, ActiveDot, ActiveHot, DamageElement } from '../../data/units/stats';
import { capitalize, formatModifier } from '../../data/detailStrings';
import { DAMAGE_ELEMENT_COLOR } from '../../data/constants';
import { Tooltip } from '../Tooltip';

/** One effect on a unit, as its marker shows it. */
export interface StatusMarker {
  name: string;
  /** Helps (buff, heal over time) or hurts (debuff, damage over time). */
  buff: boolean;
  rounds: number;
  /** What it does, e.g. '+3 Block' or '5 poison damage each round'. */
  effect: string;
  /** The effect's element (its ability's), if it has one: its marker's outline takes the element's color. */
  element?: DamageElement;
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** A unit's effects: one marker per buff source (its stats together), and one per HoT and DoT. */
export function statusMarkers(buffs: ActiveBuff[], hots: ActiveHot[], dots: ActiveDot[]): StatusMarker[] {
  const bySource = new Map<string, ActiveBuff[]>();
  for (const b of buffs) {
    if (!Number.isFinite(b.roundsRemaining)) continue; // permanent (gear) bonuses aren't effects
    const key = b.source ?? b.id;
    bySource.set(key, [...(bySource.get(key) ?? []), b]);
  }
  const markers: StatusMarker[] = [...bySource].map(([name, list]) => ({
    name,
    buff: !list.some((b) => b.amount < 0 || (b.percent ?? 0) < 0 || b.roots),
    rounds: Math.max(...list.map((b) => b.roundsRemaining)),
    effect: list.flatMap((b) => [
      ...(b.roots ? ["Rooted: can't move"] : []),
      ...(b.amount ? [formatModifier(b.stat, b.amount)] : []),
      ...(b.percent ? [formatModifier(b.stat, b.percent, true)] : []),
    ]).join(', '),
    element: list.find((b) => b.damageElement)?.damageElement,
  }));
  for (const h of hots) {
    markers.push({ name: h.name ?? 'Regeneration', buff: true, rounds: h.roundsRemaining, effect: `Heals ${h.healPerRound} each round.`, element: h.damageElement });
  }
  for (const d of dots) {
    markers.push({
      name: d.name ?? capitalize(d.damageElement),
      buff: false,
      rounds: d.roundsRemaining,
      effect: `${d.damagePerRound} ${d.damageElement} damage${d.damagesMP ? ' to MP' : ''} each round.`,
      element: d.damageElement,
    });
  }
  return markers;
}

function Marker({ m }: { m: StatusMarker }) {
  return (
    // flex: the hover area is exactly the marker box (a plain block wrapper takes a text line's height, with
    // the box on its baseline, so the hover area sat offset from the box)
    <Tooltip
      gap={6}
      className="flex"
      content={
        <div className="w-[168px] box-border px-2.5 py-2 text-left">
          <span className="block font-display text-xs tracking-[0.04em] text-rift-bright">{m.name}</span>
          <span className="block mt-[3px] text-[10px] tracking-[0.1em] uppercase text-rift-label">{m.buff ? 'Buff' : 'Debuff'} · {plural(m.rounds, 'round')} left</span>
          <span className="block mt-1.5 text-[11px] leading-[1.5] text-rift-soft">{m.effect}</span>
        </div>
      }
    >
      <span
        aria-label={`${m.name}, ${m.buff ? 'buff' : 'debuff'}, ${plural(m.rounds, 'round')} remaining`}
        className="inline-flex items-center justify-center w-4 h-4 box-border bg-rift-raised rounded-sm text-rift-soft"
        // Solid for a buff, dashed for a debuff; in the effect's element color, else the plain buff/debuff color
        style={{
          border: `1px ${m.buff ? 'solid' : 'dashed'} ${m.element ? DAMAGE_ELEMENT_COLOR[m.element]
            : m.buff ? 'color-mix(in srgb, var(--glow) 55%, var(--rift-edge))' : 'var(--rift-debuff-edge)'}`,
        }}
      >
        <svg aria-hidden="true" width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d={m.buff ? 'M2 6.5L5 3.5l3 3' : 'M2 3.5L5 6.5l3-3'} />
        </svg>
      </span>
    </Tooltip>
  );
}

/** A thin resource bar (HP or MP). */
export function StatBar({ value, max, kind, width }: { value: number; max: number; kind: 'hp' | 'mp'; width?: number }) {
  return (
    <span className="block relative box-border h-1.5 bg-rift-void border border-rift-line rounded-[1px] overflow-hidden" style={{ width }}>
      <span className={`block h-full transition-[width] ${kind === 'hp' ? 'bg-rift-hp' : 'bg-rift-mp'}`} style={{ width: `${Math.max(0, Math.min(100, (value / max) * 100))}%` }} />
    </span>
  );
}

/** Above a unit's head: its effect markers over its HP bar (and MP bar, if given). */
export default function UnitStatus({ markers, hp, maxHp, mp, maxMp }: {
  markers: StatusMarker[];
  hp: number;
  maxHp: number;
  mp?: number;
  maxMp?: number;
}) {
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="flex gap-[3px] min-h-4 pointer-events-auto">
        {markers.map((m, i) => <Marker key={i} m={m} />)}
      </div>
      <div className="flex flex-col gap-0.5">
        <StatBar value={hp} max={maxHp} kind="hp" width={52} />
        {mp !== undefined && maxMp !== undefined && <StatBar value={mp} max={maxMp} kind="mp" width={52} />}
      </div>
    </div>
  );
}

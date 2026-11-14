// The party window's Stats tab (CharacterSheet holds the panel and its tabs): six dark boxes grouped by meaning.
// Vitals (HP and MP bars with their regen), Defense (armor and magic resistance with the damage they stop), Avoidance,
// Offense (melee / ranged / magic columns), one box for Tempo (initiative, movement, threat) over Healing, and
// Resistances (one per damage element). Every value is marked green / red when gear or an effect raises it, or an
// effect lowers it, and yellow while level-up points change it (`shift`, Val). Threat is never green or red (higher
// or lower is good or bad by class): it only keeps the tooltip.
import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import type { IconType } from 'react-icons';
import { FaAnkh, FaFire, FaLeaf, FaRegSnowflake, FaShieldAlt } from 'react-icons/fa';
import { FaBoltLightning } from 'react-icons/fa6';
import { GiCrossedSwords, GiShadowGrasp } from 'react-icons/gi';
import { HiBeaker, HiOutlineLightningBolt } from 'react-icons/hi';
import { ImPlus } from 'react-icons/im';
import { IoMdDownload } from 'react-icons/io';
import { MdKeyboardDoubleArrowRight } from 'react-icons/md';
import { SiMagic } from 'react-icons/si';
import { TbCrosshair } from 'react-icons/tb';
import { ROLE_ICONS } from '../data/units/classes';
import { ATTACK_CATEGORY_COLOR, DAMAGE_ELEMENT_COLOR } from '../data/constants';
import { formatStat, regenAmount, THREAT_SHIFT_STATS, type BuffableStat, type DamageElement, type Stats } from '../data/units/stats';
import { StatTooltips, capitalize, formatSigned } from '../data/detailStrings';
import { GLANCING_MULTIPLIER, damageReduction } from '../data/combat/attackResolution';
import { Hint, TextTip, Tooltip } from './Tooltip';

/** How a stat stands (CharacterSheet's `shift`): its value, what raises or lowers it, and its level-up change. */
export interface Shift {
  /** Its value now. */
  value: number;
  /** −1 an effect lowers it, 1 gear or an effect on it raises it, 0 neither (red / green). */
  dir: number;
  /** What the gear adds to it, and what effects add (its tooltip when green). */
  gear: number;
  effects: number;
  /** The member's unconfirmed level-up points change it. */
  pending: boolean;
}

/** `stat`: the stat (or stats: Threat's two) whose gear and effects are its shares. */
export type StatShift = (stat: BuffableStat | readonly BuffableStat[], get: (s: Stats) => number) => Shift;

/**
 * Who is shown and what they wear (CharacterSheet): a value that changes when the same member's gear does pulses
 * once. The default never pulses.
 */
export const GearChange = createContext<{ member: number; gear: string }>({ member: -1, gear: '' });

/** A bonus as its value shows it (one decimal at most). */
const plain = (n: number) => String(Math.round(n * 10) / 10);

/** A value's one yellow pulse (its color and a glow, then back), unless motion is reduced. */
function pulse(el: HTMLElement | null) {
  if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const c = getComputedStyle(el).getPropertyValue('--rift-levelup').trim();
  el.animate([{ offset: 0.3, color: c, textShadow: `0 0 20px ${c}, 0 0 6px color-mix(in srgb, ${c} 90%, transparent)` }], { duration: 1800, easing: 'ease-in-out' });
}

/**
 * A value: green when gear or an effect raised it (hovering it shows by how much; `fmt` formats the bonus), red
 * when an effect lowers it, yellow while unconfirmed level-up points change it. It pulses yellow once when the
 * member's gear changes it.
 * `neutral`: higher or lower isn't good or bad (Threat), so it is never green or red, and its tooltip shows whatever
 * the gear or effects add, up or down (signed), in plain text.
 */
export function Val({ shift: { value, dir, gear, effects, pending }, fmt = plain, neutral = false, children, className = '' }: {
  shift: Shift; fmt?: (n: number) => string; neutral?: boolean; children: ReactNode; className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const { member, gear: worn } = useContext(GearChange);
  const seen = useRef({ member, worn, value });
  useEffect(() => {
    const was = seen.current;
    seen.current = { member, worn, value };
    if (was.member === member && was.worn !== worn && was.value !== value) pulse(ref.current);
  }, [member, worn, value]);

  // Neutral: no green or red, whatever moved it
  const shown = neutral ? 0 : dir;
  const val = (
    <span ref={ref} className={`inline-flex items-center ${pending ? 'rf-val-pend' : shown > 0 ? 'text-rift-up' : shown < 0 ? 'text-rift-down' : 'text-rift-ink'} ${className}`}>
      {children}
      {shown !== 0 && <span className="sr-only">{shown > 0 ? ' (raised by gear or an effect)' : ' (lowered by an effect)'}</span>}
    </span>
  );
  if (neutral) {
    const lines = ([['From gear', gear], ['From effects', effects]] as const).filter(([, n]) => Math.abs(n) > 1e-6);
    if (lines.length === 0) return val;
    return (
      <Tooltip gap={6} className="inline-flex" content={
        <div className="px-2.5 py-1.5 flex flex-col gap-0.5 text-xs whitespace-nowrap text-rift-soft">
          {/* `fmt` signs a neutral stat's amounts itself */}
          {lines.map(([label, n]) => <span key={label}>{label}: {fmt(n)}</span>)}
        </div>
      }>{val}</Tooltip>
    );
  }
  if (dir <= 0) return val;
  const lines = ([['From gear', gear], ['From effects', effects]] as const).filter(([, n]) => n > 0);
  return (
    <Tooltip gap={6} className="inline-flex" content={
      <div className="px-2.5 py-1.5 flex flex-col gap-0.5 text-xs whitespace-nowrap text-rift-soft">
        {lines.map(([label, n]) => <span key={label}>{label}: <span className="text-rift-up">+{fmt(n)}</span></span>)}
      </div>
    }>{val}</Tooltip>
  );
}

/** Offense columns: each attack category, headed by its class role's icon (caster for magic). */
const OFFENSE = [
  { key: 'melee', name: 'Melee', icon: ROLE_ICONS.melee },
  { key: 'ranged', name: 'Ranged', icon: ROLE_ICONS.ranged },
  { key: 'magic', name: 'Magic', icon: ROLE_ICONS.caster },
] as const;
const OFFENSE_ROWS = ['hit', 'damage', 'crit', 'penetration'] as const;
/** A row's label: its stat, Penetration shortened (so the number columns get the room). */
const OFFENSE_ROW_LABEL: Record<(typeof OFFENSE_ROWS)[number], string> = { hit: 'Hit', damage: 'Damage', crit: 'Crit', penetration: 'Pen.' };
/** Offense grid: the row labels, then a column per category, 50px unless a value needs more. */
const OFFENSE_GRID = '50px repeat(3, minmax(50px, max-content))';

/** Resistances, in the panel's order, each with its icon (tinted in its element's color). */
const RESISTANCES: { el: DamageElement; icon: IconType }[] = [
  { el: 'physical', icon: GiCrossedSwords }, { el: 'fire', icon: FaFire }, { el: 'ice', icon: FaRegSnowflake },
  { el: 'lightning', icon: FaBoltLightning }, { el: 'shadow', icon: GiShadowGrasp }, { el: 'holy', icon: FaAnkh },
  { el: 'nature', icon: FaLeaf }, { el: 'poison', icon: HiBeaker },
];

/** A percentage with a true minus sign: '15%', '−10%'. */
const pct = (v: number) => `${v < 0 ? '−' : ''}${Math.abs(Math.round(v))}%`;

/** A label that explains its stat on hover or focus (StatTooltips), with combat's own numbers for this member. */
function TipLabel({ stat, stats, className = '', children }: { stat: BuffableStat; stats: Stats; className?: string; children: ReactNode }) {
  const tip = StatTooltips[stat]?.({
    physicalDr: damageReduction(stats, true),
    magicDr: damageReduction(stats, false),
    glancingReduction: 1 - GLANCING_MULTIPLIER,
  });
  if (!tip) return <span className={className}>{children}</span>;
  return (
    // A flex wrapper: a plain block one would take the inherited (taller) line height, leaving a gap above the label
    <Tooltip content={<TextTip>{tip}</TextTip>} gap={6} className="flex">
      <span tabIndex={0} className={`rf-tiplabel ${className}`}>{children}</span>
    </Tooltip>
  );
}

/** HP or MP: label and current / max over its bar, its regen under it. */
function Vital({ label, cur, max, fill, regen, maxShift, regenShift }: {
  label: string; cur: number; max: number; fill: string; regen: number; maxShift: Shift; regenShift: Shift;
}) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-baseline justify-between gap-1.5">
        <span className="rf-stlab">{label}</span>
        <Val shift={maxShift} className="text-[13px] leading-none">{cur}<span className="text-rift-off">&nbsp;/ {max}</span></Val>
      </div>
      <div className="rf-stbar mt-[5px]"><span style={{ width: `${max > 0 ? Math.min(100, (cur / max) * 100) : 0}%`, background: fill }} /></div>
      <div className="flex justify-between mt-[5px] text-[10px] leading-3 text-rift-label">
        <span>Regen</span>
        <Val shift={regenShift}>+{regen}</Val>
      </div>
    </div>
  );
}

/** Armor or magic resistance: icon, label, the value and the share of damage it stops. */
function Defense({ stat, label, icon: Icon, color, physical, stats, shift }: {
  stat: 'armor' | 'magicResistance'; label: string; icon: IconType; color: string; physical: boolean; stats: Stats; shift: Shift;
}) {
  return (
    <div className="flex-none min-w-0 flex items-center gap-2">
      <Icon aria-hidden className="flex-none w-[18px] h-[18px]" style={{ color }} />
      <span className="flex flex-col gap-1 min-w-0">
        <TipLabel stat={stat} stats={stats} className="rf-stlab whitespace-nowrap">{label}</TipLabel>
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
          <Val shift={shift} className="text-base leading-none">{stats[stat]}</Val>
          <span className="text-[10px] leading-none text-rift-label">−{Math.round(damageReduction(stats, physical) * 100)}% dmg</span>
        </span>
      </span>
    </div>
  );
}

/** An icon, a label and a value (Tempo, Healing); `neutral` and `fmt` as for Val. */
function IconRow({ icon: Icon, color, label, shift, neutral, fmt, children }: {
  icon: IconType; color: string; label: string; shift: Shift; neutral?: boolean; fmt?: (n: number) => string; children: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon aria-hidden className="flex-none w-4 h-4" style={{ color }} />
      <span className="rf-stlab flex-1 whitespace-nowrap">{label}</span>
      <Val shift={shift} neutral={neutral} fmt={fmt} className="text-[13px] leading-none">{children}</Val>
    </div>
  );
}

/** Threat as its difference from the 100% everyone starts at, signed: '+0%', '+12%', '−9%' (1 is 100%). */
/** What changes the threatMultiplier (THREAT_SHIFT_STATS): the Threat row's shares. */
const THREAT_STATS = Object.keys(THREAT_SHIFT_STATS) as BuffableStat[];
const threatPct = (multiplier: number) => `${formatSigned(Math.round(multiplier * 100))}%`;

export default function StatsPanel({ stats, hp, mp, shift }: { stats: Stats; hp: number; mp: number; shift: StatShift }) {
  return (
    <div role="tabpanel" aria-label="Stats" className="flex-1 min-h-0 mt-1.5 flex flex-col gap-1.5">
      {/* Vitals */}
      <div className="rf-stcard flex-auto flex items-center gap-4">
        <Vital label="HP" cur={hp} max={stats.hp} fill="var(--rift-hp-bar)" regen={regenAmount(stats.hp, stats.hpRegen)}
          maxShift={shift('hp', s => s.hp)} regenShift={shift('hpRegen', s => regenAmount(s.hp, s.hpRegen))} />
        <Vital label="MP" cur={mp} max={stats.mp} fill="var(--rift-mp-bar)" regen={regenAmount(stats.mp, stats.mpRegen)}
          maxShift={shift('mp', s => s.mp)} regenShift={shift('mpRegen', s => regenAmount(s.mp, s.mpRegen))} />
      </div>

      {/* Defense, Avoidance */}
      <div className="flex-auto flex gap-1.5">
        <div className="rf-stcard flex-1 min-w-0 flex flex-col justify-around gap-2">
          <Defense stat="armor" label="Armor" icon={FaShieldAlt} color="var(--rift-soft)" physical stats={stats} shift={shift('armor', s => s.armor)} />
          <Defense stat="magicResistance" label="Magic Res." icon={SiMagic} color="var(--cat-magic)" physical={false} stats={stats}
            shift={shift('magicResistance', s => s.magicResistance)} />
        </div>
        <div className="rf-stcard flex-1 min-w-0 flex flex-col justify-around py-1">
          {([['Dodge', 'dodge'], ['Parry', 'parry'], ['Block', 'block'], ['Glancing Blow', 'glancingBlow']] as const).map(([label, key]) => (
            <div key={key} className="flex items-center justify-between gap-1.5 h-[22px] text-xs border-b border-rift-divider">
              <TipLabel stat={key} stats={stats} className="text-rift-muted whitespace-nowrap">{label}</TipLabel>
              <Val shift={shift(key, s => s[key])} fmt={v => formatStat(key, v)}>{formatStat(key, stats[key])}</Val>
            </div>
          ))}
        </div>
      </div>

      {/* Offense; Tempo above Healing, in one box */}
      <div className="flex-auto flex items-stretch gap-1.5">
        <div role="group" aria-label="Offense" className="rf-stcard flex-none flex flex-col">
          {/* One grid (header and rows), so a wide value widens its whole column; rows spread over the box's height */}
          <div className="flex-1 grid content-around text-xs" style={{ gridTemplateColumns: OFFENSE_GRID }}>
            <span />
            {OFFENSE.map(({ key, name, icon: Icon }) => (
              <span key={key} className="flex items-center justify-end h-5 border-b border-rift-divider" style={{ color: ATTACK_CATEGORY_COLOR[key] }}>
                <Hint text={name}><Icon aria-label={name} className="w-3 h-3" /></Hint>
              </span>
            ))}
            {OFFENSE_ROWS.map(row => [
              <span key={row} className="flex items-center h-5 text-rift-muted">{OFFENSE_ROW_LABEL[row]}</span>,
              ...OFFENSE.map(({ key }) => {
                const stat = `${key}${capitalize(row)}` as BuffableStat;
                const v = stats[key][row];
                return (
                  <span key={`${row}-${key}`} className="flex items-center justify-end h-5 pl-1">
                    <Val shift={shift(stat, s => s[key][row])} fmt={v => formatStat(stat, v)} className="text-[10px]">{formatStat(stat, v)}</Val>
                  </span>
                );
              }),
            ])}
          </div>
        </div>
        <div className="rf-stcard flex-1 min-w-0 py-2 flex flex-col justify-around">
          <IconRow icon={HiOutlineLightningBolt} color="var(--rift-label)" label="Initiative" shift={shift('initiative', s => s.initiative)}>{stats.initiative}</IconRow>
          <IconRow icon={MdKeyboardDoubleArrowRight} color="var(--rift-label)" label="Movement" shift={shift('movement', s => s.movement)}>{stats.movement}</IconRow>
          {/* Shown for every member: Subtlety lowers it, on purpose in some builds */}
          <IconRow icon={TbCrosshair} color="var(--rift-label)" label="Threat" neutral fmt={threatPct}
            shift={shift(THREAT_STATS, s => s.threatMultiplier)}>{threatPct(stats.threatMultiplier - 1)}</IconRow>
          <div aria-hidden="true" className="flex-none self-center h-px w-[100%] bg-rift-divider" />
          <IconRow icon={ImPlus} color="var(--tone-hot)" label="Healing" shift={shift('healing', s => s.healing)} fmt={v => formatStat('healing', v)}>{formatStat('healing', stats.healing)}</IconRow>
          <IconRow icon={IoMdDownload} color="var(--tone-hot)" label="Heal Rcvd" shift={shift('healingReceived', s => s.healingReceived)} fmt={v => formatStat('healingReceived', v)}>{formatStat('healingReceived', stats.healingReceived)}</IconRow>
        </div>
      </div>

      {/* Resistances */}
      <div role="group" aria-label="Resistances" className="rf-stcard flex-none pt-1.5 pb-[7px] flex flex-col gap-[5px]">
        <span className="rf-stcap">Resistances</span>
        <div className="flex-1 flex items-center justify-between">
          {RESISTANCES.map(({ el, icon: Icon }) => {
            const stat = `${el}Resistance` as BuffableStat;
            const res = (s: Stats) => s.elementalStats[el]?.resistance ?? 0;
            return (
              // The element's name on its icon, so it never stacks on the value's own tooltip
              <div key={el} className="flex-1 min-w-0 flex flex-col items-center gap-1.5">
                <Hint text={capitalize(el)}><Icon aria-hidden className="w-5 h-5" style={{ color: DAMAGE_ELEMENT_COLOR[el] }} /></Hint>
                <span className="sr-only">{capitalize(el)}</span>
                <Val shift={shift(stat, res)} fmt={pct} className="text-xs leading-none">{pct(res(stats))}</Val>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

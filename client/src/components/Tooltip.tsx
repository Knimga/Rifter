import { useState, useRef, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { PiMouseLeftClickFill, PiMouseRightClickFill } from 'react-icons/pi';
import GoldAmount from './ui/GoldAmount';
import { isArmorItem, isJewelryItem, isOffhandItem, isShieldItem, isWeaponItem, type Item, type WeaponItem, type ArmorItem, type ShieldItem, type OffhandItem, type JewelryItem } from '../data/gear';
import { OFFHAND_KIND_NAME } from '../data/gear/offhands';
import { JEWELRY_KIND_NAME } from '../data/gear/jewelry';
import type { Stats } from '../data/units/stats';
import type { EquipCompare } from '../data/units/party';
import { RARITY_COLOR } from '../data/constants';
import { WEAPON_TYPE_SINGULAR, formatModifier, weaponDamageLines } from '../data/detailStrings';
import { getOffense } from '../data/combat/attackResolution';
import { weaponDamageEffect } from '../data/combat/abilityExecution';
import { EffectRow } from './ui/AbilityCard';

// ─── Portal Tooltip wrapper ───────────────────────────────────────────────────

interface TooltipProps {
  content: ReactNode | null;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Gap (px) between the anchor and the tooltip. Default 8. */
  gap?: number;
  /** The content is its own box (e.g. an AbilityCard): no tooltip frame (.rf-tip) around it. */
  bare?: boolean;
  /**
   * Where it opens: centered above (default), centered below, or below with right edges aligned (things at the top
   * of the screen).
   */
  placement?: 'above' | 'below' | 'below-end';
}

/** Where a tooltip's anchor point is on its target's box, and how it is moved from there, by placement. */
const PLACE: Record<NonNullable<TooltipProps['placement']>, { at: (r: DOMRect) => { x: number; y: number }; move: (gap: number) => string }> = {
  above: { at: (r) => ({ x: r.left + r.width / 2, y: r.top }), move: (gap) => `translate(-50%, calc(-100% - ${gap}px))` },
  below: { at: (r) => ({ x: r.left + r.width / 2, y: r.bottom }), move: (gap) => `translate(-50%, ${gap}px)` },
  'below-end': { at: (r) => ({ x: r.right, y: r.bottom }), move: (gap) => `translate(-100%, ${gap}px)` },
};

/** Shows `content` above (or below) its children while they are hovered or hold keyboard focus. */
export function Tooltip({ content, children, className, style, gap = 8, bare = false, placement = 'above' }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const show = () => {
    if (!content || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos(PLACE[placement].at(r));
    setVisible(true);
  };
  const hide = () => setVisible(false);

  return (
    <div ref={ref} className={className} style={style} onMouseEnter={show} onMouseLeave={hide} onFocus={show} onBlur={hide}>
      {children}
      {visible && content && createPortal(
        <div
          role="tooltip"
          className="fixed z-[9999] pointer-events-none font-tech text-rift-ink"
          style={{ left: pos.x, top: pos.y, transform: PLACE[placement].move(gap) }}
        >
          {bare ? content : <div className="rf-tip text-sm overflow-hidden">{content}</div>}
        </div>,
        document.body,
      )}
    </div>
  );
}

/**
 * A one-line label shown on hover or focus (what an icon button does, a truncated name), in the theme's
 * tooltip style. Use this instead of the browser's `title` tooltips.
 */
export function Hint({ text, className = 'inline-flex', children }: { text: string; className?: string; children: ReactNode }) {
  return (
    <Tooltip gap={6} className={className} content={<div className="px-2.5 py-1.5 text-xs whitespace-nowrap text-rift-soft">{text}</div>}>
      {children}
    </Tooltip>
  );
}

/**
 * What clicking does, for the bottom of a tooltip: the mouse button as an icon, then the action, e.g.
 * [right-click] Equip. Use this instead of writing "Right-click to ..." in words.
 */
export function ClickHint({ button, children, className = '', color }: { button: 'left' | 'right'; children: ReactNode; className?: string; color?: string }) {
  const Icon = button === 'left' ? PiMouseLeftClickFill : PiMouseRightClickFill;
  return (
    <div className={`flex items-center gap-1.5 text-[11px] text-rift-label ${className}`} style={color ? { color } : undefined}>
      <Icon role="img" aria-label={`${button === 'left' ? 'Left' : 'Right'}-click:`} className="w-4 h-4 shrink-0 text-rift-muted" />
      <span>{children}</span>
    </div>
  );
}

/** A short plain-text tooltip (e.g. what an attribute does), in the theme's tooltip style. */
export function TextTip({ children }: { children: ReactNode }) {
  return <div className="w-[220px] box-border px-2.5 py-2 text-xs leading-[1.5] text-rift-soft">{children}</div>;
}

// ─── Item tooltips ────────────────────────────────────────────────────────────

/** What right-clicking the item does here, if anything (equip it, unequip it, take it from a container). */
export type ItemClickAction = 'Equip' | 'Unequip' | 'Loot';

/**
 * An item's side of a trade (the vendor window), shown at the bottom of its tooltip instead of its sell value: its
 * price, and what right-clicking does or why it can't.
 */
export interface ItemTrade {
  /** What the price is: 'Price' (the vendor's), 'Sells for' (the party's), 'Sold for', 'Bought for'. */
  label: string;
  price: number;
  /** The party can't pay it: the price shows red. */
  short?: boolean;
  /** What right-clicking does ('Buy', 'Sell', 'Undo sale', 'Undo purchase'); none when it can't (`reason`). */
  action?: string;
  /** Why it can't be traded now ('Not enough gold', 'Inventory full'). */
  reason?: string;
  /** Its action undoes a trade of this visit: shown in gold, like its new marker. */
  undo?: boolean;
}

interface ItemTooltipProps {
  stats?: Stats;
  proficient?: boolean;           // false marks the item type pink: the viewer can't use it
  clickAction?: ItemClickAction;  // shows the right-click hint
  canCompare?: boolean;           // shows the Ctrl "Compare" hint (the viewer can equip it: equipCompare)
  trade?: ItemTrade;              // its price and trade action (the vendor window), in place of its sell value
  /** While comparing: what equipping it changes (equipCompare): a weapon's damage, then the stats it adds and removes, at the very bottom. */
  compare?: Pick<EquipCompare, 'deltas' | 'damage'>;
}

/** A damage range as tooltips show it: '6–9', or '7' when it can only roll one number. */
const damageText = ([lo, hi]: [number, number]) => (lo === hi ? `${lo}` : `${lo}–${hi}`);

/**
 * Comparing a weapon's damage: the held weapon's range, then this one's, colored by whether its average is higher
 * (up), lower (down) or the same.
 */
function DamageDelta({ before, after }: NonNullable<EquipCompare['damage']>) {
  const avg = (r: [number, number]) => (r[0] + r[1]) / 2;
  const change = avg(after) - (before ? avg(before) : 0);
  const tone = change > 0 ? 'text-rift-up' : change < 0 ? 'text-rift-down' : 'text-rift-muted';
  return <div className={tone}>Damage {before ? `${damageText(before)} → ` : ''}{damageText(after)}</div>;
}

/**
 * What holding a key does, for the bottom right of a tooltip: the action, then the key as a keycap, e.g.
 * Compare [Ctrl] (ClickHint mirrored).
 */
export function KeyHint({ keyName, children, className = '' }: { keyName: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center gap-1.5 text-[11px] text-rift-label ${className}`}>
      <span>{children}</span>
      <kbd aria-label={`Hold ${keyName}:`} className="shrink-0 px-1 py-px border border-rift-edge rounded-sm font-tech text-[9px] leading-none text-rift-muted">{keyName}</kbd>
    </div>
  );
}

/**
 * An item's tooltip: name (rarity color), type and item level, implicit, its main readout (weapon damage and range, or
 * armor), rolled affixes, what it sells for, then the hints: right-click at the left, Ctrl to compare at the right.
 * While comparing, how equipping it changes the stats comes last: gains green, losses red.
 */
function ItemTip({ item, type, proficient, clickAction, canCompare, trade, compare, children }: Omit<ItemTooltipProps, 'stats'> & { item: Item; type: string; children?: ReactNode }) {
  return (
    <div className="w-[236px] box-border px-3.5 py-3 text-xs">
      <div className="font-display text-sm tracking-[0.03em]" style={{ color: RARITY_COLOR[item.rarity] }}>{item.name}</div>
      <div className={`mt-[3px] text-[11px] capitalize ${proficient === false ? 'text-rift-unusable' : 'text-rift-muted'}`}>
        {type}{proficient === false && <span className="normal-case"> · Not proficient</span>} · Level {item.level}
      </div>
      {item.implicit && <div className="mt-1.5 text-rift-ink">{formatModifier(item.implicit.stat, item.implicit.value)}</div>}
      <div className="mt-1.5 flex flex-col gap-0.5 text-rift-soft">{children}</div>
      {item.affixes.length > 0 && (
        <div className="mt-2 pt-2 border-t border-rift-line leading-[1.6] text-rift-affix">
          {item.affixes.map((affix, i) => <div key={i}>{formatModifier(affix.stat, affix.value)}</div>)}
        </div>
      )}
      {trade ? (
        // The trade: a hairline, the price by its label, then what right-clicking does (or why it can't)
        <div className="mt-2 pt-2 border-t border-rift-line">
          <div className="flex items-center justify-between">
            <span className="text-rift-muted">{trade.label}</span>
            <GoldAmount amount={trade.price} label={trade.label} color={trade.short ? 'var(--rift-down)' : 'var(--rift-gold-text)'} />
          </div>
          {trade.action
            ? <ClickHint button="right" className="mt-1.5" color={trade.undo ? 'var(--rift-levelup)' : undefined}>{trade.action}</ClickHint>
            : trade.reason && <div className="mt-1.5 text-[11px] text-rift-down">{trade.reason}</div>}
        </div>
      ) : (
        <GoldAmount amount={item.value} label="Sells for" className="mt-2 text-[11px] text-rift-soft" />
      )}
      {(clickAction || canCompare) && (
        <div className="mt-2 flex items-center justify-between gap-3">
          {clickAction && <ClickHint button="right">{clickAction}</ClickHint>}
          {canCompare && <KeyHint keyName="Ctrl" className="ml-auto">Compare</KeyHint>}
        </div>
      )}
      {compare && (
        <div className="mt-2 pt-2 border-t border-rift-line text-[11px] leading-[1.6]">
          {compare.damage && <DamageDelta {...compare.damage} />}
          {compare.deltas.length === 0 && !compare.damage ? <div className="text-rift-muted">No stat changes</div>
            : compare.deltas.map(({ stat, delta }) => <div key={stat} className={delta > 0 ? 'text-rift-up' : 'text-rift-down'}>{formatModifier(stat, delta)}</div>)}
        </div>
      )}
    </div>
  );
}

function WeaponTooltipContent({ item, stats, ...rest }: ItemTooltipProps & { item: WeaponItem }) {
  const bonus = stats ? getOffense(stats, item.attackCategory, item.damageElement).damage : 0;
  return (
    <ItemTip item={item} type={`${WEAPON_TYPE_SINGULAR[item.weaponType]} · ${item.attackCategory}`} {...rest}>
      {weaponDamageLines(weaponDamageEffect(item), bonus).map((line, i) => (
        <EffectRow key={i} label={line.label} value={line.value} tone={line.tone} element={line.element} />
      ))}
      <EffectRow label="Range" value={String(item.range)} tone="base" />
    </ItemTip>
  );
}

function ArmorTooltipContent({ item, stats: _stats, ...rest }: ItemTooltipProps & { item: ArmorItem | ShieldItem }) {
  return (
    <ItemTip item={item} type={`${item.armorType} ${isShieldItem(item) ? 'Shield' : 'Armor'}`} {...rest}>
      <EffectRow label="Armor" value={String(item.armorValue)} tone="base" />
    </ItemTip>
  );
}

/** A quiver or a focus: no armor, only its implicit and affixes (ItemTip shows them). */
function OffhandTooltipContent({ item, stats: _stats, ...rest }: ItemTooltipProps & { item: OffhandItem }) {
  return <ItemTip item={item} type={OFFHAND_KIND_NAME[item.offhandKind]} {...rest} />;
}

/** A ring or an amulet: like an offhand, only its implicit and affixes. */
function JewelryTooltipContent({ item, stats: _stats, ...rest }: ItemTooltipProps & { item: JewelryItem }) {
  return <ItemTip item={item} type={JEWELRY_KIND_NAME[item.slot]} {...rest} />;
}

/**
 * An item's tooltip with, while `comparing` (Ctrl held), how equipping it changes the stats at its bottom, and
 * the equipped item's tooltip (if any) beside it on the right, bottoms aligned. The hovered one stays where it
 * would be alone. Each in its own tooltip frame (use with a `bare` Tooltip). `compareWith` runs only once the
 * tooltip shows; when it gives null (the viewer can't equip it), no comparing, just the item.
 */
export function ItemCompareTooltip({ compareWith, comparing, ...props }: ItemTooltipProps & { item: Item; compareWith: (item: Item) => EquipCompare | null; comparing: boolean }) {
  const compare = compareWith(props.item);
  const on = comparing && compare;
  return (
    <div className="relative">
      <div className="rf-tip text-sm overflow-hidden"><ItemTooltipContent {...props} canCompare={!!compare} compare={on ? compare : undefined} /></div>
      {on && compare.equipped && (
        <div className="rf-tip text-sm overflow-hidden absolute left-full bottom-0 ml-2">
          <ItemTooltipContent item={compare.equipped} stats={props.stats} />
        </div>
      )}
    </div>
  );
}

/** Tooltip for any item kind. */
export function ItemTooltipContent(props: ItemTooltipProps & { item: Item }) {
  const { item } = props;
  if (isWeaponItem(item)) return <WeaponTooltipContent {...props} item={item} />;
  if (isArmorItem(item) || isShieldItem(item)) return <ArmorTooltipContent {...props} item={item} />;
  if (isOffhandItem(item)) return <OffhandTooltipContent {...props} item={item} />;
  if (isJewelryItem(item)) return <JewelryTooltipContent {...props} item={item} />;
  return null;
}

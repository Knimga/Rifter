import { useState, useRef, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { isArmorItem, isShieldItem, isWeaponItem, RarityTextColors, type Item, type WeaponItem, type ArmorItem, type ShieldItem, type DamageElement } from '../data/gear';
import type { Ability } from '../data/classes';
import type { Stats } from '../data/stats';
import { DAMAGE_ELEMENT_COLOR } from '../data/constants';
import { AREA_LABEL, EFFECT_TONE_CLASS, describeEffect, formatModifier, type EffectLine } from '../data/detailStrings';
import { getOffense } from '../data/attackResolution';
import { toAction, weaponDamageEffect } from '../data/abilityExecution';
import { PiMouseRightClickFill } from 'react-icons/pi';

// ─── Portal Tooltip wrapper ───────────────────────────────────────────────────

interface TooltipProps {
  content: ReactNode | null;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Tooltip({ content, children, className, style }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const ref = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (!content || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: r.left + r.width / 2, y: r.top });
    setVisible(true);
  };

  return (
    <div
      ref={ref}
      className={className}
      style={style}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && content && createPortal(
        <div
          className="fixed z-[9999] pointer-events-none"
          style={{ left: pos.x, top: pos.y, transform: 'translate(-50%, calc(-100% - 8px))' }}
        >
          <div className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl text-sm overflow-hidden">
            {content}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function ElementTag({ element }: { element: DamageElement }) {
  return <span style={{ color: DAMAGE_ELEMENT_COLOR[element] }}>{element}</span>;
}

function Row({ label, children, valueClass = 'text-gray-200' }: {
  label: string;
  children: ReactNode;
  valueClass?: string;
}) {
  return (
    <div className="flex justify-between items-baseline gap-5">
      <span className="text-gray-500">{label}</span>
      <span className={valueClass}>{children}</span>
    </div>
  );
}

function EffectRows({ lines }: { lines: EffectLine[] }) {
  return (
    <>
      {lines.map((line, i) => (
        <Row key={i} label={line.label} valueClass={EFFECT_TONE_CLASS[line.tone]}>
          {line.value}{line.element && <> <ElementTag element={line.element} /></>}
        </Row>
      ))}
    </>
  );
}

/** Rolled affixes (blue), below the item's base readout. */
function AffixList({ item }: { item: Item }) {
  if (!item.affixes.length) return null;
  return (
    <>
      <div className="border-t border-gray-700/60 mx-3" />
      <div className="px-3 py-1.5 space-y-0.5">
        {item.affixes.map((affix, i) => (
          <div key={i} className="text-xs text-blue-300">{formatModifier(affix.stat, affix.value)}</div>
        ))}
      </div>
    </>
  );
}

/** What right-clicking the item does here, if anything. */
export type ItemClickAction = 'Equip' | 'Unequip';

function RightClickRow({ action }: { action: ItemClickAction }) {
  return (
    <>
      <div className="border-t border-gray-700/60 mx-3" />
      <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs text-gray-400">
        <PiMouseRightClickFill className="w-3.5 h-3.5 shrink-0" />
        <span>{action}</span>
      </div>
    </>
  );
}

/** Name, item type (pink if the viewer isn't proficient), then the implicit. */
function ItemHeader({ item, subtitle, proficient }: { item: Item; subtitle: ReactNode; proficient?: boolean }) {
  return (
    <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-700">
      <p className="font-bold" style={{ color: RarityTextColors[item.rarity] }}>{item.name}</p>
      <p className={`text-xs mt-0.5 ${proficient === false ? 'text-pink-400' : 'text-gray-500'}`}>{subtitle}</p>
      {item.implicit && (
        <p className="text-xs mt-0.5 text-gray-300">{formatModifier(item.implicit.stat, item.implicit.value)}</p>
      )}
    </div>
  );
}

// ─── Item tooltips ────────────────────────────────────────────────────────────

interface ItemTooltipProps {
  stats?: Stats;
  proficient?: boolean;           // false tints the item type pink
  clickAction?: ItemClickAction;  // shows the right-click hint
}

export function WeaponTooltipContent({ item, stats, proficient, clickAction }: ItemTooltipProps & { item: WeaponItem }) {
  const bonus = stats ? getOffense(stats, item.attackCategory, item.damageElement).damage : 0;
  return (
    <div className="min-w-[180px]">
      <ItemHeader item={item} proficient={proficient} subtitle={<span className="capitalize">{item.weaponType} · {item.attackCategory}</span>} />
      <div className="px-3 py-2 space-y-1">
        <EffectRows lines={describeEffect(weaponDamageEffect(item), bonus)} />
        <Row label="Range">{item.range}</Row>
      </div>
      <AffixList item={item} />
      {clickAction && <RightClickRow action={clickAction} />}
    </div>
  );
}

export function ArmorTooltipContent({ item, proficient, clickAction }: ItemTooltipProps & { item: ArmorItem | ShieldItem }) {
  return (
    <div className="min-w-[160px]">
      <ItemHeader item={item} proficient={proficient} subtitle={`${item.armorType} ${isShieldItem(item) ? 'Shield' : 'Armor'}`} />
      <div className="px-3 py-2 space-y-1">
        <Row label="Armor" valueClass="text-gray-200 font-medium">{item.armorValue}</Row>
      </div>
      <AffixList item={item} />
      {clickAction && <RightClickRow action={clickAction} />}
    </div>
  );
}

/** Tooltip for any item kind. */
export function ItemTooltipContent(props: ItemTooltipProps & { item: Item }) {
  const { item } = props;
  if (isWeaponItem(item)) return <WeaponTooltipContent {...props} item={item} />;
  if (isArmorItem(item) || isShieldItem(item)) return <ArmorTooltipContent {...props} item={item} />;
  return null;
}

// ─── Ability tooltip ──────────────────────────────────────────────────────────

export function AbilityTooltipContent({ ability, stats, weapon }: {
  ability: Ability;
  stats?: Stats;
  weapon?: WeaponItem | null;
}) {
  const category = ability.useWeapon ? 'weapon' : ability.attackCategory;
  // Resolve the weapon into the ability so weapon damage shows (and scales) like any other damage effect
  const action = toAction(ability, weapon ?? null);
  const effects = action?.effects ?? ability.effects;
  const bonusFor = (eff: Ability['effects'][number]) =>
    stats && action && eff.type === 'damage' && eff.appliesTo === 'target'
      ? getOffense(stats, action.attackCategory ?? 'melee', eff.damageElement).damage
      : 0;

  return (
    <div className="min-w-[210px]">
      {/* Header */}
      <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-700">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-bold" style={{ color: ability.displayElement ? DAMAGE_ELEMENT_COLOR[ability.displayElement] : 'rgb(243 244 246)' }}>{ability.name}</p>
          <span className="text-blue-400 font-medium text-xs shrink-0">{ability.mpCost} MP</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {category && <span className="capitalize">{category}</span>}
          {category ? ' · ' : ''}
          {AREA_LABEL[ability.area ?? 'single']}
          {', range '}{ability.range}
        </p>
      </div>

      {/* Effects */}
      {(ability.useWeapon || effects.length > 0) && (
        <div className="px-3 py-2 space-y-1">
          {ability.useWeapon && !action && <Row label="Base Damage" valueClass="text-gray-400">Weapon</Row>}
          {effects.map((eff, i) => <EffectRows key={i} lines={describeEffect(eff, bonusFor(eff))} />)}
        </div>
      )}
    </div>
  );
}

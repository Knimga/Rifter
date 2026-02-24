import { useState, useRef, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { isShieldItem, type WeaponItem, type ArmorItem, type ShieldItem } from '../data/gear';
import type { Ability, Stats } from '../data/classes';

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

const ELEMENT_COLOR: Record<string, string> = {
  fire:        'text-orange-400',
  ice:         'text-cyan-400',
  lightning:   'text-yellow-300',
  shadow:      'text-purple-400',
  poison:      'text-green-400',
  holy:        'text-yellow-200',
  nature:      'text-emerald-400',
  slashing:    'text-gray-400',
  piercing:    'text-gray-400',
  bludgeoning: 'text-gray-400',
};

function ElementTag({ element }: { element: string }) {
  return <span className={ELEMENT_COLOR[element] ?? 'text-gray-400'}>{element}</span>;
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

const AREA_LABEL: Record<string, string> = {
  single: 'Single',
  blast1:  'Blast 1',
  blast2:  'Blast 2',
  line:    'Line',
};

// ─── Weapon tooltip ───────────────────────────────────────────────────────────

export function WeaponTooltipContent({ item, stats }: { item: WeaponItem; stats?: Stats }) {
  const bonus = stats ? stats[item.attackCategory].damage : null;
  return (
    <div className="min-w-[180px]">
      <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-700">
        <p className="font-bold text-gray-100">{item.name}</p>
        <p className="text-xs text-gray-500 mt-0.5 capitalize">{item.weaponType} · {item.attackCategory}</p>
      </div>
      <div className="px-3 py-2 space-y-1">
        <Row label="Base Damage" valueClass="text-gray-400">
          {item.minDamage}–{item.maxDamage}{' '}
          <ElementTag element={item.damageElement} />
        </Row>
        {bonus !== null && (
          <Row label="Damage" valueClass="text-red-400 font-medium">
            {item.minDamage + bonus}–{item.maxDamage + bonus}{' '}
            <ElementTag element={item.damageElement} />
          </Row>
        )}
        <Row label="Range">{item.range}</Row>
      </div>
    </div>
  );
}

// ─── Armor / Shield tooltip ───────────────────────────────────────────────────

export function ArmorTooltipContent({ item }: { item: ArmorItem | ShieldItem }) {
  const isShield = isShieldItem(item);
  const armor = item as ArmorItem;
  return (
    <div className="min-w-[160px]">
      <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-700">
        <p className="font-bold text-gray-100">{item.name}</p>
        <p className="text-xs text-gray-500 mt-0.5">{item.armorType} {isShield ? 'Shield' : 'Armor'}</p>
      </div>
      <div className="px-3 py-2 space-y-1">
        <Row label="Armor" valueClass="text-gray-200 font-medium">{item.armorValue}</Row>
        {!isShield && armor.magicResistance != null && (
          <Row label="Magic Res" valueClass="text-purple-300 font-medium">{armor.magicResistance}</Row>
        )}
      </div>
    </div>
  );
}

// ─── Ability tooltip ──────────────────────────────────────────────────────────

export function AbilityTooltipContent({ ability, stats, weapon }: {
  ability: Ability;
  stats?: Stats;
  weapon?: WeaponItem | null;
}) {
  const hasEffects = ability.damage || ability.dot || ability.heal || ability.hot || ability.buff || ability.debuff || ability.useWeapon;
  const category = ability.useWeapon ? 'weapon' : ability.attackCategory;

  // Compute bonus damage if stats are available
  const abilityBonus = stats && ability.attackCategory ? stats[ability.attackCategory].damage : null;
  const weaponBonus = stats && ability.useWeapon && weapon ? stats[weapon.attackCategory].damage : null;

  return (
    <div className="min-w-[210px]">
      {/* Header */}
      <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-700">
        <div className="flex items-baseline justify-between gap-3">
          <p className="font-bold text-gray-100">{ability.name}</p>
          <span className="text-blue-400 font-medium text-xs shrink-0">{ability.mpCost} MP</span>
        </div>
        <p className="text-xs text-gray-500 mt-0.5">
          {category && <span className="capitalize">{category}</span>}
          {category ? ' · ' : ''}
          {ability.area ? AREA_LABEL[ability.area] : 'Single'}
          {', range '}{ability.range}
        </p>
      </div>

      {/* Effects */}
      {hasEffects && (
        <div className="px-3 py-2 space-y-1">
          {ability.damage && (
            <>
              <Row label="Base Damage" valueClass="text-gray-400">
                {ability.damage.minDamage}–{ability.damage.maxDamage}{' '}
                <ElementTag element={ability.damage.damageElement} />
              </Row>
              {abilityBonus !== null && (
                <Row label="Damage" valueClass="text-red-400 font-medium">
                  {ability.damage.minDamage + abilityBonus}–{ability.damage.maxDamage + abilityBonus}{' '}
                  <ElementTag element={ability.damage.damageElement} />
                </Row>
              )}
            </>
          )}
          {ability.useWeapon && (
            <>
              <Row label="Base Damage" valueClass="text-gray-400">
                {weapon ? <>{weapon.minDamage}–{weapon.maxDamage} <ElementTag element={weapon.damageElement} /></> : 'Weapon'}
              </Row>
              {weapon && weaponBonus !== null && (
                <Row label="Damage" valueClass="text-red-400 font-medium">
                  {weapon.minDamage + weaponBonus}–{weapon.maxDamage + weaponBonus}{' '}
                  <ElementTag element={weapon.damageElement} />
                </Row>
              )}
            </>
          )}
          {ability.dot && (
            <Row label="DoT" valueClass="text-orange-400">
              {ability.dot.damagePerRound}/rnd × {ability.dot.rounds}r{' '}
              <ElementTag element={ability.dot.damageElement} />
            </Row>
          )}
          {ability.heal && (
            <Row label="Heal" valueClass="text-green-400 font-medium">
              {ability.heal.minHeal}–{ability.heal.maxHeal}
            </Row>
          )}
          {ability.hot && (
            <Row label="HoT" valueClass="text-emerald-400">
              {ability.hot.healPerRound}/rnd × {ability.hot.rounds}r
            </Row>
          )}
          {ability.buff && (
            <Row label="Buff" valueClass="text-yellow-300">
              +{ability.buff.amount} {ability.buff.stat} × {ability.buff.rounds}r
            </Row>
          )}
          {ability.debuff && (
            <Row label="Debuff" valueClass="text-purple-400">
              −{ability.debuff.amount} {ability.debuff.stat} × {ability.debuff.rounds}r
            </Row>
          )}
        </div>
      )}
    </div>
  );
}

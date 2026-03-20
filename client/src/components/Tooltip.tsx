import { useState, useRef, type ReactNode, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { isShieldItem, type WeaponItem, type ArmorItem, type ShieldItem } from '../data/gear';
import type { Ability } from '../data/classes';
import type { Stats } from '../data/stats';
import { DAMAGE_ELEMENT_COLOR } from '../data/constants';
import { AREA_LABEL } from '../data/detailStrings';
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

const EL_COLOR = DAMAGE_ELEMENT_COLOR as Record<string, string>;

function ElementTag({ element }: { element: string }) {
  return <span style={{ color: EL_COLOR[element] }}>{element}</span>;
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

function EquipRow() {
  return (
    <>
      <div className="border-t border-gray-700/60 mx-3" />
      <div className="px-3 py-1.5 flex items-center gap-1.5 text-xs text-gray-400">
        <PiMouseRightClickFill className="w-3.5 h-3.5 shrink-0" />
        <span>Equip</span>
      </div>
    </>
  );
}

// ─── Weapon tooltip ───────────────────────────────────────────────────────────

export function WeaponTooltipContent({ item, stats, proficient }: { item: WeaponItem; stats?: Stats; proficient?: boolean }) {
  const bonus = stats
    ? stats[item.attackCategory].damage + (stats.elementalStats[item.damageElement]?.damage ?? 0)
    : null;
  const typeClass = proficient === false ? 'text-pink-400' : 'text-gray-500';
  return (
    <div className="min-w-[180px]">
      <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-700">
        <p className="font-bold text-gray-100">{item.name}</p>
        <p className={`text-xs mt-0.5 capitalize ${typeClass}`}>{item.weaponType} · {item.attackCategory}</p>
      </div>
      <div className="px-3 py-2 space-y-1">
        <Row label="Base Damage" valueClass="text-gray-400">
          {item.minDamage}–{item.maxDamage}{' '}
          <ElementTag element={item.damageElement} />
        </Row>
        {bonus !== null && bonus !== 0 && (
          <Row label="Damage" valueClass="text-red-400 font-medium">
            {item.minDamage + bonus}–{item.maxDamage + bonus}{' '}
            <ElementTag element={item.damageElement} />
          </Row>
        )}
        <Row label="Range">{item.range}</Row>
      </div>
      {proficient && <EquipRow />}
    </div>
  );
}

// ─── Armor / Shield tooltip ───────────────────────────────────────────────────

export function ArmorTooltipContent({ item, proficient }: { item: ArmorItem | ShieldItem; proficient?: boolean }) {
  const isShield = isShieldItem(item);
  const armor = item as ArmorItem;
  const typeClass = proficient === false ? 'text-pink-400' : 'text-gray-500';
  return (
    <div className="min-w-[160px]">
      <div className="px-3 pt-2.5 pb-1.5 border-b border-gray-700">
        <p className="font-bold text-gray-100">{item.name}</p>
        <p className={`text-xs mt-0.5 ${typeClass}`}>{item.armorType} {isShield ? 'Shield' : 'Armor'}</p>
      </div>
      <div className="px-3 py-2 space-y-1">
        <Row label="Armor" valueClass="text-gray-200 font-medium">{item.armorValue}</Row>
        {!isShield && armor.magicResistance != null && (
          <Row label="Magic Res" valueClass="text-purple-300 font-medium">{armor.magicResistance}</Row>
        )}
      </div>
      {proficient && <EquipRow />}
    </div>
  );
}

// ─── Ability tooltip ──────────────────────────────────────────────────────────

export function AbilityTooltipContent({ ability, stats, weapon }: {
  ability: Ability;
  stats?: Stats;
  weapon?: WeaponItem | null;
}) {
  const category = ability.useWeapon ? 'weapon' : ability.attackCategory;
  const weaponBonus = stats && ability.useWeapon && weapon
    ? stats[weapon.attackCategory].damage + (stats.elementalStats[weapon.damageElement]?.damage ?? 0)
    : null;
  const damageBonus = (element: string) => {
    if (!stats) return 0;
    const catBonus = ability.attackCategory ? stats[ability.attackCategory].damage : 0;
    const elBonus = stats.elementalStats[element as keyof typeof stats.elementalStats]?.damage ?? 0;
    return catBonus + elBonus;
  };
  const hasEffects   = ability.useWeapon || ability.effects.length > 0;

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
          {ability.area ? AREA_LABEL[ability.area] : 'Single'}
          {', range '}{ability.range}
        </p>
      </div>

      {/* Effects */}
      {hasEffects && (
        <div className="px-3 py-2 space-y-1">
          {ability.useWeapon && (
            <>
              <Row label="Base Damage" valueClass="text-gray-400">
                {weapon ? <>{weapon.minDamage}–{weapon.maxDamage} <ElementTag element={weapon.damageElement} /></> : 'Weapon'}
              </Row>
              {weapon && weaponBonus !== null && weaponBonus !== 0 && (
                <Row label="Damage" valueClass="text-red-400 font-medium">
                  {weapon.minDamage + weaponBonus}–{weapon.maxDamage + weaponBonus}{' '}
                  <ElementTag element={weapon.damageElement} />
                </Row>
              )}
            </>
          )}
          {ability.effects.map((eff, i) => {
            const target = eff.appliesTo === 'caster' ? ' (self)' : '';
            switch (eff.type) {
              case 'damage': {
                const bonus = damageBonus(eff.damageElement);
                return (
                  <span key={i}>
                    <Row label="Base Damage" valueClass="text-gray-400">
                      {eff.minDamage}–{eff.maxDamage} <ElementTag element={eff.damageElement} />{target}
                    </Row>
                    {stats && bonus !== 0 && (
                      <Row label="Damage" valueClass="text-red-400 font-medium">
                        {eff.minDamage + bonus}–{eff.maxDamage + bonus} <ElementTag element={eff.damageElement} />{target}
                      </Row>
                    )}
                  </span>
                );
              }
              case 'dot':
                return (
                  <Row key={i} label={`DoT${target}`} valueClass="text-orange-400">
                    {eff.damagePerRound}/rnd × {eff.rounds}r <ElementTag element={eff.damageElement} />
                  </Row>
                );
              case 'heal':
                return (
                  <Row key={i} label={`Heal${target}`} valueClass="text-green-400 font-medium">
                    {eff.minHeal}–{eff.maxHeal}
                  </Row>
                );
              case 'hot':
                return (
                  <Row key={i} label={`HoT${target}`} valueClass="text-emerald-400">
                    {eff.healPerRound}/rnd × {eff.rounds}r
                  </Row>
                );
              case 'buff':
                return (
                  <Row key={i} label={`Buff${target}`} valueClass="text-yellow-300">
                    {Object.entries(eff.stats).map(([s, v]) => `+${v} ${s}`).join(', ')} × {eff.rounds}r
                  </Row>
                );
              case 'debuff':
                return (
                  <Row key={i} label={`Debuff${target}`} valueClass="text-purple-400">
                    {Object.entries(eff.stats).map(([s, v]) => `−${v} ${s}`).join(', ')} × {eff.rounds}r
                  </Row>
                );
            }
          })}
        </div>
      )}
    </div>
  );
}

// An ability, shown in the UI theme's tooltip style: name, a
// small-caps line (category · MP · target · range), then its effects as short sentences (abilitySentences), their
// key numbers highlighted. Used as a card in the character select dossier and the game's ability tooltips.
import type { Ability } from '../../data/combat/abilities';
import { PHYSICAL_ELEMENTS, type DamageElement, type WeaponItem } from '../../data/gear';
import { toAction } from '../../data/combat/abilityExecution';
import { isArea } from '../../data/combat/areas';
import { AREA_LABEL, EFFECT_TONE_COLOR, abilitySentences, type EffectTone, type Sentence } from '../../data/detailStrings';
import { DAMAGE_ELEMENT_COLOR } from '../../data/constants';

/** Wash for physical abilities: a light grey that, mixed in like an element color, just lifts the card off the panel. */
const PHYSICAL_TINT = 'var(--el-physical-wash)';

const TARGET_LABEL: Record<Ability['target'], string> = { enemy: 'Enemy', ally: 'Ally', self: 'Self', tile: 'Tile' };

/**
 * The ability's wash color: its element's, a light grey for physical damage, none without an element.
 * Weapon abilities take the weapon's element when they have none of their own. Also tints action bar slots.
 */
export function abilityTint(ability: Ability, weapon: WeaponItem | null): string | null {
  const action = toAction(ability, weapon);
  const element = abilityElement(ability) ?? (action ? abilityElement(action) : null);
  return element ? elementTint(element) : null;
}

/** An element's color as abilities show it: its own, or a light grey for physical damage. */
export const elementTint = (element: DamageElement): string => (PHYSICAL_ELEMENTS.has(element) ? PHYSICAL_TINT : DAMAGE_ELEMENT_COLOR[element]);

/**
 * `weapon`: the weapon the ability is used with, so a weapon ability takes its AP cost and element (its text describes only what it adds to the weapon).
 * `weaponAttack`: the card is the weapon's plain attack (no MP shown).
 */
export default function AbilityCard({ ability, weapon = null, weaponAttack = false, warning, elevated = false, className = '' }: {
  ability: Ability;
  weapon?: WeaponItem | null;
  weaponAttack?: boolean;
  /** A note under the effects, e.g. 'Not enough mana'. */
  warning?: string;
  /** Floats over the screen (a tooltip): cast a shadow. */
  elevated?: boolean;
  className?: string;
}) {
  const action = toAction(ability, weapon);
  const category = ability.useWeapon ? 'Weapon' : ability.attackCategory;
  const Icon = ability.icon;
  const tint = abilityTint(ability, weapon);
  const meta = [
    category,
    weaponAttack ? null : `${ability.mpCost} MP`,
    TARGET_LABEL[ability.target],
    ability.target === 'self' ? null : `Range ${ability.range}`,
    ability.area && isArea(ability) ? AREA_LABEL[ability.area] : null,
  ].filter(Boolean).join(' · ');

  return (
    <div
      className={`box-border px-3.5 py-3 text-left bg-rift-panel border border-rift-edge rounded-sm ${className}`}
      style={{
        boxShadow: elevated ? 'var(--shadow-float)' : 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
        ...(tint && {
          backgroundColor: `color-mix(in srgb, ${tint} 7%, var(--rift-panel))`,
          borderColor: `color-mix(in srgb, ${tint} 22%, var(--rift-edge))`,
        }),
      }}
    >
      <div className="flex items-center gap-2">
        {Icon && <Icon className="w-5 h-5 shrink-0 text-rift-muted" />}
        <span className="font-display text-[15px] tracking-[0.04em] text-rift-bright">{ability.name}</span>
        <ApDots count={action?.apCost ?? ability.apCost} className="!gap-[3px] -translate-y-px" />
      </div>
      <div className="mt-1 text-[11px] tracking-[0.12em] uppercase text-rift-label">{meta}</div>
      <hr className="my-3 h-px border-0 bg-rift-line" />
      <div className="flex flex-col gap-1 text-xs leading-[1.55] text-rift-soft">
        {abilitySentences(ability).map((s, i) => <EffectSentence key={i} parts={s} />)}
      </div>
      {warning && <div className="mt-2.5 text-xs text-rift-warn">{warning}</div>}
    </div>
  );
}

/** An ability's AP cost as small dots, one per action point (ability cards, after the name; action bar slots). */
export function ApDots({ count, className = '' }: { count: number; className?: string }) {
  return (
    <span role="img" aria-label={`${count} action point${count === 1 ? '' : 's'}`} className={`rf-apdots ${className}`}>
      {Array.from({ length: count }, (_, i) => <span key={i} />)}
    </span>
  );
}

/** The ability's element: its display element, else the element of its first damaging or healing effect. */
function abilityElement(ability: Ability): DamageElement | null {
  if (ability.displayElement) return ability.displayElement;
  for (const eff of ability.effects) if ((eff.type === 'damage' || eff.type === 'dot' || eff.type === 'heal' || eff.type === 'hot') && eff.damageElement) return eff.damageElement;
  return null;
}

/** One effect sentence: plain text, its highlights in their tone (or element) color. */
function EffectSentence({ parts }: { parts: Sentence }) {
  return (
    <p className="m-0">
      {parts.map((p, i) => (p.tone
        ? <span key={i} style={{ color: p.element ? DAMAGE_ELEMENT_COLOR[p.element] : EFFECT_TONE_COLOR[p.tone] }}>{p.text}</span>
        : p.text))}
    </p>
  );
}

/** One effect readout line: label left, value (in its tone, then its element) right (item tooltips). */
export function EffectRow({ label, value, tone, element }: { label: string; value: string; tone: EffectTone; element?: keyof typeof DAMAGE_ELEMENT_COLOR }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-rift-muted">{label}</span>
      <span style={{ color: EFFECT_TONE_COLOR[tone] }}>
        {value}
        {element && <span className="capitalize" style={{ color: DAMAGE_ELEMENT_COLOR[element] }}> {element}</span>}
      </span>
    </div>
  );
}

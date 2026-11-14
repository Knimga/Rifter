// The party window's Abilities tab: the selected member's class kit as compact cards, its subclass's (once picked)
// under its own headings. Passives (what each adds, by name: the stat passives, then the always-on passive effects) and
// abilities (icon, what it does in a sentence or two, its MP cost at the member's level). The list scrolls inside the panel.
import type { ReactNode } from 'react';
import type { ClassData, PlayerPassive } from '../data/units/classes';
import type { SubclassData } from '../data/units/subclasses';
import { abilityAtLevel, mpCostAt, passiveEffectAtLevel, type Ability, type PassiveEffect } from '../data/combat/abilities';
import type { WeaponItem } from '../data/gear';
import { abilityTint } from './ui/AbilityCard';
import { abilitySentences, formatPassiveValue, formatStatLabel, passiveEffectSentence, sentenceText } from '../data/detailStrings';

/** A card: the name over a one-line description. */
function KitCard({ name, desc, icon, cost, tint }: { name: string; desc: string; icon?: ReactNode; cost?: ReactNode; tint?: string | null }) {
  return (
    <div className="rf-stcard rf-abrow"
      style={tint ? {
        backgroundColor: `color-mix(in srgb, ${tint} 7%, var(--rift-void))`,
        borderColor: `color-mix(in srgb, ${tint} 22%, var(--rift-seam))`,
      } : undefined}>
      {icon}
      <div className="flex-1 min-w-0">
        <div className="rf-abname">{name}</div>
        <div className="rf-abdesc">{desc}</div>
      </div>
      {cost}
    </div>
  );
}

/** A kit's passives under one heading (`sub`: the heading's second label): its stat passives, then its passive effects. */
function PassiveCards({ sub, passives = {}, effects = [], level }: { sub: string; passives?: Record<string, PlayerPassive>; effects?: readonly PassiveEffect[]; level: number }) {
  return (
    <div>
      <h4 className="rf-abh">Passives <span className="rf-absub">{sub}</span></h4>
      <div className="flex flex-col gap-1">
        {Object.entries(passives).map(([stat, p]) => (
          <KitCard key={stat} name={p.name} desc={`${formatPassiveValue(stat, p)} ${formatStatLabel(stat)}`} />
        ))}
        {effects.map(p => (
          <KitCard key={p.name} name={p.name} desc={sentenceText(passiveEffectSentence(passiveEffectAtLevel(p, level)))} />
        ))}
      </div>
    </div>
  );
}

/** A kit's abilities under one heading (`sub`: the heading's second label), each with its MP cost at `level`. */
function AbilityCards({ sub, abilities, level, weapon }: { sub: string | number; abilities: readonly Ability[]; level: number; weapon: WeaponItem | null }) {
  return (
    <div>
      <h4 className="rf-abh">Abilities <span className="rf-absub">{sub}</span></h4>
      <div className="flex flex-col gap-1">
        {abilities.map(a => {
          const Icon = a.icon;
          const mp = mpCostAt(a, level);
          return (
            <KitCard key={a.name} name={a.name} desc={abilitySentences(abilityAtLevel(a, level)).map(sentenceText).join(' ')} tint={abilityTint(a, weapon)}
              icon={<span aria-hidden="true" className="rf-abico">{Icon && <Icon className="w-[18px] h-[18px]" />}</span>}
              cost={<span className={`rf-abcost ${mp > 0 ? '' : 'is-free'}`}>{mp > 0 ? `${mp} MP` : 'Free'}</span>} />
          );
        })}
      </div>
    </div>
  );
}

/** The class's kit, then its subclass's (once picked): what each has, under its own name. */
export default function ClassKit({ classData, subclass, level, weapon }: {
  classData: ClassData;
  subclass?: SubclassData | null;
  level: number;
  weapon: WeaponItem | null;
}) {
  const subPassives = !!subclass && (Object.keys(subclass.passives ?? {}).length > 0 || !!subclass.passiveEffects?.length);
  return (
    <div role="tabpanel" aria-label="Abilities" tabIndex={0} className="rf-abscroll flex-1 min-h-0 mt-2 pr-1 overflow-y-auto flex flex-col gap-2.5">
      <PassiveCards sub={classData.name} passives={classData.passives} effects={classData.passiveEffects} level={level} />
      {subPassives && <PassiveCards sub={subclass.name} passives={subclass.passives} effects={subclass.passiveEffects} level={level} />}
      <AbilityCards sub={classData.abilities.length} abilities={classData.abilities} level={level} weapon={weapon} />
      {!!subclass?.abilities?.length && <AbilityCards sub={subclass.name} abilities={subclass.abilities} level={level} weapon={weapon} />}
    </div>
  );
}

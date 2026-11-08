// The party window's Abilities tab: the selected member's class kit as compact cards. Passives (what each adds, by
// name: the stat passives, then the always-on passive effects) and abilities (icon, what it does in a sentence or two, its MP
// cost at the member's level). The list scrolls inside the panel.
import type { ReactNode } from 'react';
import type { ClassData } from '../data/units/classes';
import { mpCostAt } from '../data/combat/abilities';
import type { WeaponItem } from '../data/gear';
import { abilityTint } from './ui/AbilityCard';
import { abilitySentences, formatPassiveValue, formatStatLabel, passiveEffectSentences, sentenceText } from '../data/detailStrings';

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

export default function ClassKit({ classData, level, weapon }: { classData: ClassData; level: number; weapon: WeaponItem | null }) {
  return (
    <div role="tabpanel" aria-label="Abilities" tabIndex={0} className="rf-abscroll flex-1 min-h-0 mt-2 pr-1 overflow-y-auto flex flex-col gap-2.5">
      <div>
        <h4 className="rf-abh">Passives <span className="rf-absub">{classData.name}</span></h4>
        <div className="flex flex-col gap-1">
          {Object.entries(classData.passives).map(([stat, p]) => (
            <KitCard key={stat} name={p.name} desc={`${formatPassiveValue(stat, p)} ${formatStatLabel(stat)}`} />
          ))}
          {classData.passiveEffects?.map(p => (
            <KitCard key={p.name} name={p.name} desc={passiveEffectSentences(p).map(sentenceText).join(' ')} />
          ))}
        </div>
      </div>
      <div>
        <h4 className="rf-abh">Abilities <span className="rf-absub">{classData.abilities.length}</span></h4>
        <div className="flex flex-col gap-1">
          {classData.abilities.map(a => {
            const Icon = a.icon;
            const mp = mpCostAt(a, level);
            return (
              <KitCard key={a.name} name={a.name} desc={abilitySentences(a).map(sentenceText).join(' ')} tint={abilityTint(a, weapon)}
                icon={<span aria-hidden="true" className="rf-abico">{Icon && <Icon className="w-[18px] h-[18px]" />}</span>}
                cost={<span className={`rf-abcost ${mp > 0 ? '' : 'is-free'}`}>{mp > 0 ? `${mp} MP` : 'Free'}</span>} />
            );
          })}
        </div>
      </div>
    </div>
  );
}

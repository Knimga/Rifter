import { statSuffix, type AttributeKey, type BuffableStat, type DamageElement, type SkillKey } from "./stats";
import type { Effect, Passive, ScalingPassive } from "./classes";
import type { GearSlot } from "./gear";

export const AttributeTooltips: Record<AttributeKey, string> = {
    strength: "Increases melee prowess and HP",
    toughness: "Increases HP, armor, and small amount of HP regen",
    finesse: "Increases melee and ranged prowess, dodge, parry, and some initiative",
    mind: "Increases MP, magic prowess, some magic resistance, and a small amount of MP regen",
    spirit: "Increases HP and MP regen, magic resistance, healing, and provides some MP",
    speed: "Increases initiative, dodge, parry, glancing blow chance, and a small amount of movement speed"
}

export const SkillTooltips: Record<SkillKey, string> = {
    perception: "Increases initiative",
    stealth: "Reduces threat generated and slightly increases initiative",
    expertise: "For melee and ranged attacks, increases penetration and slightly increases hit and crit chance",
    spellcraft: "For magic attacks, increases penetration and slightly increases hit and crit chance",
    evasion: "Increases dodge, parry, and glancing blow chance",
    redoubt: "Increases armor gained from gear, and increases armor contribution to glancing blow chance",
    devotion: "Increases MP regen, magic resistance, and healing"
}

export const AREA_LABEL: Record<string, string> = {
    single: 'Single', blast1: 'Blast 1', blast2: 'Blast 2', line: 'Line',
};

export const ATTR_LABEL: Record<AttributeKey, string> = {
    strength: 'STRENGTH', toughness: 'TOUGHNESS', finesse: 'FINESSE',
    mind: 'MIND', spirit: 'SPIRIT', speed: 'SPEED',
};

export const SLOT_LABEL: Record<GearSlot, string> = {
    helm: 'Helm', chest: 'Chest', gloves: 'Gloves', boots: 'Boots',
    mainhand: 'Main Hand', offhand: 'Off Hand',
};

/** 'meleeCrit' → 'Melee Crit', 'hpRegen' → 'HP Regen'. */
export function formatStatLabel(key: string): string {
    return key.replace('Bonus', '').replace(/([A-Z])/g, ' $1').trim()
        .replace(/^\w/, c => c.toUpperCase())
        .replace(/^Hp\b/, 'HP').replace(/^Mp\b/, 'MP');
}

/** Signed stat modifier, e.g. '+5 Armor', '−4 Movement', '+10% Dodge'. */
export function formatModifier(stat: string, value: number, percent = false): string {
    const sign = value < 0 ? '−' : '+';
    return `${sign}${Math.abs(value)}${percent ? '%' : statSuffix(stat)} ${formatStatLabel(stat)}`;
}

export function passiveBonusText(p: Passive, key: string): string {
    const statKey = key.replace('Bonus', '');
    const label = formatStatLabel(key);
    const suffix = statSuffix(statKey);
    const parts: string[] = [];
    if (p.flat)    parts.push(`+${p.flat}${suffix}`);
    if (p.percent) parts.push(`+${p.percent}%`);
    return `${parts.join(' / ')} ${label}`;
}

export function scalingPassiveText(sp: ScalingPassive): string {
    const pct = Math.round(sp.factor * 100);
    const src = sp.source === 'level' ? 'Level' : sp.source.charAt(0).toUpperCase() + sp.source.slice(1);
    return `${pct}% of ${src} → ${formatStatLabel(sp.targetKey)}`;
}

// ─── Effect descriptions (shared by ability tooltips and the builder's ability panes) ───

export type EffectTone = 'base' | 'damage' | 'mpDamage' | 'dot' | 'heal' | 'hot' | 'buff' | 'debuff' | 'threat';

export const EFFECT_TONE_CLASS: Record<EffectTone, string> = {
    base:   'text-gray-400',
    damage: 'text-red-400 font-medium',
    mpDamage: 'text-blue-400 font-medium',
    dot:    'text-orange-400',
    heal:   'text-green-400 font-medium',
    hot:    'text-emerald-400',
    buff:   'text-yellow-300',
    debuff: 'text-purple-400',
    threat: 'text-amber-500',
};

export interface EffectLine {
    label: string;            // e.g. 'Base Damage', 'DoT', 'Heal (self)'
    value: string;            // e.g. '6–9', '3/rnd × 3r', '−4 Movement'
    element?: DamageElement;  // rendered after the value in its element color
    tone: EffectTone;
}

/**
 * Display lines for one ability effect. A non-zero `damageBonus` (the caster's offense damage
 * for this effect's element) adds a scaled "Damage" line under the base damage.
 */
export function describeEffect(eff: Effect, damageBonus = 0): EffectLine[] {
    const self = eff.appliesTo === 'caster' ? ' (self)' : '';
    const modifiers = (stats: Partial<Record<BuffableStat, number>>, percent: Partial<Record<BuffableStat, number>> = {}, negate: boolean) => [
        ...Object.entries(stats).map(([s, v]) => formatModifier(s, negate ? -Math.abs(v) : v)),
        ...Object.entries(percent).map(([s, v]) => formatModifier(s, negate ? -Math.abs(v) : v, true)),
    ].join(', ');

    switch (eff.type) {
        case 'damage': {
            const mp = eff.damagesMP ? 'MP ' : '';
            const lines: EffectLine[] = [{ label: `Base ${mp}Damage${self}`, value: `${eff.minDamage}–${eff.maxDamage}`, element: eff.damageElement, tone: 'base' }];
            if (damageBonus) lines.push({ label: `${mp}Damage${self}`, value: `${eff.minDamage + damageBonus}–${eff.maxDamage + damageBonus}`, element: eff.damageElement, tone: eff.damagesMP ? 'mpDamage' : 'damage' });
            return lines;
        }
        case 'dot':
            return [{ label: `${eff.damagesMP ? 'MP ' : ''}DoT${self}`, value: `${eff.damagePerRound}/rnd × ${eff.rounds}r`, element: eff.damageElement, tone: eff.damagesMP ? 'mpDamage' : 'dot' }];
        case 'heal':
            return [{ label: `Heal${self}`, value: `${eff.minHeal}–${eff.maxHeal}`, tone: 'heal' }];
        case 'hot':
            return [{ label: `HoT${self}`, value: `${eff.healPerRound}/rnd × ${eff.rounds}r`, element: eff.damageElement, tone: 'hot' }];
        case 'buff':
            return [{ label: `Buff${self}`, value: `${modifiers(eff.stats, eff.statsPercent, false)} × ${eff.rounds}r`, tone: 'buff' }];
        case 'debuff':
            return [{ label: `Debuff${self}`, value: `${modifiers(eff.stats, eff.statsPercent, true)} × ${eff.rounds}r`, tone: 'debuff' }];
        case 'threat':
            return [{ label: 'Threat', value: `+${eff.amount}`, tone: 'threat' }];
    }
}

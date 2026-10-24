import { statSuffix, type AttributeKey, type BuffableStat, type DamageElement, type SkillKey } from "./units/stats";
import type { Effect } from "./combat/abilities";
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
    stealth: "Reduces threat generated and slightly increases crit chance and initiative",
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

/** First letter upper-case: 'perception' → 'Perception'. A function declaration (hoisted), so stats.ts can use it at load despite the import cycle. */
export function capitalize(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Every word's first letter upper-case, the rest as typed: "mary-kate o'neil" → "Mary-Kate O'Neil". */
export function capitalizeWords(s: string): string {
    return s.replace(/(^|[\s'’-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());
}

/** 'meleeCrit' → 'Melee Crit', 'hpRegen' → 'HP Regen'. */
export function formatStatLabel(key: string): string {
    return key.replace('Bonus', '').replace(/([A-Z])/g, ' $1').trim()
        .replace(/^\w/, c => c.toUpperCase())
        .replace(/^Hp\b/, 'HP').replace(/^Mp\b/, 'MP').replace(/^Ap Max$/, 'Max AP')
        .replace(/^Threat Multiplier$/, 'Threat');
}

/**
 * A class passive's value, signed: '+5', '−15%', or both ('+3 / +10%'). Its stat's label goes beside it
 * (formatStatLabel): '−15% Threat'.
 */
export function formatPassiveValue(stat: string, p: { flat?: number; percent?: number }): string {
    return [
        p.flat ? `${formatSigned(p.flat)}${statSuffix(stat)}` : '',
        p.percent ? `${formatSigned(p.percent)}%` : '',
    ].filter(Boolean).join(' / ');
}

/** Signed stat modifier, e.g. '+5 Armor', '−4 Movement', '+10% Dodge'. */
export function formatModifier(stat: string, value: number, percent = false): string {
    return `${formatSigned(value)}${percent ? '%' : statSuffix(stat)} ${formatStatLabel(stat)}`;
}

/** A number with its sign, a typographic minus for negatives: '+1', '−2'. */
export function formatSigned(value: number): string {
    return `${value < 0 ? '−' : '+'}${Math.abs(value)}`;
}

// ─── Effect descriptions (ability cards and item tooltips) ───

export type EffectTone = 'base' | 'damage' | 'mpDamage' | 'dot' | 'heal' | 'hot' | 'buff' | 'debuff' | 'threat';

/** Effect line colors, in the UI theme's muted palette. */
/** Effect line colors (the palette's --tone-* variables, index.css). */
export const EFFECT_TONE_COLOR: Record<EffectTone, string> = {
    base: 'var(--tone-base)',
    damage: 'var(--tone-damage)',
    mpDamage: 'var(--tone-mp-damage)',
    dot: 'var(--tone-dot)',
    heal: 'var(--tone-heal)',
    hot: 'var(--tone-hot)',
    buff: 'var(--tone-buff)',
    debuff: 'var(--tone-debuff)',
    threat: 'var(--tone-threat)',
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
    // Who it lands on, when not the ability's target(s): the caster, or the caster's allies in the area
    const self = eff.appliesTo === 'caster' ? ' (self)' : eff.appliesTo === 'allies' ? ' (allies)' : '';
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
        {
            // '+10', '-50%', or both: '+10, -50%'
            const signed = (v: number, unit = '') => `${v > 0 ? '+' : '-'}${Math.abs(v)}${unit}`;
            const parts = [eff.amount ? signed(eff.amount) : '', eff.percent ? signed(eff.percent, '%') : ''].filter(Boolean);
            return [{ label: 'Threat', value: parts.join(', '), tone: 'threat' }];
        }
        case 'root':
            return [{ label: `Root${self}`, value: `Can't move × ${eff.rounds}r`, tone: 'debuff' }];
        case 'summon':
            // The creature's id, which is its name ('fungal-spore' → 'Fungal Spore'; data/units/summons.ts, not
            // imported here: it imports this module's), and how many can be out at once when more than one
            return [{
                label: 'Summon',
                value: `${capitalizeWords(eff.creature.replace(/-/g, ' '))} × ${eff.rounds}r${(eff.max ?? 1) > 1 ? ` (max ${eff.max})` : ''}`,
                tone: 'buff',
            }];
    }
}

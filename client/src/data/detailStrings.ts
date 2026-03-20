import { AttributeKey, SkillKey, statSuffix } from "./stats";
import type { Passive, ScalingPassive } from "./classes";
import type { GearSlot } from "./gear";

export const AttributeTooltips: Record<AttributeKey, string> = {
    strength: "Increases melee prowess and HP",
    toughness: "Increase HP, armor, and small amount of HP regen",
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

export function formatStatLabel(key: string): string {
    return key.replace('Bonus', '').replace(/([A-Z])/g, ' $1').trim().replace(/^\w/, c => c.toUpperCase());
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

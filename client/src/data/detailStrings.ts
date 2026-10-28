import { statSuffix, type AttributeKey, type BuffableStat, type DamageElement, type SkillKey } from "./units/stats";
import { isAttackTrigger, type Ability, type AreaType, type Effect, type TargetType, type Trigger, type TriggerEffect } from "./combat/abilities";
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
    perception: "Increases initiative, and dodge chance slightly",
    subtlety: "Reduces threat generated and slightly increases crit chance and initiative",
    expertise: "For melee and ranged attacks, increases penetration and slightly increases hit and crit chance",
    spellcraft: "For magic attacks, increases penetration and slightly increases hit and crit chance",
    evasion: "Increases dodge, parry, and glancing blow chance",
    redoubt: "Increases armor gained from gear, and increases armor contribution to glancing blow chance",
    devotion: "Increases MP regen, magic resistance, and healing"
}

/**
 * Combat's numbers behind the defensive stats' tooltips, for one unit (computed by combat's own rules,
 * attackResolution, and passed in: this module can't import it without an import cycle). Fractions, 0..1.
 */
export interface DefenseFacts {
    /** Physical damage its armor stops. */
    physicalDr: number;
    /** Magical damage its magic resistance (with a quarter of its armor) stops. */
    magicDr: number;
    /** How much less damage a glancing blow deals. */
    glancingReduction: number;
}

/** A fraction as a percentage with one decimal: 0.173 → '17.3%'. */
const pct1 = (f: number) => `${(f * 100).toFixed(1)}%`;

/** What a defensive stat's value does, for its tooltip (the party window's stat rows). */
export const StatTooltips: Partial<Record<BuffableStat, (f: DefenseFacts) => string>> = {
    armor: (f) => `Reduces physical damage taken by ${pct1(f.physicalDr)}. A quarter of it also counts toward magical defense.`,
    magicResistance: (f) => `Reduces magical damage taken by ${pct1(f.magicDr)} (with a quarter of your armor). `
        + 'Fire, ice, lightning, shadow, poison, holy and nature.',
    glancingBlow: (f) => `Chance that a hit on you is a glancing blow, dealing ${Math.round(f.glancingReduction * 100)}% less damage. `
        + 'Magic attacks never glance.',
};

export const AREA_LABEL: Record<AreaType, string> = {
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

// ─── Effect descriptions (ability cards, status markers, item tooltips) ───

export type EffectTone = 'base' | 'damage' | 'mpDamage' | 'mpRestore' | 'dot' | 'heal' | 'hot' | 'buff' | 'debuff' | 'threat';

/** Effect highlight colors (the palette's --tone-* variables, index.css). */
export const EFFECT_TONE_COLOR: Record<EffectTone, string> = {
    base: 'var(--tone-base)',
    damage: 'var(--tone-damage)',
    mpDamage: 'var(--tone-mp-damage)',
    mpRestore: 'var(--rift-mp)',
    dot: 'var(--tone-dot)',
    heal: 'var(--tone-heal)',
    hot: 'var(--tone-hot)',
    buff: 'var(--tone-buff)',
    debuff: 'var(--tone-debuff)',
    threat: 'var(--tone-threat)',
};

/** A label / value line of an item tooltip (e.g. a weapon's damage). */
export interface EffectLine {
    label: string;            // e.g. 'Base Damage'
    value: string;            // e.g. '6–9'
    element?: DamageElement;  // rendered after the value in its element color
    tone: EffectTone;
}

/**
 * A weapon's damage as item tooltip lines: its base damage, and with a non-zero `damageBonus` (the wielder's
 * offense damage for its element) the scaled damage under it.
 */
export function weaponDamageLines(eff: Extract<Effect, { type: 'damage' }>, damageBonus = 0): EffectLine[] {
    const lines: EffectLine[] = [{ label: 'Base Damage', value: `${eff.minDamage}–${eff.maxDamage}`, element: eff.damageElement, tone: 'base' }];
    if (damageBonus) lines.push({ label: 'Damage', value: `${eff.minDamage + damageBonus}–${eff.maxDamage + damageBonus}`, element: eff.damageElement, tone: 'damage' });
    return lines;
}

/**
 * A piece of an effect sentence: plain text, or a highlight (`tone`: its color; `element`: in that element's color
 * instead, e.g. the 'fire' of '6–9 fire damage').
 */
export interface TextPart { text: string; tone?: EffectTone; element?: DamageElement }
/** One effect sentence, in parts. */
export type Sentence = TextPart[];

const plain = (text: string): TextPart => ({ text });
const hl = (text: string, tone: EffectTone, element?: DamageElement): TextPart => ({ text, tone, element });
/** A sentence as plain text. */
export const sentenceText = (s: Sentence) => s.map(p => p.text).join('');
/** A sentence's first letter upper-case, and its full stop. */
const finish = (s: Sentence): Sentence => [{ ...s[0], text: capitalize(s[0].text) }, ...s.slice(1), plain('.')];

const span = (min: number, max: number) => (min === max ? `${min}` : `${min}–${max}`);
const aOrAn = (phrase: string) => `${/^[aeiou]/i.test(phrase) ? 'an' : 'a'} ${phrase}`;
const forRounds = (n: number) => `for ${n} round${n === 1 ? '' : 's'}`;
/** Phrases as a list: 'a', 'a and b', 'a, b and c'. */
const listOf = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`);
/** Parts as a list, the same way. */
const listParts = (items: TextPart[][]): TextPart[] =>
    items.flatMap((p, i) => [...(i === 0 ? [] : [plain(i === items.length - 1 ? ' and ' : ', ')]), ...p]);

/** A buff/debuff effect's stat changes, e.g. '+3 Block and -10% Armor' (debuff ones always negative); '' for none. */
function statChanges(eff: { stats?: Partial<Record<BuffableStat, number>>; statsPercent?: Partial<Record<BuffableStat, number>> }, negate: boolean): string {
    return listOf([
        ...Object.entries(eff.stats ?? {}).map(([s, v]) => formatModifier(s, negate ? -Math.abs(v) : v)),
        ...Object.entries(eff.statsPercent ?? {}).map(([s, v]) => formatModifier(s, negate ? -Math.abs(v) : v, true)),
    ]);
}

/** An amount of an element ('6–9 fire'): the number in `tone`, the element in its color. */
const amountOf = (amount: string, element: DamageElement, tone: EffectTone): TextPart[] => [hl(`${amount} `, tone), hl(element, tone, element)];

type DamageEffect = Extract<Effect, { type: 'damage' }>;

/**
 * Damage effects landing together, as one phrase: 'deals 8–10 physical and 4–5 fire damage[ to whom]'.
 * `additional`: on top of a weapon's damage ('deals 10–12 additional physical damage').
 */
function damagePhrase(effs: DamageEffect[], whom: string | null, third: boolean, additional = false): Sentence {
    const mp = !!effs[0].damagesMP;
    const amounts = effs.map((e, i) => {
        const [n, el] = amountOf(span(e.minDamage, e.maxDamage), e.damageElement, mp ? 'mpDamage' : 'damage');
        return additional && i === 0 ? [n, plain('additional '), el] : [n, el];
    });
    return [plain(third ? 'deals ' : 'deal '), ...listParts(amounts), plain(mp ? ' MP damage' : ' damage'), ...(whom ? [plain(` to ${whom}`)] : [])];
}

/**
 * What one effect does, as a phrase (no capital, no full stop), e.g. 'deals 6–9 fire damage to allies'. `whom`:
 * who gets it, or null when it goes without saying (the ability's own target). `third`: the verb in the third
 * person ('deals'; else 'deal', after '40% chance to'). `additional`: threat on top of a weapon hit's ('+15
 * additional Threat').
 */
function effectPhrase(eff: TriggerEffect, whom: string | null, third: boolean, additional = false): Sentence {
    const v = (base: string) => (third ? `${base}s` : base);
    const to = (prep: string): TextPart[] => (whom ? [plain(` ${prep} ${whom}`)] : []);
    const obj = whom ? ` ${whom}` : '';
    switch (eff.type) {
        case 'weaponAttack':
            return [plain(`${v('make')} `), hl('a weapon attack', 'damage'), plain(` against ${whom ?? 'the target'}`)];
        case 'damage':
            return damagePhrase([eff], whom, third);
        case 'dot': {
            const tone = eff.damagesMP ? 'mpDamage' : 'dot';
            return [plain(`${v('deal')} `), ...amountOf(`${eff.damagePerRound}`, eff.damageElement, tone),
                plain(`${eff.damagesMP ? ' MP' : ''} damage per round ${forRounds(eff.rounds)}`), ...to('to')];
        }
        case 'heal':
            return eff.restoresMP
                ? [plain(`${v('restore')} `), hl(`${span(eff.minHeal, eff.maxHeal)} MP`, 'mpRestore'), ...to('to')]
                : [plain(`${v('heal')}${obj} for `), hl(span(eff.minHeal, eff.maxHeal), 'heal')];
        case 'hot':
            return [plain(`${v('heal')}${obj} for `), hl(`${eff.healPerRound} per round`, 'hot'), plain(` ${forRounds(eff.rounds)}`)];
        case 'buff':
        case 'debuff': {
            const debuff = eff.type === 'debuff';
            const stats = statChanges(eff, debuff) || (debuff ? 'a debuff' : 'a buff');
            return [plain(`${v(debuff ? 'inflict' : 'grant')} `), hl(stats, debuff ? 'debuff' : 'buff'), ...to(debuff ? 'on' : 'to'), plain(` ${forRounds(eff.rounds)}`)];
        }
        case 'threat': {
            // 'gains +10 Threat', 'loses 50% Threat', 'gains +10 and +25% Threat', 'gains +10 Threat and loses 50% Threat'
            const amount = (n: number, unit: string) => `${n > 0 ? '+' : ''}${Math.abs(n)}${unit}`;
            const extra = additional ? ' additional' : '';
            const changes = [...(eff.amount ? [{ n: eff.amount, unit: '' }] : []), ...(eff.percent ? [{ n: eff.percent, unit: '%' }] : [])];
            const verb = (n: number) => plain(`${v(n > 0 ? 'gain' : 'lose')} `);
            if (changes.length === 2 && Math.sign(changes[0].n) === Math.sign(changes[1].n)) {
                return [verb(changes[0].n), hl(amount(changes[0].n, ''), 'threat'), plain(' and '), hl(`${amount(changes[1].n, '%')}${extra} Threat`, 'threat')];
            }
            return changes.flatMap((c, i) => [...(i ? [plain(' and ')] : []), verb(c.n), hl(`${amount(c.n, c.unit)}${extra} Threat`, 'threat')]);
        }
        case 'root':
            return [hl(v('root'), 'debuff'), plain(`${obj} ${forRounds(eff.rounds)}`)];
        case 'summon': {
            // The creature's id, which is its name ('fungal-spore' → 'Fungal Spore'; data/units/summons.ts, not
            // imported here: it imports this module's), and how many can be out at once when more than one
            const name = capitalizeWords(eff.creature.replace(/-/g, ' '));
            return [plain(`${v('summon')} `), hl(aOrAn(name), 'buff'), plain(` ${forRounds(eff.rounds)}${(eff.max ?? 1) > 1 ? `, up to ${eff.max} at once` : ''}`)];
        }
    }
}

// What sets a trigger off, by its event and the attack's outcome (from the bearer's side). `a` is the attack's kind
// with its article ('a melee weapon', or 'an' with no kind), `k` the kind alone ('melee weapon ', or '')
type OnText = (a: string, k: string) => string;
const ATTACKING_ON: Record<string, OnText> = {
    hit: (_, k) => `on ${aOrAn(`${k}hit`)}`, miss: (_, k) => `on ${aOrAn(`${k}miss`)}`,
    dodge: a => `when ${a} attack is dodged`, parry: a => `when ${a} attack is parried`,
    block: a => `when ${a} attack is blocked`, stopped: a => `when ${a} attack is avoided`,
};
const ATTACKED_ON: Record<string, OnText> = {
    hit: (a, k) => (k ? `when hit by ${a} attack` : 'when hit'), miss: a => `when ${a} attack misses`,
    dodge: a => `on dodging ${a} attack`, parry: a => `on parrying ${a} attack`,
    block: a => `on blocking ${a} attack`, stopped: a => `on avoiding ${a} attack`,
};
// The event's other unit (a trigger effect's 'target')
const TRIGGER_OTHER: Record<Trigger['when'], string> = {
    attacking: 'the target', attacked: 'the attacker', healing: 'the one healed', healed: 'the healer',
};

/**
 * A trigger as a sentence: what sets it off, its chance, and what it does to whom. E.g. 'For 4 rounds, on a melee
 * weapon hit, 40% chance to deal 4 poison damage per round for 3 rounds to the target.' `rounds`: how long it
 * lasts, put first. `bearer`: what to call the unit that has it ('you' on a buff the caster gets, else 'itself').
 */
export function triggerSentence(t: Trigger, rounds?: number, bearer = 'itself'): Sentence {
    const attack = isAttackTrigger(t);
    const ons = Array.isArray(t.on) ? t.on : [t.on ?? 'hit'];
    const kind = attack ? [(t.categories ?? []).join(' or '), t.weaponOnly ? 'weapon' : ''].filter(Boolean).join(' ') : '';
    const when = attack
        ? ons.map(o => (t.when === 'attacking' ? ATTACKING_ON : ATTACKED_ON)[o](kind ? aOrAn(kind) : 'an', kind ? `${kind} ` : '')).join(' or ')
        : t.when === 'healing' ? 'when healing' : 'when healed';
    const chance = t.chance !== undefined && t.chance < 100 ? t.chance : null;
    const whom = (eff: TriggerEffect) =>
        eff.appliesTo === 'caster' ? bearer : eff.appliesTo === 'source' ? (bearer === 'you' ? 'you' : 'its caster') : TRIGGER_OTHER[t.when];
    const does = t.effects.flatMap((e, i) => [...(i ? [plain(' and ')] : []), ...effectPhrase(e, whom(e), chance === null)]);
    return finish([
        plain(`${rounds !== undefined ? `${forRounds(rounds)}, ` : ''}${when}, `),
        ...(chance !== null ? [hl(`${chance}% chance`, 'buff'), plain(' to ')] : []),
        ...does,
    ]);
}

/** A trigger as plain text (status marker tooltips: the rounds left show on their own). */
export const describeTrigger = (t: Trigger): string => sentenceText(triggerSentence(t));

/** Who an ability's effect lands on: the ability's own target kind, the caster ('self'), or its allies in the area. */
type Gets = TargetType | 'allies';

/** How an area ability's sentence ends. */
const AREA_TEXT: Record<AreaType, string> = { single: '', blast1: ' in an area', blast2: ' in an area', line: ' on a line' };

/** One piece of an ability's card text: a phrase (`gets`: who it lands on), or a sentence of its own (a trigger). */
type CardPiece = { phrase: Sentence; gets: Gets; withWeapon?: boolean } | { sentence: Sentence };

/**
 * How many stacks of a buff, debuff, DoT or HoT a unit can have, when capped (maxStacks): ', stacking up to 3 times'.
 * Not said for one with a trigger (always one).
 */
const stacking = (eff: { maxStacks?: number; trigger?: unknown }) =>
    eff.maxStacks !== undefined && !eff.trigger ? [plain(`, stacking up to ${eff.maxStacks} times`)] : [];

/**
 * An ability's effects as sentences for its card, in order. Who gets an effect is named only when it isn't the
 * ability's own target. Damage effects in a row on the same units make one phrase ('deals 8–10 physical and 4–5
 * fire damage'), and a DoT or HoT right after damage or a heal joins it ('heals for 4–6, then 4 per round for 3
 * rounds'). On an area ability, the effects on the units in the area make one sentence ending in where they land
 * ('Deals 10–12 fire damage and inflicts −5% Dodge in an area.'). A weapon ability's do too, after 'Weapon attack
 * that', its damage and threat being on top of the weapon's ('Weapon attack that deals 10–12 additional physical
 * damage.', 'Weapon attack that gains +15 additional Threat.').
 */
export function abilitySentences(ability: Pick<Ability, 'target' | 'area' | 'useWeapon' | 'effects'>): Sentence[] {
    const { target, effects } = ability;
    const pieces: CardPiece[] = [];
    for (let i = 0; i < effects.length; i++) {
        const eff = effects[i];
        const gets: Gets = eff.appliesTo === 'caster' ? 'self' : eff.appliesTo === 'allies' ? 'allies' : target;
        const whom = gets === target ? null : gets === 'self' ? 'you' : gets === 'allies' ? 'allies' : gets === 'enemy' ? 'the target' : 'the ally';
        // The next effect, if it lands on the same units (its type checked by the caller)
        const next = () => (effects[i + 1]?.appliesTo === eff.appliesTo ? effects[i + 1] : undefined);
        if (eff.type === 'damage') {
            const together = [eff];
            for (let e = next(); e?.type === 'damage' && !!e.damagesMP === !!eff.damagesMP; e = next()) together.push(effects[++i] as DamageEffect);
            const phrase = damagePhrase(together, whom, true, !!ability.useWeapon);
            const dot = next();
            if (dot?.type === 'dot' && !!dot.damagesMP === !!eff.damagesMP) {
                i++;
                // Its element only when it differs from the damage's ('then 5 per round', 'then 3 poison per round')
                const sameElement = together[together.length - 1].damageElement === dot.damageElement;
                phrase.push(plain(', then '), ...(sameElement ? [hl(`${dot.damagePerRound}`, 'dot')] : amountOf(`${dot.damagePerRound}`, dot.damageElement, 'dot')),
                    plain(` per round ${forRounds(dot.rounds)}`), ...stacking(dot));
            }
            pieces.push({ phrase, gets });
            continue;
        }
        if (eff.type === 'heal' && !eff.restoresMP) {
            const phrase = effectPhrase(eff, whom, true);
            const hot = next();
            if (hot?.type === 'hot') {
                i++;
                phrase.push(plain(', then '), hl(`${hot.healPerRound} per round`, 'hot'), plain(` ${forRounds(hot.rounds)}`), ...stacking(hot));
            }
            pieces.push({ phrase, gets });
            continue;
        }
        if (eff.type === 'buff' || eff.type === 'debuff') {
            if (statChanges(eff, eff.type === 'debuff') || !eff.trigger) pieces.push({ phrase: [...effectPhrase(eff, whom, true), ...stacking(eff)], gets });
            if (eff.trigger) pieces.push({ sentence: triggerSentence(eff.trigger, eff.rounds, gets === 'self' ? 'you' : 'itself') });
            continue;
        }
        // A weapon ability's threat is on top of the hit's, and joins its sentence
        if (eff.type === 'threat' && ability.useWeapon) {
            pieces.push({ phrase: effectPhrase(eff, whom, true, true), gets, withWeapon: true });
            continue;
        }
        pieces.push({ phrase: [...effectPhrase(eff, whom, true), ...(eff.type === 'dot' || eff.type === 'hot' ? stacking(eff) : [])], gets });
    }

    // Each phrase its own sentence, unless an area's or a weapon's: those on the units hit make one
    const area = AREA_TEXT[ability.area ?? 'single'];
    const weapon = !!ability.useWeapon;
    const joins = (p: CardPiece) => 'phrase' in p && (p.gets === target || (!!area && p.gets === 'allies') || (weapon && !!p.withWeapon));
    const joined = pieces.filter(joins).map(p => (p as { phrase: Sentence }).phrase);
    if ((!area && !weapon) || (!weapon && joined.length === 0)) return pieces.map(p => ('phrase' in p ? finish(p.phrase) : p.sentence));
    const sentence = finish(weapon
        ? [plain('Weapon attack'), ...(joined.length ? [plain(' that '), ...listParts(joined)] : []), plain(area)]
        : [...listParts(joined), plain(area)]);
    const at = weapon ? 0 : pieces.findIndex(joins);
    const rest = pieces.map(p => (joins(p) ? null : 'phrase' in p ? finish(p.phrase) : p.sentence));
    return [...rest.slice(0, at), sentence, ...rest.slice(at)].filter((s): s is Sentence => s !== null);
}

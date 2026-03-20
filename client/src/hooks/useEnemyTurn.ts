import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { EnemyInstance } from '../data/enemies';
import { applyBuffToEnemy } from '../data/enemies';
import type { ZoneData } from '../data/dungeonGen';
import type { Ability, Effect } from '../data/classes';
import type { ActiveBuff, ActiveDot, BuffableStat } from '../data/stats';
import { PHYSICAL_ELEMENTS, type DamageElement } from '../data/gear';
import { DAMAGE_ELEMENT_COLOR } from '../data/constants';
import type { Stats } from '../data/stats';
import { advanceTurn, type CombatState, type Combatant } from '../data/combat';
import { computeEnemyTurn } from '../data/enemyAI';
import { getAffectedTiles } from '../data/dungeonHelpers';
import { resolveAttack } from '../data/attackResolution';
import type { FloatingText } from '../components/FloatingCombatText';

type Pos = { x: number; y: number };
type SpawnFloat = (gridX: number, gridY: number, text: string, color: FloatingText['color']) => void;

type Refs = {
  enemies: MutableRefObject<EnemyInstance[]>;
  partyPos: MutableRefObject<Pos[]>;
  partyStats: MutableRefObject<Stats[]>;
  partyHp: MutableRefObject<number[]>;
  partyThreat: MutableRefObject<number[]>;
  zone: MutableRefObject<ZoneData | null>;
  currentZone: MutableRefObject<number>;
  spawnFloat: MutableRefObject<SpawnFloat>;
};

export type EnemyAoePreview = { tiles: Set<string> };

export function useEnemyTurn(
  combat: CombatState,
  currentCombatant: Combatant | null,
  refs: Refs,
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>,
  setPartyHp: Dispatch<SetStateAction<number[]>>,
  setPartyBuffs: Dispatch<SetStateAction<ActiveBuff[][]>>,
  setCombat: Dispatch<SetStateAction<CombatState>>,
  setEnemyAoePreview: Dispatch<SetStateAction<EnemyAoePreview | null>>,
  setEnemyTargetPartyIdx: Dispatch<SetStateAction<number | null>>,
  setPartyDots: Dispatch<SetStateAction<ActiveDot[][]>>,
) {
  useEffect(() => {
    if (!combat.active || !currentCombatant || currentCombatant.isPlayer) return;

    const z = refs.zone.current;
    if (!z) return;

    const currentZoneEnemies = refs.enemies.current.filter(e => e.zoneId === z.id);
    const enemy = currentZoneEnemies.find(e => e.id === currentCombatant.id && e.currentHp > 0);
    if (!enemy) {
      const partyMovements = refs.partyStats.current.map(s => s.movement);
      setCombat(prev => advanceTurn(prev, currentZoneEnemies, partyMovements));
      return;
    }

    const partyMembers = refs.partyPos.current.map((pos, i) => ({
      pos,
      hp: refs.partyHp.current[i] ?? 0,
    }));

    const action = computeEnemyTurn(enemy, partyMembers, currentZoneEnemies, z.floors, refs.partyThreat.current);
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];

    // Phase 1 (T=1s): Execute movement
    timers.push(setTimeout(() => {
      if (cancelled) return;

      const finalPos = action.moveTo ?? enemy.pos;

      if (action.moveTo) {
        setEnemies(prev => prev.map(e =>
          e.id === enemy.id ? { ...e, pos: action.moveTo! } : e
        ));
      }

      // Determine target party indices (AoE may hit multiple members)
      let targetPartyIndices: number[] = [];
      if (action.abilityUsed && action.abilityTargetPos) {
        const ability = action.abilityUsed;
        if (ability.area && ability.area !== 'single') {
          const affectedTiles = getAffectedTiles(finalPos, action.abilityTargetPos, ability.area, z.floors);
          const affectedSet = new Set(affectedTiles.map(t => `${t.x},${t.y}`));
          targetPartyIndices = refs.partyPos.current
            .map((pos, i) => ({ pos, i }))
            .filter(({ pos }) => affectedSet.has(`${pos.x},${pos.y}`))
            .map(({ i }) => i);
        } else if (action.targetPartyIdx !== null) {
          targetPartyIndices = [action.targetPartyIdx];
        }
      }

      const advanceTurnNow = () => {
        const latestZoneEnemies = refs.enemies.current.filter(e => e.zoneId === refs.currentZone.current);
        const partyMovements = refs.partyStats.current.map(s => s.movement);
        const deadPartyIndices = new Set(
          refs.partyHp.current.map((hp, i) => hp <= 0 ? i : -1).filter(i => i >= 0)
        );
        setCombat(prev => advanceTurn(prev, latestZoneEnemies, partyMovements, deadPartyIndices));
      };

      // Phase 2 (T=2s): Show targeting indicators
      timers.push(setTimeout(() => {
        if (cancelled) return;

        if (!action.abilityUsed) {
          // No attack — advance immediately
          advanceTurnNow();
          return;
        }

        // Show single-target highlight or AoE preview
        if (action.targetPartyIdx !== null && action.abilityUsed.target === 'enemy') {
          setEnemyTargetPartyIdx(action.targetPartyIdx);
        }
        if (action.abilityUsed.area && action.abilityUsed.area !== 'single' && action.abilityTargetPos && targetPartyIndices.length > 0) {
          const affectedTiles = getAffectedTiles(finalPos, action.abilityTargetPos, action.abilityUsed.area, z.floors);
          setEnemyAoePreview({ tiles: new Set(affectedTiles.map(t => `${t.x},${t.y}`)) });
        }

        // Phase 3 (T=3s): Execute and advance
        timers.push(setTimeout(() => {
          if (cancelled) return;
          setEnemyTargetPartyIdx(null);
          setEnemyAoePreview(null);
          executeEnemyAbility(enemy, action.abilityUsed!, targetPartyIndices, finalPos, refs, setEnemies, setPartyHp, setPartyBuffs, setPartyDots);
          advanceTurnNow();
        }, 1000));
      }, 1000));
    }, 1000));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
      setEnemyAoePreview(null);
      setEnemyTargetPartyIdx(null);
    };
  }, [combat.active, combat.currentTurnIndex, currentCombatant, refs, setCombat, setEnemies, setPartyHp, setPartyBuffs, setPartyDots, setEnemyAoePreview, setEnemyTargetPartyIdx]);
}

// ─── Ability execution ────────────────────────────────────────────────────────

/** Build ActiveBuff entries from a buff/debuff Effect's stats and statsPercent fields. */
function effectToBuffs(
  eff: Extract<Effect, { type: 'buff' | 'debuff' }>,
  id: string,
  source: string,
  negate = false,
): ActiveBuff[] {
  const sign = negate ? -1 : 1;
  const buffs: ActiveBuff[] = [];
  for (const [stat, amount] of Object.entries(eff.stats) as [BuffableStat, number][]) {
    buffs.push({ id: `${id}-${stat}`, source, damageElement: eff.damageElement, stat, amount: sign * Math.abs(amount), roundsRemaining: eff.rounds });
  }
  for (const [stat, pct] of Object.entries(eff.statsPercent ?? {}) as [BuffableStat, number][]) {
    buffs.push({ id: `${id}-${stat}-pct`, source, damageElement: eff.damageElement, stat, amount: 0, percent: sign * Math.abs(pct), roundsRemaining: eff.rounds });
  }
  return buffs;
}

function executeEnemyAbility(
  enemy: EnemyInstance,
  ability: Ability,
  targetPartyIndices: number[],
  casterPos: Pos,
  refs: Pick<Refs, 'partyPos' | 'partyStats' | 'spawnFloat'>,
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>,
  setPartyHp: Dispatch<SetStateAction<number[]>>,
  setPartyBuffs: Dispatch<SetStateAction<ActiveBuff[][]>>,
  setPartyDots: Dispatch<SetStateAction<ActiveDot[][]>>,
) {
  const casterEffects = ability.effects.filter(e => e.appliesTo === 'caster');
  const targetEffects = ability.effects.filter(e => e.appliesTo === 'target');

  if (ability.target === 'self') {
    setEnemies(prev => prev.map(e => {
      if (e.id !== enemy.id) return e;
      let updated = { ...e, currentMp: Math.max(0, e.currentMp - ability.mpCost) };

      for (const eff of casterEffects) {
        if (eff.type === 'heal') {
          const roll = eff.minHeal + Math.floor(Math.random() * (eff.maxHeal - eff.minHeal + 1));
          const healAmount = Math.max(0, roll + e.stats.healing);
          updated = { ...updated, currentHp: Math.min(e.stats.hp, updated.currentHp + healAmount) };
          if (healAmount > 0) refs.spawnFloat.current(casterPos.x, casterPos.y, `+${healAmount}`, 'green');
        } else if (eff.type === 'hot') {
          updated = { ...updated, hots: [...updated.hots, {
            name: ability.name,
            damageElement: eff.damageElement,
            healPerRound: Math.floor(eff.healPerRound + e.stats.healing / 2),
            roundsRemaining: eff.rounds,
          }]};
        } else if (eff.type === 'buff') {
          for (const buff of effectToBuffs(eff, `${ability.name}-${e.id}`, ability.name)) {
            updated = applyBuffToEnemy(updated, buff);
          }
        }
      }
      return updated;
    }));
    return;
  }

  if (ability.target === 'enemy') {
    if (!ability.attackCategory) return;

    // Deduct MP once
    setEnemies(prev => prev.map(e =>
      e.id === enemy.id ? { ...e, currentMp: Math.max(0, e.currentMp - ability.mpCost) } : e
    ));

    const damageEffect = targetEffects.find(e => e.type === 'damage') as Extract<Effect, { type: 'damage' }> | undefined;
    const dotEffect    = targetEffects.find(e => e.type === 'dot')    as Extract<Effect, { type: 'dot' }>    | undefined;
    const debuffEffect = targetEffects.find(e => e.type === 'debuff') as Extract<Effect, { type: 'debuff' }> | undefined;

    const atkStats = enemy.stats[ability.attackCategory];
    const element = (damageEffect?.damageElement ?? dotEffect?.damageElement ?? 'slashing') as DamageElement;
    const attackerElStats = enemy.stats.elementalStats[element];
    const categoryDamage = (!PHYSICAL_ELEMENTS.has(element) || ability.attackCategory === 'magic')
      ? enemy.stats.magic.damage
      : atkStats.damage;
    const elementDamage = attackerElStats?.damage ?? 0;

    // Apply to each target
    for (const targetIdx of targetPartyIndices) {
      const pStats = refs.partyStats.current[targetIdx] ?? refs.partyStats.current[0];
      const pp = refs.partyPos.current[targetIdx] ?? refs.partyPos.current[0];

      const result = resolveAttack({
        hit: atkStats.hit,
        damageBonus: categoryDamage,
        critChance: atkStats.crit,
        minDamage: damageEffect?.minDamage ?? 0,
        maxDamage: damageEffect?.maxDamage ?? 0,
        damageElement: element,
        targetDodge: pStats.dodge,
        targetArmor: pStats.armor,
        targetMagicResistance: pStats.magicResistance,
        elementHit: attackerElStats?.hit,
        elementCrit: attackerElStats?.crit,
        elementDamage,
        targetElementResistance: pStats.elementalStats[element]?.resistance,
      });

      const attackerLabel = enemy.classData.name;
      const targetLabel = `Party[${targetIdx}]`;
      if (!result.hit) {
        console.log(`[Combat] ${attackerLabel} → ${targetLabel}: MISS (${element})`);
        refs.spawnFloat.current(pp.x, pp.y, 'Missed!', 'white');
      } else if (result.dodged) {
        console.log(`[Combat] ${attackerLabel} → ${targetLabel}: DODGED (${element})`);
        refs.spawnFloat.current(pp.x, pp.y, 'Dodged!', 'white');
      } else {
        const hitType = result.crit ? 'CRIT' : 'HIT';
        console.log(`[Combat] ${attackerLabel} → ${targetLabel}: ${hitType} ${result.finalDamage} (${element}) | roll=${result.weaponRoll} +cat=${categoryDamage} +el=${elementDamage} raw=${result.rawDamage} -DR=${result.damageReduction}`);
        const critText = result.crit ? ' CRIT!' : '';
        if (damageEffect) {
          refs.spawnFloat.current(pp.x, pp.y, `-${result.finalDamage}${critText}`, DAMAGE_ELEMENT_COLOR[element]);
          setPartyHp(prev => prev.map((hp, i) => i === targetIdx ? Math.max(0, hp - result.finalDamage) : hp));
        }
        if (debuffEffect) {
          const newDebuffs = effectToBuffs(debuffEffect, `${ability.name}-enemy`, ability.name, true);
          if (newDebuffs.length > 0) {
            setPartyBuffs(prev => prev.map((buffs, i) => i === targetIdx ? [...buffs, ...newDebuffs] : buffs));
          }
        }
        if (dotEffect) {
          setPartyDots(prev => prev.map((dots, i) => i === targetIdx ? [...dots, {
            name: ability.name,
            damageElement: dotEffect.damageElement,
            damagePerRound: Math.floor(dotEffect.damagePerRound + (categoryDamage + elementDamage) / 2),
            roundsRemaining: dotEffect.rounds,
          }] : dots));
        }
      }
    }
  }
}

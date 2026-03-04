import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { EnemyInstance } from '../data/enemies';
import { applyBuffToEnemy } from '../data/enemies';
import type { ZoneData } from '../data/dungeonGen';
import type { Ability, Effect } from '../data/classes';
import type { ActiveBuff, BuffableStat } from '../data/stats';
import type { DamageElement } from '../data/gear';
import type { Stats } from '../data/stats';
import { advanceTurn, type CombatState, type Combatant } from '../data/combat';
import { computeEnemyTurn } from '../data/enemyAI';
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

export function useEnemyTurn(
  combat: CombatState,
  currentCombatant: Combatant | null,
  refs: Refs,
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>,
  setPartyHp: Dispatch<SetStateAction<number[]>>,
  setPartyBuffs: Dispatch<SetStateAction<ActiveBuff[][]>>,
  setCombat: Dispatch<SetStateAction<CombatState>>,
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

    // Phase 1: Move after 1s
    timers.push(setTimeout(() => {
      if (cancelled) return;

      if (action.moveTo) {
        setEnemies(prev => prev.map(e =>
          e.id === enemy.id ? { ...e, pos: action.moveTo! } : e
        ));
        console.log(`${enemy.type.name} moves to (${action.moveTo.x}, ${action.moveTo.y})`);
      }

      // Phase 2: Action after another 1s
      timers.push(setTimeout(() => {
        if (cancelled) return;

        const targetIdx = action.targetPartyIdx ?? 0;
        if (action.abilityUsed) {
          executeEnemyAbility(enemy, action.abilityUsed, targetIdx, refs, setEnemies, setPartyHp, setPartyBuffs);
        } else if (action.targetPartyIdx !== null) {
          executeWeaponAttack(enemy, targetIdx, refs, setPartyHp);
        }

        const latestZoneEnemies = refs.enemies.current.filter(e => e.zoneId === refs.currentZone.current);
        const partyMovements = refs.partyStats.current.map(s => s.movement);
        const deadPartyIndices = new Set(
          refs.partyHp.current.map((hp, i) => hp <= 0 ? i : -1).filter(i => i >= 0)
        );
        setCombat(prev => advanceTurn(prev, latestZoneEnemies, partyMovements, deadPartyIndices));
      }, 1000));
    }, 1000));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [combat.active, combat.currentTurnIndex, currentCombatant, refs, setCombat, setEnemies, setPartyHp, setPartyBuffs]);
}

// ─── Weapon attack ────────────────────────────────────────────────────────────

function executeWeaponAttack(
  enemy: EnemyInstance,
  targetPartyIdx: number,
  refs: Pick<Refs, 'partyPos' | 'partyStats' | 'spawnFloat'>,
  setPartyHp: Dispatch<SetStateAction<number[]>>,
) {
  const atkCategory = enemy.type.weapon.attackCategory;
  const atkStats = enemy.stats[atkCategory];
  const pStats = refs.partyStats.current[targetPartyIdx] ?? refs.partyStats.current[0];
  const pp = refs.partyPos.current[targetPartyIdx] ?? refs.partyPos.current[0];

  const result = resolveAttack({
    hitBonus: atkStats.hitBonus,
    damageBonus: atkStats.damage,
    critChance: atkStats.crit,
    minDamage: enemy.type.weapon.minDamage,
    maxDamage: enemy.type.weapon.maxDamage,
    damageElement: enemy.type.weapon.damageElement,
    targetDodge: pStats.dodge,
    targetArmor: pStats.armor,
    targetMagicResistance: pStats.magicResistance,
    targetElementResistance: pStats.elementalStats[enemy.type.weapon.damageElement]?.resistance,
  });

  if (!result.hit) {
    console.log(`${enemy.type.name} missed! (${75 + atkStats.hitBonus}% hit chance)`);
    refs.spawnFloat.current(pp.x, pp.y, 'Missed!', 'white');
  } else if (result.dodged) {
    console.log(`Dodged ${enemy.type.name}'s attack! (${pStats.dodge}% dodge chance)`);
    refs.spawnFloat.current(pp.x, pp.y, 'Dodged!', 'white');
  } else {
    const critText = result.crit ? ' CRIT!' : '';
    console.log(
      `${enemy.type.name} hit party[${targetPartyIdx}] for ${result.finalDamage} damage` +
      ` (rolled ${result.weaponRoll} + ${atkStats.damage} bonus = ${result.rawDamage}${critText}, -${result.damageReduction} DR)`
    );
    refs.spawnFloat.current(pp.x, pp.y, `-${result.finalDamage}${critText}`, 'red');
    setPartyHp(prev => prev.map((hp, i) => i === targetPartyIdx ? Math.max(0, hp - result.finalDamage) : hp));
  }
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
  targetPartyIdx: number,
  refs: Pick<Refs, 'partyPos' | 'partyStats' | 'spawnFloat'>,
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>,
  setPartyHp: Dispatch<SetStateAction<number[]>>,
  setPartyBuffs: Dispatch<SetStateAction<ActiveBuff[][]>>,
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
          if (healAmount > 0) refs.spawnFloat.current(e.pos.x, e.pos.y, `+${healAmount}`, 'green');
        } else if (eff.type === 'hot') {
          updated = { ...updated, hots: [...updated.hots, {
            name: ability.name,
            damageElement: eff.damageElement,
            healPerRound: eff.healPerRound,
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
    const pStats = refs.partyStats.current[targetPartyIdx] ?? refs.partyStats.current[0];
    const pp = refs.partyPos.current[targetPartyIdx] ?? refs.partyPos.current[0];

    const damageEffect = targetEffects.find(e => e.type === 'damage') as Extract<Effect, { type: 'damage' }> | undefined;
    const dotEffect    = targetEffects.find(e => e.type === 'dot')    as Extract<Effect, { type: 'dot' }>    | undefined;
    const debuffEffect = targetEffects.find(e => e.type === 'debuff') as Extract<Effect, { type: 'debuff' }> | undefined;

    let atkStats: { hitBonus: number; damage: number; crit: number };
    let minDmg: number, maxDmg: number;
    let element = (damageEffect?.damageElement ?? dotEffect?.damageElement ?? 'slashing') as DamageElement;

    if (ability.useWeapon) {
      const cat = enemy.type.weapon.attackCategory;
      atkStats = enemy.stats[cat];
      minDmg = enemy.type.weapon.minDamage;
      maxDmg = enemy.type.weapon.maxDamage;
      element = enemy.type.weapon.damageElement;
    } else if (ability.attackCategory) {
      atkStats = enemy.stats[ability.attackCategory];
      minDmg = damageEffect?.minDamage ?? 0;
      maxDmg = damageEffect?.maxDamage ?? 0;
    } else {
      return;
    }

    const result = resolveAttack({
      hitBonus: atkStats.hitBonus,
      damageBonus: atkStats.damage,
      critChance: atkStats.crit,
      minDamage: minDmg,
      maxDamage: maxDmg,
      damageElement: element,
      targetDodge: pStats.dodge,
      targetArmor: pStats.armor,
      targetMagicResistance: pStats.magicResistance,
      targetElementResistance: pStats.elementalStats[element]?.resistance,
    });

    if (!result.hit) {
      refs.spawnFloat.current(pp.x, pp.y, 'Missed!', 'white');
    } else if (result.dodged) {
      refs.spawnFloat.current(pp.x, pp.y, 'Dodged!', 'white');
    } else {
      const critText = result.crit ? ' CRIT!' : '';
      if (damageEffect || ability.useWeapon) {
        refs.spawnFloat.current(pp.x, pp.y, `-${result.finalDamage}${critText}`, 'red');
        setPartyHp(prev => prev.map((hp, i) => i === targetPartyIdx ? Math.max(0, hp - result.finalDamage) : hp));
      }
      if (debuffEffect) {
        const newDebuffs = effectToBuffs(debuffEffect, `${ability.name}-enemy`, ability.name, true);
        if (newDebuffs.length > 0) {
          setPartyBuffs(prev => prev.map((buffs, i) => i === targetPartyIdx ? [...buffs, ...newDebuffs] : buffs));
        }
      }
      if (dotEffect) {
        setEnemies(prev => prev.map(e =>
          e.id === enemy.id ? { ...e, dots: [...e.dots, {
            name: ability.name,
            damageElement: dotEffect.damageElement,
            damagePerRound: dotEffect.damagePerRound,
            roundsRemaining: dotEffect.rounds,
          }]} : e
        ));
      }
    }

    setEnemies(prev => prev.map(e =>
      e.id === enemy.id ? { ...e, currentMp: Math.max(0, e.currentMp - ability.mpCost) } : e
    ));
  }
}

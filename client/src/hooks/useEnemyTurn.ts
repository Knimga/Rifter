import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { EnemyInstance } from '../data/enemies';
import { applyBuffToEnemy } from '../data/enemies';
import type { ZoneData } from '../data/dungeonGen';
import type { Stats, ActiveBuff, Ability } from '../data/classes';
import { advanceTurn, type CombatState, type Combatant } from '../data/combat';
import { computeEnemyTurn } from '../data/enemyAI';
import { resolveAttack } from '../data/attackResolution';
import type { FloatingText } from '../components/FloatingCombatText';

type SpawnFloat = (gridX: number, gridY: number, text: string, color: FloatingText['color']) => void;

type Refs = {
  enemies: MutableRefObject<EnemyInstance[]>;
  playerPos: MutableRefObject<{ x: number; y: number }>;
  stats: MutableRefObject<Stats>;
  zone: MutableRefObject<ZoneData | null>;
  currentZone: MutableRefObject<number>;
  spawnFloat: MutableRefObject<SpawnFloat>;
};

export function useEnemyTurn(
  combat: CombatState,
  currentCombatant: Combatant | null,
  refs: Refs,
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>,
  setPlayerHp: Dispatch<SetStateAction<number>>,
  setPlayerBuffs: Dispatch<SetStateAction<ActiveBuff[]>>,
  setCombat: Dispatch<SetStateAction<CombatState>>,
) {
  useEffect(() => {
    if (!combat.active || !currentCombatant || currentCombatant.isPlayer) return;

    const z = refs.zone.current;
    if (!z) return;

    const currentZoneEnemies = refs.enemies.current.filter(e => e.zoneId === z.id);
    const enemy = currentZoneEnemies.find(e => e.id === currentCombatant.id && e.currentHp > 0);
    if (!enemy) {
      setCombat(prev => advanceTurn(prev, currentZoneEnemies, refs.stats.current.movement));
      return;
    }

    const action = computeEnemyTurn(enemy, refs.playerPos.current, currentZoneEnemies, z.floors);
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

        if (action.abilityUsed) {
          executeEnemyAbility(enemy, action.abilityUsed, refs, setEnemies, setPlayerHp, setPlayerBuffs);
        } else if (action.attackPlayer) {
          executeWeaponAttack(enemy, refs, setPlayerHp);
        }

        const latestZoneEnemies = refs.enemies.current.filter(e => e.zoneId === refs.currentZone.current);
        setCombat(prev => advanceTurn(prev, latestZoneEnemies, refs.stats.current.movement));
      }, 1000));
    }, 1000));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [combat.active, combat.currentTurnIndex, currentCombatant, refs, setCombat, setEnemies, setPlayerHp, setPlayerBuffs]);
}

// ─── Weapon attack ────────────────────────────────────────────────────────────

function executeWeaponAttack(
  enemy: EnemyInstance,
  refs: Pick<Refs, 'playerPos' | 'stats' | 'spawnFloat'>,
  setPlayerHp: Dispatch<SetStateAction<number>>,
) {
  const atkCategory = enemy.type.weapon.attackCategory;
  const atkStats = enemy.stats[atkCategory];
  const pStats = refs.stats.current;

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
  });

  const pp = refs.playerPos.current;
  if (!result.hit) {
    console.log(`${enemy.type.name} missed you! (${75 + atkStats.hitBonus}% hit chance)`);
    refs.spawnFloat.current(pp.x, pp.y, 'Missed!', 'white');
  } else if (result.dodged) {
    console.log(`You dodged ${enemy.type.name}'s attack! (${pStats.dodge}% dodge chance)`);
    refs.spawnFloat.current(pp.x, pp.y, 'Dodged!', 'white');
  } else {
    const critText = result.crit ? ' CRIT!' : '';
    console.log(
      `${enemy.type.name} hit you for ${result.finalDamage} damage` +
      ` (rolled ${result.weaponRoll} + ${atkStats.damage} bonus = ${result.rawDamage}${critText}, -${result.damageReduction} DR)`
    );
    refs.spawnFloat.current(pp.x, pp.y, `-${result.finalDamage}${critText}`, 'red');
    setPlayerHp(prev => Math.max(0, prev - result.finalDamage));
  }
}

// ─── Ability execution ────────────────────────────────────────────────────────

function executeEnemyAbility(
  enemy: EnemyInstance,
  ability: Ability,
  refs: Pick<Refs, 'playerPos' | 'stats' | 'spawnFloat'>,
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>,
  setPlayerHp: Dispatch<SetStateAction<number>>,
  setPlayerBuffs: Dispatch<SetStateAction<ActiveBuff[]>>,
) {
  if (ability.target === 'self') {
    setEnemies(prev => prev.map(e => {
      if (e.id !== enemy.id) return e;
      let updated = { ...e, currentMp: Math.max(0, e.currentMp - ability.mpCost) };

      if (ability.heal) {
        const { minHeal, maxHeal } = ability.heal;
        const roll = minHeal + Math.floor(Math.random() * (maxHeal - minHeal + 1));
        const healAmount = Math.max(0, roll + e.stats.healing);
        updated = { ...updated, currentHp: Math.min(e.stats.hp, updated.currentHp + healAmount) };
        if (healAmount > 0) refs.spawnFloat.current(e.pos.x, e.pos.y, `+${healAmount}`, 'green');
      }
      if (ability.hot) {
        updated = { ...updated, hots: [...updated.hots, {
          healPerRound: ability.hot.healPerRound,
          roundsRemaining: ability.hot.rounds,
        }]};
      }
      if (ability.buff) {
        updated = applyBuffToEnemy(updated, {
          id: `${ability.name}-${e.id}`,
          stat: ability.buff.stat,
          amount: ability.buff.amount,
          roundsRemaining: ability.buff.rounds,
        });
      }
      return updated;
    }));
    return;
  }

  if (ability.target === 'enemy') {
    let atkStats: { hitBonus: number; damage: number; crit: number };
    let minDmg: number, maxDmg: number;
    let element = (ability.damage?.damageElement ?? ability.dot?.damageElement ?? 'slashing') as import('../data/gear').DamageElement;

    if (ability.useWeapon) {
      const cat = enemy.type.weapon.attackCategory;
      atkStats = enemy.stats[cat];
      minDmg = enemy.type.weapon.minDamage;
      maxDmg = enemy.type.weapon.maxDamage;
      element = enemy.type.weapon.damageElement;
    } else if (ability.attackCategory) {
      atkStats = enemy.stats[ability.attackCategory];
      minDmg = ability.damage?.minDamage ?? 0;
      maxDmg = ability.damage?.maxDamage ?? 0;
    } else {
      return;
    }

    const pStats = refs.stats.current;
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
    });

    const pp = refs.playerPos.current;
    if (!result.hit) {
      refs.spawnFloat.current(pp.x, pp.y, 'Missed!', 'white');
    } else if (result.dodged) {
      refs.spawnFloat.current(pp.x, pp.y, 'Dodged!', 'white');
    } else {
      const critText = result.crit ? ' CRIT!' : '';
      if (ability.damage || ability.useWeapon) {
        refs.spawnFloat.current(pp.x, pp.y, `-${result.finalDamage}${critText}`, 'red');
        setPlayerHp(prev => Math.max(0, prev - result.finalDamage));
      }
      if (ability.debuff) {
        setPlayerBuffs(prev => [...prev, {
          id: `${ability.name}-enemy-debuff`,
          stat: ability.debuff!.stat,
          amount: -Math.abs(ability.debuff!.amount),
          roundsRemaining: ability.debuff!.rounds,
        }]);
      }
    }

    setEnemies(prev => prev.map(e =>
      e.id === enemy.id ? { ...e, currentMp: Math.max(0, e.currentMp - ability.mpCost) } : e
    ));
  }
}

import { useEffect, type MutableRefObject, type Dispatch, type SetStateAction } from 'react';
import type { EnemyInstance } from '../data/enemies';
import type { ZoneData } from '../data/dungeonGen';
import type { Stats } from '../data/classes';
import { advanceTurn, type CombatState, type Combatant } from '../data/combat';
import { computeEnemyTurn } from '../data/enemyAI';
import { resolveAttack } from '../data/attackResolution';
import type { FloatingText } from '../components/FloatingCombatText';

type SpawnFloat = (gridX: number, gridY: number, text: string, color: FloatingText['color']) => void;

export function useEnemyTurn(
  combat: CombatState,
  currentCombatant: Combatant | null,
  refs: {
    enemies: MutableRefObject<EnemyInstance[]>;
    playerPos: MutableRefObject<{ x: number; y: number }>;
    stats: MutableRefObject<Stats>;
    zone: MutableRefObject<ZoneData | null>;
    currentZone: MutableRefObject<number>;
    spawnFloat: MutableRefObject<SpawnFloat>;
  },
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>,
  setPlayerHp: Dispatch<SetStateAction<number>>,
  setCombat: Dispatch<SetStateAction<CombatState>>,
) {
  useEffect(() => {
    if (!combat.active || !currentCombatant || currentCombatant.isPlayer) return;

    const z = refs.zone.current;
    if (!z) return;

    const currentZoneEnemies = refs.enemies.current.filter(e => e.zoneId === z.id);
    const enemy = currentZoneEnemies.find(e => e.id === currentCombatant.id && e.currentHp > 0);
    if (!enemy) {
      // Dead enemy — skip turn immediately
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

      // Phase 2: Attack after another 1s
      timers.push(setTimeout(() => {
        if (cancelled) return;

        if (action.attackPlayer) {
          const atkCategory = enemy.type.weapon.attackCategory;
          const atkStats = enemy.type.stats[atkCategory];
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

        // Advance to next turn
        const latestZoneEnemies = refs.enemies.current.filter(e => e.zoneId === refs.currentZone.current);
        setCombat(prev => advanceTurn(prev, latestZoneEnemies, refs.stats.current.movement));
      }, 1000));
    }, 1000));

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [combat.active, combat.currentTurnIndex, currentCombatant, refs, setCombat, setEnemies, setPlayerHp]);
}

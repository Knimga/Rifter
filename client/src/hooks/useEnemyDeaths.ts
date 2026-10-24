// Enemy deaths, whatever the cause (a hit, a DoT tick, anything): each dead enemy is handed to `onDeaths` once,
// for its XP and its loot. Summoned creatures don't count, on either side: a summon is a spell effect. Enemy
// ids repeat between dungeons: resetDeaths forgets the ones handled (on a new dungeon).
import { useCallback, useEffect, useRef } from 'react';
import type { EnemyInstance } from '../data/units/enemies';
import { useLatest } from './useLatest';

export function useEnemyDeaths(enemies: EnemyInstance[], onDeaths: (dead: EnemyInstance[]) => void): () => void {
  const handled = useRef(new Set<string>());
  const onDeathsRef = useLatest(onDeaths);
  useEffect(() => {
    const dead = enemies.filter(e => e.currentHp <= 0 && !e.summon && !handled.current.has(e.id));
    if (dead.length === 0) return;
    for (const e of dead) handled.current.add(e.id);
    onDeathsRef.current(dead);
  }, [enemies, onDeathsRef]);
  return useCallback(() => handled.current.clear(), []);
}

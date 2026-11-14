// Auras (data/combat/auras.ts) kept in step with the map: whenever anyone moves, falls, joins the fight or leaves it, or
// an aura comes or goes, who is inside whose aura is worked out again, and the effects of the auras written on or taken
// off those units (as tagged entries in their buffs, HoTs and DoTs: syncAuraEffects). Nothing else in the game needs to
// know a unit moved: its stats, ticks and markers follow its lists.
import { useEffect, type Dispatch, type SetStateAction } from 'react';
import { auraSources, auraWants, syncAuraEffects, type AuraUnit } from '../data/combat/auras';
import { unitKey } from '../data/combat/abilityExecution';
import { bodyOf, isAlly, withEnemyBuffs, type EnemyInstance } from '../data/units/enemies';
import type { MemberState } from '../data/units/party';
import type { Stats } from '../data/units/stats';
import type { Pos } from '../data/world/grid';
import { useLatest } from './useLatest';

export function useAuras({ members, partyPositions, partyStats, currentZone, enemies, updateMembers, setEnemies }: {
  members: MemberState[];
  /** Where each member stands (the leader's first). */
  partyPositions: Pos[];
  partyStats: Stats[];
  /** The zone the party is in: only its creatures are in the auras (the others wait, untouched). */
  currentZone: number;
  enemies: EnemyInstance[];
  updateMembers: (fn: (m: MemberState, i: number) => MemberState, only?: (i: number) => boolean) => void;
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>;
}) {
  // The positions array is new each render: the effect follows where the members stand (their key), not it
  const positions = useLatest(partyPositions);
  const placeKey = partyPositions.map(p => `${p.x},${p.y}`).join('|');
  useEffect(() => {
    // The living, the party's first (the first bearer that reaches a unit is the one its effects come from)
    const units: AuraUnit[] = [
      ...members.flatMap((m, i): AuraUnit[] => {
        const pos = positions.current[i];
        if (m.hp <= 0 || !pos) return [];
        const key = unitKey({ side: 'party', idx: i });
        return [{ key, side: 'party', body: { pos }, zone: currentZone, level: partyStats[i]?.level ?? 1, healing: partyStats[i]?.healing ?? 0, threatKey: key, auras: auraSources(m.buffs) }];
      }),
      ...enemies.filter(e => e.zoneId === currentZone && e.currentHp > 0).map((e): AuraUnit => ({
        key: e.id, side: isAlly(e) ? 'party' : 'enemy', body: bodyOf(e), zone: e.zoneId, level: e.stats.level, healing: e.stats.healing,
        threatKey: isAlly(e) ? e.id : undefined, auras: auraSources(e.buffs),
      })),
    ];
    const wants = auraWants(units);

    // Each list a sync leaves as it was stays the same array (and a unit with none changed the same object): no redraw
    updateMembers((m, i) => {
      const next = syncAuraEffects(m, wants.get(unitKey({ side: 'party', idx: i })));
      return next.buffs === m.buffs && next.hots === m.hots && next.dots === m.dots ? m : { ...m, ...next };
    });
    setEnemies(prev => {
      let changed = false;
      const next = prev.map(e => {
        if (e.zoneId !== currentZone) return e;
        const synced = syncAuraEffects(e, e.currentHp > 0 ? wants.get(e.id) : undefined);
        if (synced.buffs === e.buffs && synced.hots === e.hots && synced.dots === e.dots) return e;
        changed = true;
        const { hots, dots } = synced;
        if (synced.buffs === e.buffs) return { ...e, hots, dots };
        // Its stats follow its buffs; its HP and MP stay within them
        const buffed = withEnemyBuffs({ ...e, hots, dots }, synced.buffs);
        return { ...buffed, currentHp: Math.min(buffed.currentHp, buffed.stats.hp), currentMp: Math.min(buffed.currentMp, buffed.stats.mp) };
      });
      return changed ? next : prev;
    });
  }, [members, placeKey, partyStats, currentZone, enemies, updateMembers, setEnemies]); // eslint-disable-line react-hooks/exhaustive-deps -- positions, by their key
}

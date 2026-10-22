// Landing an action's outcome (executeAction), for party members and enemies alike: the caster first turns to
// face the tile it aimed at (view state), then floats, HP/MP and effect changes, loot for enemies it killed,
// and threat. Outcomes still waiting for the caster's turn are cancelled on a location change.
import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { AIM_TURN_LEAD_MS } from '../data/constants';
import { unitKey, type ActionOutcome, type CombatUnit, type UnitChange } from '../data/abilityExecution';
import type { CombatState } from '../data/combat';
import { posKey, samePos, type Pos } from '../data/dungeonHelpers';
import type { DungeonData, ZoneData } from '../data/dungeonGen';
import { withEnemyBuffs, type EnemyInstance } from '../data/enemies';
import { generateLootDrop, type Item } from '../data/gear';
import type { MemberState } from '../data/party';
import type { Stats } from '../data/stats';
import type { UnitAim } from '../components/ModelLayer';
import type { SpawnFloat } from './useFloatingText';
import { useLatest } from './useLatest';

/** Land an outcome; returns the delay (ms) before it lands (the caster turning toward its target first). */
export type ApplyOutcome = (outcome: ActionOutcome, caster: CombatUnit, aimAt?: Pos) => number;

export function useActionOutcomes({ spawnFloat, updateMembers, partyStatsRef, enemiesRef, dungeonRef, setEnemies, setCombat, updateCurrentZone, partyCanUse }: {
  spawnFloat: SpawnFloat;
  updateMembers: (fn: (m: MemberState, i: number) => MemberState, only?: (i: number) => boolean) => void;
  partyStatsRef: MutableRefObject<Stats[]>;
  enemiesRef: MutableRefObject<EnemyInstance[]>;
  dungeonRef: MutableRefObject<DungeonData | null>;
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>;
  setCombat: Dispatch<SetStateAction<CombatState>>;
  /** Change the current zone (its dropped loot). */
  updateCurrentZone: (fn: (z: ZoneData) => ZoneData) => void;
  /** Whether someone in the party can use an item (drops favour those). */
  partyCanUse: (item: Item) => boolean;
}) {
  // Where each unit last aimed an ability (unit id → tile + sequence): its model turns to face it
  const [unitAims, setUnitAims] = useState<Record<string, UnitAim>>({});
  const aimSeq = useRef(0);
  // Outcomes waiting for their caster to finish turning toward the target
  const pending = useRef(new Set<ReturnType<typeof setTimeout>>());
  const cancelPendingOutcomes = useCallback(() => {
    pending.current.forEach(clearTimeout);
    pending.current.clear();
  }, []);
  useEffect(() => cancelPendingOutcomes, [cancelPendingOutcomes]);

  /** An action's effects: floating text, HP/MP/effect changes on party and enemies, loot, threat. */
  const landOutcome = useCallback((outcome: ActionOutcome, caster: CombatUnit) => {
    for (const f of outcome.floats) spawnFloat(f.pos.x, f.pos.y, f.text, f.color);

    const partyChanges = new Map<number, UnitChange>();
    const enemyChanges = new Map<string, UnitChange>();
    for (const c of outcome.changes) {
      if (c.ref.side === 'party') partyChanges.set(c.ref.idx, c);
      else enemyChanges.set(c.ref.id, c);
    }
    const nextHp = (hp: number, c: UnitChange, maxHp: number) => Math.max(0, Math.min(maxHp, hp - c.damage + c.heal));

    if (partyChanges.size > 0) {
      const add = <T,>(list: T[], more: T[]) => (more.length ? [...list, ...more] : list);
      updateMembers((m, i) => {
        const c = partyChanges.get(i)!;
        return {
          hp: nextHp(m.hp, c, partyStatsRef.current[i]?.hp ?? m.hp),
          mp: Math.max(0, m.mp - c.mpSpent),
          buffs: add(m.buffs, c.buffs),
          hots: add(m.hots, c.hots),
          dots: add(m.dots, c.dots),
        };
      }, i => partyChanges.has(i));
    }

    if (enemyChanges.size > 0) {
      // Loot for enemies killed by this action
      const d = dungeonRef.current;
      const newDrops: Record<string, Item[]> = {};
      for (const e of enemiesRef.current) {
        const c = enemyChanges.get(e.id);
        if (!d || !c || e.currentHp <= 0 || nextHp(e.currentHp, c, e.stats.hp) > 0) continue;
        // Favouring what someone in the party can use
        const item = generateLootDrop(d.baseEnemyLevel, e.classData.dropChance, partyCanUse);
        if (item) {
          const key = posKey(e.pos);
          newDrops[key] = [...(newDrops[key] ?? []), item];
        }
      }
      if (Object.keys(newDrops).length > 0) {
        updateCurrentZone(z => {
          const merged = { ...z.droppedItems };
          for (const [k, items] of Object.entries(newDrops)) merged[k] = [...(merged[k] ?? []), ...items];
          return { ...z, droppedItems: merged };
        });
      }

      setEnemies(prev => prev.map(e => {
        const c = enemyChanges.get(e.id);
        if (!c) return e;
        const next = c.buffs.length ? withEnemyBuffs(e, [...e.buffs, ...c.buffs]) : e;
        return {
          ...next,
          currentHp: nextHp(e.currentHp, c, next.stats.hp),
          currentMp: Math.max(0, e.currentMp - c.mpSpent),
          hots: [...e.hots, ...c.hots],
          dots: [...e.dots, ...c.dots],
        };
      }));
    }

    if (caster.ref.side === 'party' && outcome.threat > 0) {
      const idx = caster.ref.idx;
      const gained = outcome.threat * caster.stats.threatMultiplier;
      setCombat(prev => prev.active
        ? { ...prev, partyThreat: prev.partyThreat.map((t, i) => i === idx ? t + gained : t) }
        : prev);
    }
  }, [spawnFloat, updateCurrentZone, updateMembers]); // eslint-disable-line react-hooks/exhaustive-deps
  const landRef = useLatest(landOutcome);

  /**
   * Resolve an action. When it is aimed at another tile, the caster's model first turns to face it (view
   * state only), and the outcome lands AIM_TURN_LEAD_MS later, once the turn is done. Returns the delay (ms)
   * before the outcome lands, so callers can wait for it.
   */
  const applyActionOutcome = useCallback<ApplyOutcome>((outcome, caster, aimAt) => {
    if (!aimAt || samePos(aimAt, caster.pos)) {
      landRef.current(outcome, caster);
      return 0;
    }
    const id = unitKey(caster.ref);
    aimSeq.current += 1;
    const seq = aimSeq.current;
    setUnitAims(prev => ({ ...prev, [id]: { x: aimAt.x, y: aimAt.y, seq } }));
    const timer = setTimeout(() => {
      pending.current.delete(timer);
      landRef.current(outcome, caster);
    }, AIM_TURN_LEAD_MS);
    pending.current.add(timer);
    return AIM_TURN_LEAD_MS;
  }, [landRef]);
  // For the enemy turn (useEnemyTurn), which reads it from a ref
  const applyOutcomeRef = useLatest(applyActionOutcome);

  return { unitAims, applyActionOutcome, applyOutcomeRef, cancelPendingOutcomes };
}

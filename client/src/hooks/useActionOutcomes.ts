// Landing an action's outcome (executeAction), for party members and creatures alike: the caster first turns to
// face the tile it aimed at (view state), then floats, HP/MP and effect changes,
// threat, and creatures it summons. Outcomes still waiting for the caster's turn are cancelled on a location change.
import { useCallback, useEffect, useRef, useState, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import { AIM_TURN_LEAD_MS } from '../data/constants';
import { applyThreatChange, changesThreat, threatKey, unitKey, type ActionOutcome, type CombatUnit, type UnitChange } from '../data/combat/abilityExecution';
import { joinCombat, type CombatState } from '../data/combat/combat';
import { findOpenTilesNear, posKey, samePos, type Pos } from '../data/world/grid';
import { isFreeFloor, type DungeonData } from '../data/world/dungeonGen';
import { withEnemyBuffs, type EnemyInstance } from '../data/units/enemies';
import { createSummon, isSummonOf } from '../data/units/summons';
import type { MemberState } from '../data/units/party';
import type { Stats } from '../data/units/stats';
import type { UnitAim } from '../components/ModelLayer';
import type { SpawnFloat } from './useFloatingText';
import { useLatest } from './useLatest';

/** Land an outcome; returns the delay (ms) before it lands (the caster turning toward its target first). */
export type ApplyOutcome = (outcome: ActionOutcome, caster: CombatUnit, aimAt?: Pos) => number;

/** How far from its summoner (tiles) a summoned creature may appear, when the tiles around are taken. */
const SUMMON_MAX_RADIUS = 3;

export function useActionOutcomes({ spawnFloat, updateMembers, partyStatsRef, partyPosRef, partyLevelRef, enemiesRef, dungeonRef, currentZoneRef, setEnemies, setCombat }: {
  spawnFloat: SpawnFloat;
  updateMembers: (fn: (m: MemberState, i: number) => MemberState, only?: (i: number) => boolean) => void;
  partyStatsRef: MutableRefObject<Stats[]>;
  partyPosRef: MutableRefObject<Pos[]>;
  /** The party's level: a summoned creature's. */
  partyLevelRef: MutableRefObject<number>;
  enemiesRef: MutableRefObject<EnemyInstance[]>;
  dungeonRef: MutableRefObject<DungeonData | null>;
  currentZoneRef: MutableRefObject<number>;
  setEnemies: Dispatch<SetStateAction<EnemyInstance[]>>;
  setCombat: Dispatch<SetStateAction<CombatState>>;
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

  /** An action's effects: floating text, HP/MP/effect changes on party and enemies, threat, summons. */
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

    // (An enemy this kills drops its loot and gives its XP where every death is handled: useEnemyDeaths)
    if (enemyChanges.size > 0) {
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

    // Threat, for a party-side caster (party member or summoned ally)
    const key = threatKey(caster);
    if (key && changesThreat(outcome.threat)) {
      const mult = caster.stats.threatMultiplier;
      setCombat(prev => prev.active
        ? { ...prev, threat: { ...prev.threat, [key]: applyThreatChange(prev.threat[key] ?? 0, outcome.threat, mult) } }
        : prev);
    }

    // Summoned creatures: each replaces the caster's last one from the same ability, appears on its aimed tile
    // (or the free tile nearest the caster) and joins the turn order (party members summon, in a dungeon fight)
    const d = dungeonRef.current;
    if (outcome.summons && caster.ref.side === 'party' && d) {
      const ownerIdx = caster.ref.idx;
      const zone = d.zones[currentZoneRef.current];
      let creatures = enemiesRef.current;
      const added: EnemyInstance[] = [];
      for (const req of outcome.summons) {
        creatures = creatures.filter(e => !isSummonOf(e, ownerIdx, req.ability));
        const partyTiles = new Set(partyPosRef.current.map(posKey));
        const free = isFreeFloor(d, zone, [...creatures, ...added]);
        const isOpen = (p: Pos) => free(p) && !partyTiles.has(posKey(p));
        // On the aimed tile (a 'tile' ability), or the nearest free one to it if something moved there meanwhile;
        // otherwise beside the caster
        const pos = req.at && isOpen(req.at) ? req.at : findOpenTilesNear(req.at ?? caster.pos, isOpen, 1, SUMMON_MAX_RADIUS)[0];
        const summon = pos && createSummon(req, ownerIdx, partyLevelRef.current, pos, zone.id);
        if (summon) added.push(summon);
      }
      const replaced = new Set(enemiesRef.current.filter(e => !creatures.includes(e)).map(e => e.id));
      setEnemies(prev => [...prev.filter(e => !replaced.has(e.id)), ...added]);
      setCombat(prev => prev.active ? joinCombat(prev, added) : prev);
    }
  }, [spawnFloat, updateMembers]); // eslint-disable-line react-hooks/exhaustive-deps
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

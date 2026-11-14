// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// TEMP: FOR TESTING ONLY. Not part of the game: delete this folder (devtools/), the `record(...)` /
// `useRecordFightEnd(...)` lines in the game's code (search "runRecorder") and the Recording button in
// components/DevToolsWindow.tsx once balance testing is done.
//
// The run recorder: the testing window's "Start recording" begins a session with a snapshot of the party (class,
// level, every stat, gear with its affixes, action bars: runDescribe.ts), and until "Stop recording" the game reports
// what happens (each fight's start with its creatures' stats, every action with its rolls and the HP before and
// after, each turn's ticks, kills, each fight's end). Stopping downloads it all as one JSON file (the snapshot, then
// one event per line) to hand over for balancing.
//
// Everything about writing it lives here and in runDescribe.ts. The game only calls `record(kind, () => data)`: the
// data is built inside the callback, so nothing is computed while no recording runs. This file imports game TYPES
// only (the game imports it, so it must not import game code back); runDescribe.ts, which reads game values, is
// imported by the game screen alone.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { Ability } from '../data/combat/abilities';
import type { ActionOutcome, CombatUnit, UnitRef } from '../data/combat/abilityExecution';
import type { ActiveBuff } from '../data/units/stats';

// ─── The session ─────────────────────────────────────────────────────────────

interface Session {
  startedAt: number;
  snapshot: unknown;
  events: Record<string, unknown>[];
  /** Creature classes whose abilities are already written (each one once: firstOfClass). */
  classesListed: Set<string>;
}

let session: Session | null = null;
const listeners = new Set<() => void>();
const changed = () => listeners.forEach((l) => l());

export const isRecording = () => session !== null;

/** Re-render when a recording starts or stops (the buttons' red dots). */
export function useIsRecording(): boolean {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, isRecording);
}

/** Begin a recording with `snapshot` (the party as it is: runDescribe.ts describeRun). One already running starts over. */
export function startRecording(snapshot: unknown) {
  session = { startedAt: Date.now(), snapshot, events: [], classesListed: new Set() };
  changed();
}

/** End the recording and download it (nothing when none runs). */
export function stopRecording() {
  if (!session) return;
  const done = session;
  session = null;
  changed();
  const text = '{\n"recordedAt": ' + JSON.stringify(new Date(done.startedAt).toISOString())
    + ',\n"seconds": ' + Math.round((Date.now() - done.startedAt) / 1000)
    + ',\n"partyAtStart": ' + JSON.stringify(done.snapshot, null, 1)
    + ',\n"events": [\n' + done.events.map((e) => JSON.stringify(e)).join(',\n') + '\n]\n}\n';
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `rifter-run-${new Date(done.startedAt).toISOString().replace(/[:.]/g, '-').slice(0, 19)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Write one event (`kind` says what it is; `data` is built only while a recording runs). */
export function record(kind: string, data: () => Record<string, unknown>) {
  if (!session) return;
  session.events.push({ t: Math.round((Date.now() - session.startedAt) / 100) / 10, kind, ...data() });
}

/** Whether this is the first time this recording meets a creature class (true once per class). */
export function firstOfClass(classId: string): boolean {
  if (!session || session.classesListed.has(classId)) return false;
  session.classesListed.add(classId);
  return true;
}

/** A fight's end (combat went from active to not), with the party as it stands, and how many rounds it ran. */
export function useRecordFightEnd(active: boolean, round: number, vitals: () => unknown) {
  const was = useRef(false), rounds = useRef(0);
  useEffect(() => {
    if (active) rounds.current = round;
    else if (was.current) record('fightEnd', () => ({ rounds: rounds.current, party: vitals() }));
    was.current = active;
  }, [active, round]); // eslint-disable-line react-hooks/exhaustive-deps -- the fight's start and end, by `active`
}

// ─── Describing an action ────────────────────────────────────────────────────

/** An ability as plain data (its icon left out). */
export const plainAbility = ({ icon: _icon, ...rest }: Ability) => rest;

/** The names of the abilities behind some effects. */
export const effectNames = (buffs: readonly ActiveBuff[]) => [...new Set(buffs.map((b) => b.source).filter((s): s is string => !!s))];

const sameRef = (a: UnitRef, b: UnitRef) => a.side === 'party' ? b.side === 'party' && a.idx === b.idx : b.side === 'enemy' && a.id === b.id;
const hpText = (u: CombatUnit) => (u.hp === undefined ? u.name : `${u.name} HP ${u.hp}/${u.stats.hp}${u.mp === undefined ? '' : ` MP ${u.mp}/${u.stats.mp}`}`);

/**
 * One executed action (executeAction): who used what on whom, every roll, and each unit's HP before and after. `rolls`:
 * the lines the action logged as it resolved; `units`: everyone it knew (to put names to the changes).
 */
export function actionEvent(caster: CombatUnit, action: Ability, targets: readonly CombatUnit[], units: readonly CombatUnit[], rolls: readonly string[], outcome: ActionOutcome) {
  const own = outcome.changes.find((c) => sameRef(c.ref, caster.ref));
  return {
    // mpCost: what it cost this caster at its level (mpCostAt); mpBase: the ability's own, at level 1
    actor: hpText(caster), ability: action.name, ap: action.apCost, mpBase: action.mpCost, mpCost: own?.mpSpent ?? 0,
    targets: targets.map(hpText),
    rolls,
    changes: outcome.changes.flatMap((c) => {
      const u = units.find((x) => sameRef(x.ref, c.ref));
      if (!u) return [];
      const after = u.hp === undefined ? undefined : c.slain ? 0 : Math.max(0, Math.min(u.stats.hp, u.hp - c.damage + c.heal));
      return [{
        unit: u.name, ...(u.hp !== undefined ? { hp: `${u.hp} → ${after}` } : {}),
        // MP after: spent and regained, never past its max (as the landing does: useActionOutcomes nextMp)
        ...(u.mp !== undefined && (c.mpSpent || c.mpRestored)
          ? { mp: `${u.mp} → ${Math.max(0, Math.min(Math.max(u.mp, u.stats.mp), u.mp - c.mpSpent + c.mpRestored))}` } : {}),
        ...(c.damage ? { damage: c.damage } : {}), ...(c.heal ? { heal: c.heal } : {}),
        ...(c.mpSpent && c !== own ? { mpDamage: c.mpSpent } : {}),
        ...(c.mpRestored ? { mpRestored: c.mpRestored } : {}),
        ...(c.buffs.length ? { buffs: effectNames(c.buffs) } : {}),
        ...(c.dots.length ? { dots: c.dots.map((d) => `${d.name} ${d.damagePerTurn}/turn ×${d.turnsLeft}`) } : {}),
        ...(c.hots.length ? { hots: c.hots.map((h) => `${h.name} ${h.healPerTurn}${h.restoresMP ? ' MP' : ''}/turn ×${h.turnsLeft}`) } : {}),
        ...(c.slain ? { slain: true } : {}),
        ...(after === 0 ? { down: true } : {}),
      }];
    }),
    ...(outcome.summons?.length ? { summons: outcome.summons.map((s) => s.creature) } : {}),
    ...(outcome.move ? { moved: `${outcome.move.tiles} tiles (${outcome.move.style})` } : {}),
  };
}

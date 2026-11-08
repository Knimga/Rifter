// The quest tracker (top left, under the location's name): the party's active quests by name (each with its current
// objective under it, if it has steps), or a note that it has none. Small and quiet: a small heading over a hairline,
// then one bullet per quest. News pulses once, brightly (rf-quest-pulse): a quest taken (its name and objective), a new
// objective, a quest completed (it stays in the list for its pulse, then goes).
import { useState } from 'react';
import { currentStep, quest, type QuestLog } from '../../data/world/quests';

/** What a quest's objective is keyed by: it remounts (and so pulses) when the step changes. */
const objectiveKey = (id: string, stepId: string) => `${id}:${stepId}`;

export default function QuestTracker({ log }: { log: QuestLog }) {
  // What was shown when the tracker first appeared: no pulse for it (only for what changes after)
  const [initial] = useState(() => new Set(log.active.flatMap((id) => {
    const step = currentStep(log, id);
    return step ? [id, objectiveKey(id, step.id)] : [id];
  })));
  const pulse = (key: string) => (initial.has(key) ? '' : ' rf-quest-pulse');
  // Quests that just finished: still listed until their pulse ends (a quest leaving the active list while completed)
  const [prevActive, setPrevActive] = useState(log.active);
  const [leaving, setLeaving] = useState<string[]>([]);
  if (log.active !== prevActive) {
    setPrevActive(log.active);
    const done = prevActive.filter((id) => log.completed.includes(id) && !log.active.includes(id));
    if (done.length) setLeaving((l) => [...l, ...done]);
  }
  const shown = log.active.length + leaving.length > 0;
  return (
    <section aria-label="Active quests" className="w-[220px] pointer-events-none">
      <h2 className="rf-label m-0 pb-1 border-b border-rift-line text-[10px]">Active Quests</h2>
      {!shown
        ? <p className="mt-1.5 mb-0 text-[11px] text-rift-off">No active quests</p>
        : (
          <ul className="mt-1.5 mb-0 pl-0 list-none flex flex-col gap-1">
            {log.active.map((id) => {
              const step = currentStep(log, id);
              return (
                <li key={id} className="text-[11px] text-rift-soft">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="flex-none w-1 h-1 rotate-45" style={{ background: 'var(--rift-quest)' }} />
                    <span className={`rf-quest-text${pulse(id)}`}>{quest(id).name}</span>
                  </span>
                  {/* Its current objective, under its name (a quest with steps) */}
                  {step && <span key={step.id} className={`block pl-3 mt-0.5 text-[10px] text-rift-muted rf-quest-text${pulse(objectiveKey(id, step.id))}`}>{step.objective}</span>}
                </li>
              );
            })}
            {/* A quest just completed: its name pulses once, then it leaves the list */}
            {leaving.map((id) => (
              <li key={`done-${id}`} className="text-[11px] text-rift-soft">
                <span className="flex items-center gap-2">
                  <span aria-hidden="true" className="flex-none w-1 h-1 rotate-45" style={{ background: 'var(--rift-quest)' }} />
                  <span className="rf-quest-text rf-quest-pulse" onAnimationEnd={() => setLeaving((l) => l.filter((q) => q !== id))}>{quest(id).name}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
    </section>
  );
}

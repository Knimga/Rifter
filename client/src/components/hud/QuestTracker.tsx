// The quest tracker (top left, under the location's name): the party's active quests by name (each with its current
// objective under it, if it has steps), or a note that it has none. Small and quiet: a small heading over a hairline,
// then one bullet per quest.
import { currentStep, quest, type QuestLog } from '../../data/world/quests';

export default function QuestTracker({ log }: { log: QuestLog }) {
  return (
    <section aria-label="Active quests" className="w-[220px] pointer-events-none">
      <h2 className="rf-label m-0 pb-1 border-b border-rift-line text-[10px]">Active Quests</h2>
      {log.active.length === 0
        ? <p className="mt-1.5 mb-0 text-[11px] text-rift-off">No active quests</p>
        : (
          <ul className="mt-1.5 mb-0 pl-0 list-none flex flex-col gap-1">
            {log.active.map((id) => {
              const step = currentStep(log, id);
              return (
                <li key={id} className="text-[11px] text-rift-soft">
                  <span className="flex items-center gap-2">
                    <span aria-hidden="true" className="flex-none w-1 h-1 rotate-45" style={{ background: 'var(--rift-quest)' }} />
                    {quest(id).name}
                  </span>
                  {/* Its current objective, under its name (a quest with steps) */}
                  {step && <span className="block pl-3 mt-0.5 text-[10px] text-rift-muted">{step.objective}</span>}
                </li>
              );
            })}
          </ul>
        )}
    </section>
  );
}

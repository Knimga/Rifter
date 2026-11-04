// An NPC speaking one of its conversations (data/world/dialogue.ts): a pane over its head with its portrait, its words
// typed out letter by letter (useTypewriter). A thing the party finds can speak one too (a found key's: its look as the
// portrait). It says its opening, a statement at a time (where the party asks a question between two,
// that question is offered under the first as its only choice); then it offers its topics (each marked as a quest
// leads: ! or ?) and, once one is chosen, speaks that topic's statements until it is done (onTopicDone), then comes
// back to the opening's last statement (already said: not typed again) and its topics. Right-click (anywhere, without
// dragging: a right-drag pans the map) finishes the statement being typed, or moves on to the next one; past the
// opening's last, with no topics, the conversation is over (onEnd: its effects happen). A question or topics offered
// must be clicked: right-click doesn't move on past them. Mounted fresh for each talk, so a talk always starts from the
// opening.
import { useState, type ReactNode } from 'react';
import { effectsMark, type Conversation, type DialogueTopic } from '../data/world/dialogue';
import type { QuestLog } from '../data/world/quests';
import { useRightClick, useTypewriter } from '../hooks/useTypewriter';
import { ClickHint } from './Tooltip';

/** The portrait's size, px (NpcPortrait's `size`). */
export const DIALOGUE_PORTRAIT = 64;

/**
 * Where the talk is: the opening's line `idx` (always a statement; `said`: back to its last after a topic, shown whole
 * at once), its topics offered once its last is said; or a topic's statement `idx`.
 */
type Stage = { kind: 'opening'; idx: number; said: boolean } | { kind: 'topic'; topic: DialogueTopic; idx: number };

export default function NpcDialogue({ portrait, name, conversation, quests, onTopicDone, onEnd }: {
  /** Its speaker's portrait, DIALOGUE_PORTRAIT px square (an NPC's: NpcPortrait). */
  portrait: ReactNode;
  name: string;
  conversation: Conversation;
  /** The party's quests: what a topic leads to (its marker). */
  quests: QuestLog;
  /** The chosen topic's last statement was said and moved past: its effects happen (the talk goes back to the opening). */
  onTopicDone: (topic: DialogueTopic) => void;
  /** Moved past the opening's last statement: the conversation is over (a topic-less one's effects happen). */
  onEnd: () => void;
}) {
  const [stage, setStage] = useState<Stage>({ kind: 'opening', idx: 0, said: false });
  const opening = stage.kind === 'opening';
  const lines = conversation.opening;
  // The opening's last statement (its questions only ever come between statements)
  const lastStatement = lines.reduce<number>((last, l, i) => (typeof l === 'string' ? i : last), 0);
  const lastOfOpening = opening && stage.idx >= lastStatement;
  // The party's question after this statement, if one comes next
  const next = opening ? lines[stage.idx + 1] : undefined;
  const question = next !== undefined && typeof next !== 'string' ? next.ask : null;
  const topics = conversation.topics ?? [];
  const line = opening ? lines[stage.idx] : stage.topic.statements[stage.idx];
  const text = typeof line === 'string' ? line : '';
  // Typed out from the start of each new statement (the opening returned to shows whole)
  const { typed, done, finish } = useTypewriter(text, opening && stage.said);

  /** The party asks the question offered under the statement: the NPC answers (the statement after it). */
  const ask = () => { if (stage.kind === 'opening') setStage({ ...stage, idx: stage.idx + 2 }); };
  // Something offered to click (the party's question, or the opening's topics): right-click doesn't move on past it
  const choosing = done && (!!question || (lastOfOpening && topics.length > 0));
  /**
   * Right-click: finish typing the statement, or move on: to the next statement; after a topic's last, back to the
   * opening's last; past the opening's last (with no topics), the end. Not while something is offered to click.
   */
  const advance = () => {
    if (!done) { finish(); return; }
    if (choosing) return;
    if (stage.kind === 'opening') {
      if (lastOfOpening) onEnd();
      else setStage({ ...stage, idx: stage.idx + 1 });
      return;
    }
    if (stage.idx + 1 < stage.topic.statements.length) { setStage({ ...stage, idx: stage.idx + 1 }); return; }
    finishTopic(stage.topic);
  };
  /** A topic said through: its effects happen; then the talk goes back to the opening, or (a farewell) ends. */
  const finishTopic = (topic: DialogueTopic) => {
    onTopicDone(topic);
    if (topic.ends) onEnd();
    else setStage({ kind: 'opening', idx: lastStatement, said: true });
  };
  /** A topic chosen: the NPC speaks it (one with nothing to say, a bare farewell, is done at once). */
  const choose = (topic: DialogueTopic) => {
    if (topic.statements.length === 0) finishTopic(topic);
    else setStage({ kind: 'topic', topic, idx: 0 });
  };
  // Right-click anywhere while it speaks (not a right-drag: that pans the map)
  useRightClick(advance);

  const lastOfTopic = stage.kind === 'topic' && stage.idx + 1 >= stage.topic.statements.length;
  return (
    <div role="dialog" aria-label={`${name} speaks`} className="rf-dialogue relative flex gap-3.5 w-[484px] box-border p-3.5 pointer-events-auto">
      {portrait}
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="font-display text-[12px] tracking-[0.14em] uppercase text-rift-bright">{name}</div>
        {/* The whole statement takes its place from the start (the untyped rest hidden), so the pane never jumps */}
        <p aria-live="polite" className="mt-1.5 mb-0 font-display text-[14px] leading-[1.6] text-rift-ink">
          {text.slice(0, typed)}<span className="invisible">{text.slice(typed)}</span>
        </p>
        {/* The party's question, when one comes next: its place kept while the statement is typed, as the topics' */}
        {question && (
          <div role="menu" className={`mt-2.5 flex flex-col items-start ${done ? '' : 'invisible'}`}>
            <button type="button" role="menuitem" disabled={!done} onClick={ask}
              className="rf-topic flex items-center gap-2 text-left font-display text-[13px] text-rift-soft">
              <span aria-hidden="true" className="rf-topic-mark flex-none w-1.5 h-1.5 rotate-45" />
              {question}
            </button>
          </div>
        )}
        {/* The opening's topics, under its last statement: their place kept while it is typed (hidden until it is said),
            so the pane keeps its size. A topic leading to a quest is marked (! or ?) instead of the diamond */}
        {lastOfOpening && topics.length > 0 && (
          <div role="menu" className={`mt-2.5 flex flex-col items-start gap-1.5 ${done ? '' : 'invisible'}`}>
            {topics.map((t) => {
              const mark = effectsMark(t.effects, quests);
              return (
                <button key={t.id} type="button" role="menuitem" disabled={!done} onClick={() => choose(t)}
                  className="rf-topic flex items-center gap-2 text-left font-display text-[13px] text-rift-soft">
                  {mark
                    ? <span aria-label={mark === '!' ? 'New quest:' : 'Quest:'} className={`rf-quest-mark flex-none w-1.5 text-center ${mark === '!' ? 'text-[12px]' : 'text-[15px]'}`}>{mark}</span>
                    : <span aria-hidden="true" className="rf-topic-mark flex-none w-1.5 h-1.5 rotate-45" />}
                  {t.prompt}
                </button>
              );
            })}
          </div>
        )}
        {/* No right-click hint while something is offered to click (right-click does nothing then): hidden, its place
            kept, so the pane keeps its size through the statement */}
        <ClickHint button="right" className={`mt-2 self-end ${choosing ? 'invisible' : ''}`}>{!done ? 'Continue' : lastOfOpening || (lastOfTopic && stage.topic.ends) ? 'End' : lastOfTopic ? 'Back' : 'Continue'}</ClickHint>
      </div>
    </div>
  );
}

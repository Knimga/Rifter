// Narration (the game's opening): lines told one at a time, typed out in the middle of the screen in black-glowing
// letters over whatever is behind them, each moved past with a right-click as dialogue is (useTypewriter). Past the
// last, it is over (onDone).
import { useState } from 'react';
import { useRightClick, useTypewriter } from '../hooks/useTypewriter';
import { ClickHint } from './Tooltip';

export default function Narration({ lines, onDone }: { lines: readonly string[]; onDone: () => void }) {
  const [idx, setIdx] = useState(0);
  const text = lines[idx];
  const { typed, done, finish } = useTypewriter(text);
  // Right-click: finish typing the line, or move on to the next (past the last: done)
  useRightClick(() => {
    if (!done) finish();
    else if (idx + 1 < lines.length) setIdx(idx + 1);
    else onDone();
  });
  return (
    <div className="flex flex-col items-center gap-7 w-[640px] max-w-[calc(100vw-32px)]">
      {/* The whole line takes its place from the start (the untyped rest hidden), so the text never shifts */}
      <p aria-live="polite" className="rf-narration m-0 text-center font-display text-[22px] leading-[1.7]">
        {text.slice(0, typed)}<span className="invisible">{text.slice(typed)}</span>
      </p>
      <ClickHint button="right" className="rf-narration-hint">Continue</ClickHint>
    </div>
  );
}

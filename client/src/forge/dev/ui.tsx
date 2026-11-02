// DEV ONLY: the forge page's small controls, shared by its views (ForgePage, DungeonPreview).

export const INPUT = 'bg-gray-900 border border-gray-700 rounded px-1.5 py-0.5 w-16';
export const BTN = 'px-2.5 py-1 rounded bg-gray-700 hover:bg-gray-600 text-gray-100';

/** Large-hit-area on/off button (used instead of native checkboxes). */
export function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: string }) {
  const active = on ? 'bg-blue-700 text-white' : 'bg-gray-900 text-gray-400 hover:bg-gray-700';
  return (
    <button type="button" onClick={onClick} className={`px-2.5 py-1 rounded border border-gray-700 text-xs ${active}`}>
      {children}
    </button>
  );
}

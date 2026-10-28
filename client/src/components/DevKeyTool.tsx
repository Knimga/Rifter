// TEMP (testing only): a dropdown on the game screen's top bar that puts any dungeon's rift key on the party's
// keyring, so every dungeon can be opened at the Rifter without beating a boss for its key. Rendered by
// GameScreen in dev builds only (import.meta.env.DEV). Delete this file and its one use in GameScreen when no
// longer needed.
import { DUNGEONS, type DungeonKey } from '../data/world/dungeons';

export default function DevKeyTool({ keys, onAddKey }: { keys: readonly DungeonKey[]; onAddKey: (key: DungeonKey) => void }) {
  const missing = (Object.keys(DUNGEONS) as DungeonKey[]).filter((k) => !keys.includes(k));
  return (
    <select
      aria-label="Add a dungeon key (testing)"
      className="h-8 px-2 text-xs bg-rift-panel text-rift-soft border border-rift-edge rounded-sm"
      value=""
      disabled={missing.length === 0}
      onChange={(e) => e.target.value && onAddKey(e.target.value as DungeonKey)}
    >
      <option value="">{missing.length ? 'Add key…' : 'All keys owned'}</option>
      {missing.map((k) => <option key={k} value={k}>{DUNGEONS[k].keyName} ({DUNGEONS[k].name})</option>)}
    </select>
  );
}

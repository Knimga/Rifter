// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// TEMP: FOR TESTING ONLY. Not part of the game: delete this file and its uses in GameScreen (search "DevToolsWindow"
// and "showTesting") once the testing tools are no longer needed.
//
// The testing tools, in one small window opened by the game screen's Testing button (so they don't crowd the top bar
// or cover the turn order): Level +1 (exactly enough XP for the next level), add any dungeon's rift key to the keyring
// (every dungeon can be opened at the Rifter without beating a boss for its key), Shards +20 (random types, the same
// one can come up more than once) and Gold +1000. Each only calls the hook functions real play uses.
// GameScreen renders the button and this window in dev builds only (import.meta.env.DEV), so neither exists in a
// production build.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { SHARDS } from '../data/gear/shards';
import type { AffixStat } from '../data/gear/affixes';
import { DUNGEONS, type DungeonKey } from '../data/world/dungeons';
import { pick } from '../data/random';
import ModalWindow, { WindowCloseButton } from './ui/ModalWindow';
import RiftButton from './ui/RiftButton';

/** How many random shards Shards + gives, and how much gold Gold + gives. */
const SHARD_BULK = 20, GOLD_BULK = 1000;

export default function DevToolsWindow({ keys, onLevelUp, onAddKey, onAddShard, onAddGold, onClose }: {
  keys: readonly DungeonKey[];
  onLevelUp: () => void;
  onAddKey: (key: DungeonKey) => void;
  onAddShard: (stat: AffixStat) => void;
  onAddGold: (amount: number) => void;
  onClose: () => void;
}) {
  const missing = (Object.keys(DUNGEONS) as DungeonKey[]).filter((k) => !keys.includes(k));
  return (
    <ModalWindow width={360} height={300} labelledBy="dev-tools-title" closeLabel="Close testing tools" onClose={onClose} dim={false}
      className="flex flex-col pt-5 px-6 pb-[22px]">
      <header className="flex-none flex items-center justify-between gap-4">
        <h2 id="dev-tools-title" className="m-0 font-display font-normal text-[22px] tracking-[0.06em] text-rift-bright">Testing</h2>
        <WindowCloseButton onClose={onClose} />
      </header>
      <div className="mt-4 flex flex-col gap-2.5">
        <RiftButton size="sm" onClick={onLevelUp}>Level +1</RiftButton>
        <select aria-label="Add a dungeon key (testing)" className="h-8 px-2 text-xs bg-rift-panel text-rift-soft border border-rift-edge rounded-sm"
          value="" disabled={missing.length === 0} onChange={(e) => e.target.value && onAddKey(e.target.value as DungeonKey)}>
          <option value="">{missing.length ? 'Add key…' : 'All keys owned'}</option>
          {missing.map((k) => <option key={k} value={k}>{DUNGEONS[k].keyName} ({DUNGEONS[k].name})</option>)}
        </select>
        {/* Each add is its own functional state update, so all of them land though they happen in one click */}
        <RiftButton size="sm" onClick={() => { for (let i = 0; i < SHARD_BULK; i++) onAddShard(pick(SHARDS).stat); }}>Shards +{SHARD_BULK}</RiftButton>
        <RiftButton size="sm" onClick={() => onAddGold(GOLD_BULK)}>Gold +{GOLD_BULK}</RiftButton>
      </div>
    </ModalWindow>
  );
}

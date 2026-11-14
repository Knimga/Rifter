// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// TEMP: FOR TESTING ONLY. Not part of the game: delete this file and its uses in GameScreen (search "DevToolsWindow"
// and "showTesting") once the testing tools are no longer needed.
//
// The testing tools, in one small window opened by the game screen's Testing button (so they don't crowd the top bar
// or cover the turn order): Level +1 (exactly enough XP for the next level), add any dungeon's rift key to the keyring
// (every dungeon can be opened at the Rifter without beating a boss for its key), Shards +20 (random types, the same
// one can come up more than once), Gold +1000, and the run recorder's Start / Stop recording (devtools/runRecorder.ts:
// a file of the party's stats and a fight-by-fight log, to hand over for balancing). Each only calls the hook
// functions real play uses.
// GameScreen renders the button and this window in dev builds only (import.meta.env.DEV), so neither exists in a
// production build.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { SHARDS } from '../data/gear/shards';
import type { AffixStat } from '../data/gear/affixes';
import { DUNGEONS, PASSAGES, type DungeonKey, type PassageKey } from '../data/world/dungeons';
import { pick } from '../data/random';
import { startRecording, stopRecording, useIsRecording } from '../devtools/runRecorder';
import ModalWindow, { WindowCloseButton } from './ui/ModalWindow';
import RiftButton from './ui/RiftButton';

/** How many random shards Shards + gives, and how much gold Gold + gives. */
const SHARD_BULK = 20, GOLD_BULK = 1000;

export default function DevToolsWindow({ keys, getRunSnapshot, onLevelUp, onAddKey, onEnterPassage, onAddShard, onAddGold, onClose }: {
  keys: readonly DungeonKey[];
  /** The party as it is now (what a recording starts with: runDescribe.ts describeRun). */
  getRunSnapshot: () => unknown;
  onLevelUp: () => void;
  onAddKey: (key: DungeonKey) => void;
  /** Go into a passage (none has a way in from the Sanctum: the game's opening starts in the first). */
  onEnterPassage: (key: PassageKey) => void;
  onAddShard: (stat: AffixStat) => void;
  onAddGold: (amount: number) => void;
  onClose: () => void;
}) {
  const recording = useIsRecording();
  const missing = (Object.keys(DUNGEONS) as DungeonKey[]).filter((k) => !keys.includes(k));
  return (
    <ModalWindow width={360} height={400} labelledBy="dev-tools-title" closeLabel="Close testing tools" onClose={onClose} dim={false}
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
        {Object.entries(PASSAGES).map(([k, p]) => <RiftButton key={k} size="sm" onClick={() => onEnterPassage(k)}>Enter {p.name}</RiftButton>)}
        {/* Each add is its own functional state update, so all of them land though they happen in one click */}
        <RiftButton size="sm" onClick={() => { for (let i = 0; i < SHARD_BULK; i++) onAddShard(pick(SHARDS).stat); }}>Shards +{SHARD_BULK}</RiftButton>
        <RiftButton size="sm" onClick={() => onAddGold(GOLD_BULK)}>Gold +{GOLD_BULK}</RiftButton>
        {/* Starts a recording with the party's stats as they are; stopping it downloads the file */}
        <RiftButton size="sm" onClick={() => (recording ? stopRecording() : startRecording(getRunSnapshot()))}>
          {recording && <span aria-hidden="true" className="inline-block size-2 mr-2 rounded-full bg-red-600 align-middle" />}
          {recording ? 'Stop recording' : 'Start recording'}
        </RiftButton>
      </div>
    </ModalWindow>
  );
}

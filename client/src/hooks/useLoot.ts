// What lies on a dungeon's floor (GameScreen): the loot enemies drop as they die (items, gold, shards, a boss's rift
// key), picking it up, and the found key a passage hides (its words said as it is picked up, a scene: useScenes).
import { useCallback } from 'react';
import { generateLootDrops, type Item } from '../data/gear';
import { rollGold } from '../data/gear/loot';
import { mergeShards, rollShardDrop, SHARD_DROP_CHANCE, totalShards, type ShardCounts } from '../data/gear/shards';
import { formatGold } from '../data/detailStrings';
import { COMBAT_TEXT_COLOR } from '../data/constants';
import type { EnemyInstance } from '../data/units/enemies';
import { isBoss } from '../data/units/bosses';
import { findOpenTilesNear, posKey, type Pos } from '../data/world/grid';
import { effectsMark, type DialogueEffect, type QuestMark } from '../data/world/dialogue';
import { currentStep, type QuestEvent, type QuestLog } from '../data/world/quests';
import type { DungeonData, ZoneData } from '../data/world/gen';
import { foundKeyIn, isPassage, type AreaKey, type DungeonKey } from '../data/world/dungeons';
import { bossKeyDrop, keyReceived } from '../data/world/rifts';
import { useLatest } from './useLatest';
import type { useScenes } from './useScenes';
import type { SpawnFloat } from './useFloatingText';
import type { Announce } from './useAnnouncements';

type Scenes = ReturnType<typeof useScenes>;

export function useLoot({
  location, dungeonKey, dungeon, setDungeon, currentZone, partyLevel, questLog, scenes, runDialogueEffects, questDid,
  partyCanUse, keys, addKey, takeLoot, addGold, pickUpShards, restockVendor, spawnFloat, announce,
}: {
  location: 'sanctum' | 'dungeon';
  /** The dungeon or passage the party is in (or last entered). */
  dungeonKey: AreaKey;
  dungeon: DungeonData | null;
  setDungeon: (fn: (prev: DungeonData | null) => DungeonData | null) => void;
  currentZone: number;
  /** The party's level: drops are rolled for it. */
  partyLevel: number;
  questLog: QuestLog;
  scenes: Pick<Scenes, 'finding' | 'startFinding' | 'endFinding'>;
  /** What a conversation's effects do (useDialogue): the found key's words. */
  runDialogueEffects: (effects: readonly DialogueEffect[] | undefined) => void;
  /** The party did something: the quests waiting on it move on (useDialogue). */
  questDid: (event: QuestEvent) => void;
  /** Whether someone in the party can use an item: drops favour those. */
  partyCanUse: (item: Item) => boolean;
  /** The rift keys the party has (a boss drops one it doesn't), and putting one on the keyring (useKeyring). */
  keys: readonly DungeonKey[];
  addKey: (key: DungeonKey) => void;
  /** Take items into the inventory (useInventory): the ones left over, or null if none was taken. */
  takeLoot: (items: Item[], at: Pos) => Item[] | null;
  addGold: (amount: number) => void;
  pickUpShards: (found: ShardCounts) => void;
  /** Fresh wares for the vendor at a level (useVendor): a boss's defeat. */
  restockVendor: (level: number) => void;
  spawnFloat: SpawnFloat;
  /** Announces a key received, over the map (useAnnouncements). */
  announce: Announce;
}) {
  const dungeonRef = useLatest(dungeon);
  const currentZoneRef = useLatest(currentZone);
  const partyLevelRef = useLatest(partyLevel);
  const keysRef = useLatest(keys);
  const questDidRef = useLatest(questDid);
  const zone = dungeon?.zones[currentZone] ?? null;

  /** Gold picked up at a tile (off the floor, out of a chest): into the party's gold, and its amount floats up with the coin. */
  const takeGold = useCallback((amount: number, at: Pos) => {
    addGold(amount);
    spawnFloat(at.x, at.y, `+${formatGold(amount)}`, COMBAT_TEXT_COLOR.gold, 'gold');
  }, [addGold, spawnFloat]);
  /** Shards picked up at a tile (off the floor, out of a chest): into the party's shards, and how many floats up. */
  const takeShards = useCallback((found: ShardCounts, at: Pos) => {
    pickUpShards(found);
    const n = totalShards(found);
    spawnFloat(at.x, at.y, `+${n} ${n === 1 ? 'Shard' : 'Shards'}`, COMBAT_TEXT_COLOR.loot);
  }, [pickUpShards, spawnFloat]);

  // The key lying to be found in this passage, if any (its words, then it is taken: finding)
  const foundKey = location === 'dungeon' ? foundKeyIn(dungeonKey) : undefined;
  // The keys lying on this dungeon's floor are marked: a found key by what its words do (! a quest to take), else by a
  // quest step waiting on a key being picked up here (?)
  const keyMark: QuestMark | null = foundKey && zone && Object.values(zone.droppedKeys).includes(foundKey.key)
    ? effectsMark(foundKey.conversation.effects, questLog)
    : questLog.active.some(id => {
      const step = currentStep(questLog, id);
      return step?.marker === 'droppedKey' && !!step.until && 'pickUpKeyIn' in step.until && step.until.pickUpKeyIn === dungeonKey;
    }) ? '?' : null;

  /** Replace the current zone's data in the dungeon (e.g. its dropped items). */
  const updateCurrentZone = useCallback((fn: (z: ZoneData) => ZoneData) => {
    setDungeon(prev => prev ? { ...prev, zones: prev.zones.map((z, i) => i === currentZoneRef.current ? fn(z) : z) } : null);
  }, [setDungeon, currentZoneRef]);

  /** The rift key lying on `pos` in this dungeon is gone from its floor. */
  const clearKeyAt = useCallback((pos: Pos) =>
    updateCurrentZone(z => ({ ...z, droppedKeys: Object.fromEntries(Object.entries(z.droppedKeys).filter(([k]) => k !== posKey(pos))) })), [updateCurrentZone]);
  /** Pick up the rift key lying on `pos` in this dungeon: onto the keyring (the quests waiting on it move on). */
  const pickUpRiftKey = useCallback((pos: Pos, riftKey: DungeonKey) => {
    addKey(riftKey);
    const received = keyReceived(riftKey);
    announce(received.text, received.color);
    clearKeyAt(pos);
    questDidRef.current({ pickUpKeyIn: dungeonKey });
  }, [dungeonKey, addKey, announce, clearKeyAt, questDidRef]);
  /**
   * The found key's words are said: what they do (a quest given), and the key is taken, only from the floor: the party
   * doesn't know it is a key (someone gives it later: a dialogue's giveKey).
   */
  const finishFinding = () => {
    if (scenes.finding && foundKey) {
      runDialogueEffects(foundKey.conversation.effects);
      clearKeyAt(scenes.finding);
    }
    scenes.endFinding();
  };

  /**
   * Pick up what lies on `pos` (clicked from next to it): a rift key goes on the keyring, gold into the party's gold
   * and shards into the party's shards (none needs inventory room, so a full inventory never keeps them); a loot pile
   * goes into the inventory, as much as fits.
   */
  const { startFinding } = scenes;
  const pickUp = useCallback((pos: Pos) => {
    if (!zone) return;
    const key = posKey(pos);
    // A tile's record with this tile's entry gone (what was lying here has been taken)
    const cleared = <T,>(r: Record<string, T>) => Object.fromEntries(Object.entries(r).filter(([k]) => k !== key));
    const riftKey = zone.droppedKeys[key];
    // A rift key: onto the keyring; a found one speaks first (its words), and is taken once they are said (finishFinding)
    if (riftKey && riftKey === foundKey?.key) startFinding(pos);
    else if (riftKey) pickUpRiftKey(pos, riftKey);
    const coins = zone.droppedGold[key];
    if (coins) {
      takeGold(coins, pos);
      updateCurrentZone(z => ({ ...z, droppedGold: cleared(z.droppedGold) }));
    }
    const found = zone.droppedShards[key];
    if (found) {
      takeShards(found, pos);
      updateCurrentZone(z => ({ ...z, droppedShards: cleared(z.droppedShards) }));
    }
    const items = zone.droppedItems[key];
    if (!items?.length) return;

    const remaining = takeLoot(items, pos);
    if (!remaining) return;
    updateCurrentZone(z => ({ ...z, droppedItems: remaining.length > 0 ? { ...z.droppedItems, [key]: remaining } : cleared(z.droppedItems) }));
  }, [zone, foundKey, startFinding, pickUpRiftKey, takeLoot, takeGold, takeShards, updateCurrentZone]);
  // (for timers and handlers set up earlier: the pickup as of the latest render)
  const pickUpRef = useLatest(pickUp);

  /**
   * Loot for enemies that just died (any cause), on the tiles they fell: items favouring what the party can use, gold
   * (rolled apart from items: rollGold) and, for any enemy, a chance of a group of affix shards (SHARD_DROP_CHANCE).
   * A boss also drops the next rift key the party doesn't have (bossKeyDrop; not one already lying in this dungeon), if one is
   * left: on its tile, or the nearest floor tile beside it with nothing lying on it.
   */
  const dropLoot = useCallback((dead: EnemyInstance[]) => {
    const d = dungeonRef.current;
    if (!d) return;
    const drops: Record<string, Item[]> = {};
    const goldDrops: Record<string, number> = {};
    const shardDrops: Record<string, ShardCounts> = {};
    const keyDrops: { at: Pos; key: DungeonKey }[] = [];
    // A boss's defeat gives the vendor fresh wares, at the party's level (only then: leaving a dungeon doesn't)
    if (dead.some(isBoss)) restockVendor(partyLevelRef.current);
    for (const e of dead) {
      // (none in a dungeon whose enemies drop nothing: DungeonData.loot)
      if (d.loot) {
        const items = generateLootDrops(d.level, partyLevelRef.current, e.classData.dropChance ?? 0, partyCanUse);
        if (items.length) (drops[posKey(e.pos)] ??= []).push(...items);
        const coins = rollGold(e.level, e.classData.dropsGold ?? 0, e.classData.goldBonus);
        if (coins) goldDrops[posKey(e.pos)] = (goldDrops[posKey(e.pos)] ?? 0) + coins;
        const found = rollShardDrop(SHARD_DROP_CHANCE);
        if (found) shardDrops[posKey(e.pos)] = mergeShards(shardDrops[posKey(e.pos)] ?? {}, found);
      }
      // (a passage has no boss, and no key of its own to drop by)
      if (isBoss(e) && !isPassage(dungeonKey)) {
        const lying = [...d.zones.flatMap(z => Object.values(z.droppedKeys)), ...keyDrops.map(k => k.key)];
        const key = bossKeyDrop(dungeonKey, keysRef.current, lying);
        if (key) keyDrops.push({ at: e.pos, key });
      }
    }
    if ([drops, goldDrops, shardDrops].every(r => Object.keys(r).length === 0) && keyDrops.length === 0) return;
    updateCurrentZone(z => {
      const merged = { ...z.droppedItems };
      for (const [k, items] of Object.entries(drops)) merged[k] = [...(merged[k] ?? []), ...items];
      // Gold on a tile that has some already adds to its pile
      const gold = { ...z.droppedGold };
      for (const [k, coins] of Object.entries(goldDrops)) gold[k] = (gold[k] ?? 0) + coins;
      // So do shards
      const shardPiles = { ...z.droppedShards };
      for (const [k, found] of Object.entries(shardDrops)) shardPiles[k] = mergeShards(shardPiles[k] ?? {}, found);
      const keys = { ...z.droppedKeys };
      for (const { at, key } of keyDrops) {
        const free = (p: Pos) => z.floors.has(posKey(p)) && !merged[posKey(p)]?.length && !gold[posKey(p)] && !shardPiles[posKey(p)] && !keys[posKey(p)];
        const spot = free(at) ? at : (findOpenTilesNear(at, free, 1, 3)[0] ?? at);
        keys[posKey(spot)] = key;
      }
      return { ...z, droppedItems: merged, droppedGold: gold, droppedShards: shardPiles, droppedKeys: keys };
    });
  }, [dungeonKey, partyCanUse, updateCurrentZone, restockVendor, dungeonRef, partyLevelRef, keysRef]);

  return { takeGold, takeShards, foundKey, keyMark, finishFinding, pickUp, pickUpRef, dropLoot };
}

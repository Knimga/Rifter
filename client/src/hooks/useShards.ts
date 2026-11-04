// The party's affix shards (data/gear/shards.ts): how many of each type it carries, shared by the whole party like
// the inventory and the keyring. They go up when shards are found and down when they are used (enchanting, later).
// Shards picked up mark the party window's Shards tab until the tab is opened (`hasNew`, `seeShards`), as a new key
// marks the Keys tab.
import { useCallback, useState } from 'react';
import type { AffixStat } from '../data/gear/affixes';
import { addShards, mergeShards, spendShards, type ShardCounts } from '../data/gear/shards';

export function useShards() {
  const [shards, setShards] = useState<ShardCounts>({});
  const [hasNew, setHasNew] = useState(false);

  /** The party finds `n` shards of a type. */
  const addShard = useCallback((stat: AffixStat, n = 1) => setShards(prev => addShards(prev, stat, n)), []);

  /** The party finds a group of shards (a drop picked up, a container's shards, an item's extracted affixes). */
  const gainShards = useCallback((found: ShardCounts) => setShards(prev => mergeShards(prev, found)), []);

  /** The party picks up shards (off the floor, out of a chest): gained, and new until the Shards tab is opened. */
  const pickUpShards = useCallback((found: ShardCounts) => {
    gainShards(found);
    setHasNew(true);
  }, [gainShards]);

  /** `n` shards of a type are used up. Nothing is taken when the party carries fewer (check with shardCount first). */
  const spendShard = useCallback((stat: AffixStat, n = 1) => setShards(prev => spendShards(prev, stat, n) ?? prev), []);

  /** The Shards tab was opened: the new shards have been seen. */
  const seeShards = useCallback(() => setHasNew(false), []);

  return { shards, hasNew, addShard, gainShards, pickUpShards, spendShard, seeShards };
}

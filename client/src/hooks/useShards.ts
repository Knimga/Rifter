// The party's affix shards (data/gear/shards.ts): how many of each type it carries, shared by the whole party like
// the inventory and the keyring. They go up when shards are found and down when they are used (enchanting, later).
import { useCallback, useState } from 'react';
import type { AffixStat } from '../data/gear/affixes';
import { addShards, mergeShards, spendShards, type ShardCounts } from '../data/gear/shards';

export function useShards() {
  const [shards, setShards] = useState<ShardCounts>({});

  /** The party finds `n` shards of a type. */
  const addShard = useCallback((stat: AffixStat, n = 1) => setShards(prev => addShards(prev, stat, n)), []);

  /** The party finds a group of shards (a drop picked up, a container's shards). */
  const gainShards = useCallback((found: ShardCounts) => setShards(prev => mergeShards(prev, found)), []);

  /** `n` shards of a type are used up. Nothing is taken when the party carries fewer (check with shardCount first). */
  const spendShard = useCallback((stat: AffixStat, n = 1) => setShards(prev => spendShards(prev, stat, n) ?? prev), []);

  return { shards, addShard, gainShards, spendShard };
}

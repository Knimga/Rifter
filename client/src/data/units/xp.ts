// Experience and leveling. The party levels together: one XP pool and one level for all its members, and
// every kill counts for everyone (alive or not). Tuned so a full dungeon run at about the party's level
// (its enemies at base level D, D + 1 and D + 2 for the boss zone) gives about one level.

/** XP an enemy of `level` is worth before its class's xpMultiplier: 10 at level 1, +5 per level. */
export const baseXp = (level: number): number => 5 + 5 * level;

/**
 * XP needed to go from `level` to the next: 360 at level 1, +120 per level. A run whose enemies start at the
 * party's level yields about 122·level + 240, so this stays at about one run per level.
 */
export const xpToNext = (level: number): number => 240 + 120 * level;

/**
 * XP scaling by level difference: enemies above the party give +10% per level (up to +50%); each level
 * below costs 25% (down to 20%), so farming easy dungeons isn't worth it.
 */
export function levelDiffFactor(enemyLevel: number, partyLevel: number): number {
  const diff = enemyLevel - partyLevel;
  return diff >= 0 ? Math.min(1.5, 1 + 0.1 * diff) : Math.max(0.2, 1 + 0.25 * diff);
}

/** XP the party gets for killing an enemy of `level` whose class has `xpMultiplier`. */
export const killXp = (level: number, xpMultiplier: number, partyLevel: number): number =>
  Math.round(baseXp(level) * xpMultiplier * levelDiffFactor(level, partyLevel));

/** The party's shared progress: its level, and XP toward the next one. */
export interface PartyProgress {
  level: number;
  xp: number;
}

export const START_PROGRESS: PartyProgress = { level: 1, xp: 0 };

/** Add `amount` XP: the new progress, and how many levels were gained (possibly several). */
export function gainXp(progress: PartyProgress, amount: number): { progress: PartyProgress; levelsGained: number } {
  let { level, xp } = progress;
  xp += amount;
  let levelsGained = 0;
  while (xp >= xpToNext(level)) {
    xp -= xpToNext(level);
    level++;
    levelsGained++;
  }
  return { progress: { level, xp }, levelsGained };
}

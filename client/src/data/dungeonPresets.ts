import { ENEMY_TYPES } from './enemies';
import type { DungeonConfig } from './dungeonGen';

const S = ENEMY_TYPES.skeleton;
const Z = ENEMY_TYPES.zombie;

export const DUNGEON_PRESETS = {
  crypt: {
    name: 'The Crypt',
    width: 28,
    height: 22,
    minRoomSize: 4,
    maxRoomSize: 8,
    splitDepth: 3,
    corridorWidth: 2,
    maxZones: 4,
    baseEnemyLevel: 1,
    enemyGroups: [
      [S, Z],
      [S, S, S],
      [Z, Z]
    ],
  },
} satisfies Record<string, DungeonConfig>;

import { ENEMY_CLASSES, BOSS_CLASSES } from './enemies';
import type { DungeonConfig } from './dungeonGen';

const skelly = ENEMY_CLASSES.find(c => c.id === 'skeleton')!;
const zombie = ENEMY_CLASSES.find(c => c.id === 'zombie')!;

const Necromancer = BOSS_CLASSES.find(c => c.id === 'necromancer')!;

export const DUNGEON_PRESETS = {
  crypt: {
    name: 'The Crypt',
    width: 28,
    height: 22,
    baseEnemyLevel: 1,    
    floorColor: '#303030',
    wallColor: '#202020',
    zones: [
      {
        minRoomSize: 4,
        maxRoomSize: 8,
        splitDepth: 3,
        corridorWidth: 2,
        enemyGroups: [
          [skelly, zombie],
          [skelly, skelly, skelly],
          [zombie, zombie],
        ],
      },
      {
        minRoomSize: 5,
        maxRoomSize: 8,
        splitDepth: 2,
        corridorWidth: 2,
        enemyGroups: [
          [skelly, zombie, zombie],
          [zombie, zombie, zombie]
        ],
      }
    ],
    bossZone: {
      roomSize: 12,
      corridorWidth: 2,
      bossGroup: [Necromancer, skelly, skelly],
    }
  },
} satisfies Record<string, DungeonConfig>;

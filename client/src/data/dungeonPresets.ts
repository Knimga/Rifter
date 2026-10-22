import { ENEMY_CLASSES, BOSS_CLASSES } from './enemies';
import type { DungeonConfig } from './dungeonGen';

const skelly = ENEMY_CLASSES.find(c => c.id === 'skeleton')!;
const zombie = ENEMY_CLASSES.find(c => c.id === 'zombie')!;
const lavaSlime = ENEMY_CLASSES.find(c => c.id === 'lava-slime')!;
const hellhound = ENEMY_CLASSES.find(c => c.id === 'hellhound')!;
const flameGolem = ENEMY_CLASSES.find(c => c.id === 'flame-golem')!;

const Necromancer = BOSS_CLASSES.find(c => c.id === 'necromancer')!;
const BurningSpirit = BOSS_CLASSES.find(c => c.id === 'burning-spirit')!;

export const DUNGEON_PRESETS: Record<string, DungeonConfig> = {
  crypt: {
    name: 'The Crypt',
    width: 28,
    height: 22,
    baseEnemyLevel: 1,    
    floorColor: '#303030',
    wallColor: '#202020',
    doorObject: 'heavy-door',
    portalObject: 'necrotic-portal',
    chestObject: 'basic-treasure-chest',
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
  firelands: {
    name: 'The Firelands',
    width: 30,
    height: 24,
    baseEnemyLevel: 1,   
    floorColor: '#472424',
    wallColor: '#3d0f0f',
    doorObject: 'heavy-door',
    portalObject: 'fire-portal',
    chestObject: 'basic-treasure-chest',
    zones: [
      {
        minRoomSize: 5,
        maxRoomSize: 9,
        splitDepth: 2,
        corridorWidth: 3,
        enemyGroups: [
          [lavaSlime, lavaSlime, lavaSlime],
          [hellhound, hellhound, hellhound],
          [flameGolem, lavaSlime]
        ],
      },
      {
        minRoomSize: 5,
        maxRoomSize: 9,
        splitDepth: 2,
        corridorWidth: 3,
        enemyGroups: [
          [flameGolem, lavaSlime],
          [hellhound, hellhound, lavaSlime],
          [hellhound, hellhound, lavaSlime]
        ],
      }
    ],
    bossZone: {
      roomSize: 12,
      corridorWidth: 2,
      bossGroup: [BurningSpirit],
    }
  }
} satisfies Record<string, DungeonConfig>;

/** A dungeon, by its DUNGEON_PRESETS key. */
export type DungeonKey = keyof typeof DUNGEON_PRESETS;

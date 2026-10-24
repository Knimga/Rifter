import { ENEMY_CLASSES, BOSS_CLASSES } from '../units/enemies';
import type { DungeonConfig } from './dungeonGen';

const skelly = ENEMY_CLASSES.find(c => c.id === 'skeleton')!;
const zombie = ENEMY_CLASSES.find(c => c.id === 'zombie')!;
const specter = ENEMY_CLASSES.find(c => c.id === 'specter')!;
const lavaSlime = ENEMY_CLASSES.find(c => c.id === 'lava-slime')!;
const hellhound = ENEMY_CLASSES.find(c => c.id === 'hellhound')!;
const flameGolem = ENEMY_CLASSES.find(c => c.id === 'flame-golem')!;
const fungalSpore = ENEMY_CLASSES.find(c => c.id === 'fungal-spore')!;
const sporetender = ENEMY_CLASSES.find(c => c.id === 'sporetender')!;
const mirehulk = ENEMY_CLASSES.find(c => c.id === 'mirehulk')!;
const rotflySwarm = ENEMY_CLASSES.find(c => c.id === 'rotfly-swarm')!;
const gloomtoad = ENEMY_CLASSES.find(c => c.id === 'gloomtoad')!;

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
          [skelly, skelly, skelly, skelly],
          [zombie, zombie, skelly, skelly],
          [specter,zombie,zombie, skelly]
        ],
      },
      {
        minRoomSize: 5,
        maxRoomSize: 8,
        splitDepth: 2,
        corridorWidth: 2,
        enemyGroups: [
          [specter, specter, skelly, skelly, skelly],
          [zombie, zombie, zombie, zombie],
          [zombie, zombie, specter, specter],
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
    width: 34,
    height: 30,
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
        layout: 'caverns',
        islands: { roomChance: 0.33, size: [3, 6], density: 0.1 },
        enemyGroups: [
          [lavaSlime, lavaSlime, lavaSlime],
          [hellhound, hellhound, hellhound],
          [flameGolem, lavaSlime, lavaSlime]
        ],
      },
      {
        minRoomSize: 5,
        maxRoomSize: 9,
        splitDepth: 2,
        corridorWidth: 3,
        layout: 'caverns',
        islands: { roomChance: 0.33, size: [3, 6], density: 0.1 },
        enemyGroups: [
          [flameGolem, lavaSlime, lavaSlime],
          [hellhound, hellhound, lavaSlime],
          [hellhound, hellhound, lavaSlime]
        ],
      }
    ],
    bossZone: {
      roomSize: 12,
      corridorWidth: 2,
      layout: 'caverns',
      bossGroup: [BurningSpirit],
    }
  },
  fungal: {
    name: 'The Fungal Forest',
    width: 34,
    height: 26,
    baseEnemyLevel: 1,
    floorColor: '#2c3022',
    wallColor: '#171a11',
    doorObject: 'heavy-door',
    portalObject: 'fungal-portal',
    chestObject: 'basic-treasure-chest',
    zones: [
      {
        minRoomSize: 6,
        maxRoomSize: 11,
        splitDepth: 3,
        corridorWidth: 2,
        layout: 'caverns',
        islands: { roomChance: 0.4, size: [1, 1], density: 0.15 },
        enemyGroups: [
          [gloomtoad, fungalSpore, fungalSpore, fungalSpore],
          [rotflySwarm, rotflySwarm, rotflySwarm, rotflySwarm, rotflySwarm],
          [mirehulk, rotflySwarm, rotflySwarm, rotflySwarm],
          [sporetender, fungalSpore, fungalSpore, fungalSpore],
        ],
      },
      {
        minRoomSize: 6,
        maxRoomSize: 12,
        splitDepth: 3,
        corridorWidth: 3,
        layout: 'caverns',
        islands: { roomChance: 0.6, size: [3, 5], density: 0.2 },
        enemyGroups: [
          [mirehulk, rotflySwarm, rotflySwarm, rotflySwarm],
          [gloomtoad, gloomtoad, rotflySwarm, rotflySwarm, rotflySwarm],
          [sporetender, mirehulk, fungalSpore, fungalSpore],
        ],
      }
    ],
    bossZone: {
      roomSize: 12,
      corridorWidth: 2,
      layout: 'caverns',
      bossGroup: [],
    }
  }
} satisfies Record<string, DungeonConfig>;

/** A dungeon, by its DUNGEON_PRESETS key. */
export type DungeonKey = keyof typeof DUNGEON_PRESETS;

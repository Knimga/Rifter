import { ENEMY_CLASSES } from '../units/enemies';
import { BOSS_CLASSES } from '../units/bosses';
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
const goblinWarrior = ENEMY_CLASSES.find(c => c.id === 'goblin-warrior')!;
const goblinArcher = ENEMY_CLASSES.find(c => c.id === 'goblin-archer')!;
const goblinShaman = ENEMY_CLASSES.find(c => c.id === 'goblin-shaman')!;
const troll = ENEMY_CLASSES.find(c => c.id === 'troll')!;
const echoBats = ENEMY_CLASSES.find(c => c.id === 'echo-bat-swarm')!;
const blackCentipede = ENEMY_CLASSES.find(c => c.id === 'black-centipede')!;
const paleCreeper = ENEMY_CLASSES.find(c => c.id === 'pale-creeper')!;
const eyelax = ENEMY_CLASSES.find(c => c.id === 'eyelax')!;

const Necromancer = BOSS_CLASSES.find(c => c.id === 'necromancer')!;
const BurningSpirit = BOSS_CLASSES.find(c => c.id === 'burning-spirit')!;
const Sporemother = BOSS_CLASSES.find(c => c.id === 'sporemother')!;
const TrollTamer = BOSS_CLASSES.find(c => c.id === 'troll-tamer')!;
const PaleBroodmother = BOSS_CLASSES.find(c => c.id === 'pale-broodmother')!;

export const DUNGEONS: Record<string, DungeonConfig> = {
  crypt: {
    name: 'The Crypt',
    width: 28,
    height: 22, 
    floorColor: '#303030',
    wallColor: '#202020',
    doorObject: 'heavy-door',
    riftColor: [178, 236, 192], // pale, ghostly necrotic green, washed toward white-grey
    keyName: 'Necrotic Key',
    zones: [
      {
        minRoomSize: 4,
        maxRoomSize: 8,
        splitDepth: 3,
        corridorWidth: 2,
        enemyGroups: [
          [skelly, skelly, skelly, skelly],
          [zombie, zombie, skelly, skelly],
          [specter,zombie,zombie]
        ],
      },
      {
        minRoomSize: 5,
        maxRoomSize: 8,
        splitDepth: 2,
        corridorWidth: 2,
        containers: ['worn-treasure-chest'],
        enemyGroups: [
          [specter, skelly, skelly, skelly],
          [zombie, zombie, zombie, zombie],
          [zombie, zombie, zombie, specter],
        ],
      }
    ],
    bossZone: {
      roomSize: 12,
      corridorWidth: 2,
      bossGroup: [Necromancer, skelly, skelly],
      containers: ['solid-treasure-chest'],
    }
  },
  firelands: {
    name: 'The Firelands',
    width: 34,
    height: 30,
    floorColor: '#472424',
    wallColor: '#3d0f0f',
    doorObject: 'heavy-door',
    riftColor: [255, 168, 72],  // fiery orange, deepening to ember red
    keyName: 'Fiery Key',
    zones: [
      {
        minRoomSize: 5,
        maxRoomSize: 8,
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
        containers: ['dead-adventurer'],
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
      containers: ['solid-treasure-chest'],
    }
  },
  fungal: {
    name: 'The Fungal Forest',
    width: 34,
    height: 26,
    floorColor: '#2c3022',
    wallColor: '#171a11',
    doorObject: 'heavy-door',
    riftColor: [218, 230, 124], // sickly spore yellow-green, deepening to moss
    keyName: 'Fetid Key',
    zones: [
      {
        minRoomSize: 6,
        maxRoomSize: 11,
        splitDepth: 3,
        corridorWidth: 2,
        layout: 'caverns',
        islands: { roomChance: 0.5, size: [1, 1], density: 0.15 },
        enemyGroups: [
          [gloomtoad, gloomtoad, rotflySwarm, rotflySwarm, rotflySwarm],
          [mirehulk, mirehulk, rotflySwarm, rotflySwarm, rotflySwarm],
          [sporetender, fungalSpore, fungalSpore, fungalSpore, fungalSpore],
        ],
      },
      {
        minRoomSize: 6,
        maxRoomSize: 12,
        splitDepth: 3,
        corridorWidth: 3,
        layout: 'caverns',
        islands: { roomChance: 0.6, size: [3, 5], density: 0.2 },
        containers: ['dead-adventurer'],
        enemyGroups: [
          [mirehulk, mirehulk, rotflySwarm, rotflySwarm, rotflySwarm],
          [gloomtoad, gloomtoad, gloomtoad],
          [sporetender, mirehulk, fungalSpore, fungalSpore, fungalSpore],
        ],
      }
    ],
    bossZone: {
      roomSize: 12,
      corridorWidth: 2,
      layout: 'caverns',
      bossGroup: [Sporemother, sporetender, sporetender],
      containers: ['solid-treasure-chest'],
    }
  },
  goblin: {
    name: 'The Goblin Fortress',
    width: 30,
    height: 28,
    floorColor: '#28331f',
    wallColor: '#0b160c',
    doorObject: 'heavy-door',
    riftColor: [32, 107, 35], // rich green (#206b23)
    keyName: 'Gnawed Key',
    zones: [
      {
        // Many small square-cut rooms (about 12 a zone) joined by 1-tile hallways
        minRoomSize: 5,
        maxRoomSize: 7,
        splitDepth: 4,
        corridorWidth: 1,
        enemyGroups: [
          [goblinWarrior,goblinWarrior,goblinArcher,],
          [goblinWarrior,goblinWarrior,goblinWarrior,goblinShaman],
          [troll,goblinArcher,goblinArcher],
          [goblinWarrior,goblinWarrior,goblinArcher,goblinShaman],

        ],
      },
      {
        minRoomSize: 5,
        maxRoomSize: 7,
        splitDepth: 4,
        corridorWidth: 1,
        containers: ['worn-treasure-chest'],
        enemyGroups: [
          [troll,goblinWarrior,goblinArcher],
          [goblinWarrior,goblinWarrior,goblinShaman,goblinArcher],
          [troll,goblinArcher,goblinShaman],
          [troll,troll,goblinShaman]
        ],
      }
    ],
    bossZone: {
      roomSize: 12,
      corridorWidth: 1,
      bossGroup: [TrollTamer,troll,troll],
      containers: ['solid-treasure-chest'],
    }
  },
  blind: {
    name: 'The Blind Caverns',
    width: 48,
    height: 18,
    floorColor: '#16171a',
    wallColor: '#060607',
    doorObject: 'heavy-door',
    riftColor: [30, 30, 70],
    keyName: 'Lightless Key',
    zones: [
      {
        minRoomSize: 4,
        maxRoomSize: 10,
        splitDepth: 3,
        corridorWidth: 1,
        layout: 'tunnels',
        enemyGroups: [
          [echoBats,echoBats,echoBats,echoBats,echoBats],
          [paleCreeper,paleCreeper,paleCreeper,paleCreeper],
          [eyelax,eyelax,eyelax]
        ],
      },
      {
        minRoomSize: 4,
        maxRoomSize: 11,
        splitDepth: 3,
        corridorWidth: 1,
        layout: 'tunnels',
        containers: ['dead-adventurer'],
        enemyGroups: [
          [eyelax,eyelax,echoBats,echoBats,echoBats],
          [blackCentipede],
          [paleCreeper,paleCreeper,paleCreeper,paleCreeper]
        ],
      }
    ],
    bossZone: {
      roomSize: 12,
      corridorWidth: 1,
      layout: 'caverns',
      bossGroup: [PaleBroodmother],
      containers: ['solid-treasure-chest'],
    }
  }
} satisfies Record<string, DungeonConfig>;

/** A dungeon, by its DUNGEONS key. */
export type DungeonKey = keyof typeof DUNGEONS;

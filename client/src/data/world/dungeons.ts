import { ENEMY_CLASSES } from '../units/enemies';
import { BOSS_CLASSES } from '../units/bosses';
import { buildDungeon, buildPassage, type DungeonConfig, type DungeonLook, type GenOptions, type PassageConfig } from './dungeonGen';

const skelly = ENEMY_CLASSES.find(c => c.id === 'skeleton')!;
const zombie = ENEMY_CLASSES.find(c => c.id === 'zombie')!;
const specter = ENEMY_CLASSES.find(c => c.id === 'specter')!;
const wight = ENEMY_CLASSES.find(c => c.id === 'wight')!;
const lavaSlime = ENEMY_CLASSES.find(c => c.id === 'lava-slime')!;
const hellhound = ENEMY_CLASSES.find(c => c.id === 'hellhound')!;
const flameGolem = ENEMY_CLASSES.find(c => c.id === 'flame-golem')!;
const fireElemental = ENEMY_CLASSES.find(c => c.id === 'fire-elemental')!;
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
const voidling = ENEMY_CLASSES.find(c => c.id === 'voidling')!;

const Necromancer = BOSS_CLASSES.find(c => c.id === 'necromancer')!;
const BurningSpirit = BOSS_CLASSES.find(c => c.id === 'burning-spirit')!;
const Sporemother = BOSS_CLASSES.find(c => c.id === 'sporemother')!;
const TrollTamer = BOSS_CLASSES.find(c => c.id === 'troll-tamer')!;
const PaleBroodmother = BOSS_CLASSES.find(c => c.id === 'pale-broodmother')!;

export const DUNGEONS: Record<string, DungeonConfig> = {
  crypt: {
    name: 'The Crypt',
    width: 36,
    height: 29,
    terrain: {
      // Grey laid stone: flagstones and coursed blocks
      floor: { color: [40, 40, 60], seam: [24, 24, 28], pattern: 'flagstones', bumpiness: 0.3 },
      walls: { color: [40, 40, 60], finish: 'cyclopean', height: 'low', bumpiness: 0.3 },
    },
    clutter: {
      wall: { objects: ['cobwebs', 'blue-wall-torch'], density: 0.12 },
      ground: { objects: ['scattered-bones'], density: 0.05 },
    },
    doorObject: 'heavy-door',
    riftColor: [178, 236, 192], // pale, ghostly necrotic green, washed toward white-grey
    keyName: 'Necrotic Key',
    zones: [
      {
        minRoomSize: 4,
        maxRoomSize: 8,
        splitDepth: 3,
        corridorWidth: 2,
        obstacles: { objects: ['sarcophagus'], roomChance: 0.4, density: 0.04 },
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
        obstacles: { objects: ['sarcophagus'], roomChance: 0.4, density: 0.04 },
        enemyGroups: [
          [specter, skelly, skelly],
          [wight, skelly, skelly],
          [wight, zombie, specter],
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
    width: 44,
    height: 39,
    terrain: {
      // Red-black cave rock, cracked with glowing lava
      floor: { color: [60, 30, 25], seam: [34, 16, 15], pattern: 'rough-fine', bumpiness: 0.7 },
      walls: { color: [64, 28, 24], finish: 'rough', height: 'high', bumpiness: 0.7 },
      veins: { color: [255, 112, 26], share: 0.09, pattern: 'cracks', glow: true },
    },
    clutter: {
      ground: { objects: ['brown-rubble', 'smoldering-embers'], density: 0.07 },
    },
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
        obstacles: { objects: ['lava-plume'], roomChance: 0.5, density: 0.04 },
        enemyGroups: [
          [lavaSlime, lavaSlime, lavaSlime, lavaSlime],
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
        obstacles: { objects: ['lava-plume'], roomChance: 0.5, density: 0.04 },
        enemyGroups: [
          [fireElemental, lavaSlime, lavaSlime],
          [hellhound, hellhound, flameGolem],
          [hellhound, hellhound, fireElemental]
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
    width: 44,
    height: 34,
    terrain: {
      // Damp olive cave rock, patched with moss
      floor: { color: [54, 53, 40], seam: [30, 33, 22], pattern: 'rough', bumpiness: 0.5 },
      walls: { color: [50, 54, 40], finish: 'rough', height: 'high', bumpiness: 0.6 },
      veins: { color: [56, 84, 38], share: 0.18, pattern: 'patches' },
    },
    clutter: {
      wall: { objects: ['bracket-fungus'], density: 0.12 },
      ground: { objects: ['mushroom-cluster', 'fallen-log', 'low-shrub'], density: 0.08 },
    },
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
        obstacles: { objects: ['tree-trunk'], roomChance: 0.5, density: 0.15 },
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
        containers: ['dead-adventurer'],
        obstacles: { objects: ['tree-trunk'], roomChance: 0.6, density: 0.15 },
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
    width: 39,
    height: 36,
    terrain: {
      // Rough-cut blocks on packed earth
      floor: { color: [50, 40, 35], seam: [30, 28, 22], pattern: 'rough-fine', bumpiness: 0.4 },
      walls: { color: [72, 64, 50], finish: 'masonry', height: 'low', bumpiness: 1 },
    },
    clutter: {
      wall: { objects: ['wall-torch', 'claw-scratches'], density: 0.1 },
      ground: { objects: ['skull', 'loose-rubble'], density: 0.05 },
    },
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
        obstacles: { objects: ['crate-stack'], roomChance: 0.4, density: 0.04 },
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
        obstacles: { objects: ['crate-stack'], roomChance: 0.4, density: 0.04 },
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
    width: 62,
    height: 23,
    terrain: {
      // Near-black, deeply uneven cave rock
      floor: { color: [34, 35, 39], seam: [14, 14, 17], pattern: 'rough', bumpiness: 1 },
      walls: { color: [32, 33, 37], finish: 'rough', height: 'low', bumpiness: 1 },
    },
    clutter: {
      wall: { objects: ['cobwebs', 'claw-scratches'], density: 0.1 },
      ground: { objects: ['scattered-bones', 'loose-rubble'], density: 0.06 },
    },
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
        obstacles: { objects: ['stalagmite-cluster'], roomChance: 0.5, density: 0.08 },
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
        obstacles: { objects: ['stalagmite-cluster'], roomChance: 0.5, density: 0.08 },
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

/** Passages: dungeons of one winding tunnel, no rift, key or boss, whose far door leads to the Sanctum (PassageConfig). */
export const PASSAGES: Record<string, PassageConfig> = {
  // The first dungeon of the game: a void-corrupted cave the party wakes in, its far door the way into the Sanctum
  darkTunnel: {
    name: 'The Dark Tunnel',
    width: 72,
    height: 30,
    terrain: {
      // Near-black violet cave rock, cracked with glowing void
      floor: { color: [30, 27, 40], seam: [15, 13, 22], pattern: 'rough-fine', bumpiness: 0.6 },
      walls: { color: [34, 30, 44], finish: 'rough', height: 'high', bumpiness: 1.8 },
      veins: { color: [60, 24, 150], share: 0.055, pattern: 'cracks', glow: true, halos: 0.65 },
    },
    clutter: {
      wall: { objects: ['claw-scratches'], density: 0.1 },
      ground: { objects: ['loose-rubble'], density: 0.14 },
    },
    doorObject: 'warded-stone-door',
    tunnelWidth: [2, 2],
    startRoomSize: 7,
    fightRooms: { count: [2, 3], size: [9, 11] },
    obstacles: { objects: ['stalagmite-cluster'], roomChance: 0.67, density: 0.06 },
    enemyGroups: [[voidling, voidling, voidling]],
    loot: false,
    // The Crypt's key, lying in the party's way: it takes it, and must find its way out
    foundKey: {
      key: 'crypt',
      name: 'A Strange Object',
      conversation: {
        opening: [
          'A strange glowing object on the ground that beckons you to take it.',
          'If you can escape this place, maybe you can find out what it is.',
        ],
        effects: [{ kind: 'giveQuest', quest: 'escape-dark-tunnel' }],
      },
      // At the door out, the object left behind
      leaving: { opening: ["You can't get that strange object out of your mind... Better go pick it up."] },
    },
  },
} satisfies Record<string, PassageConfig>;

/** Where the game begins: the passage the party arrives in (screens/OpeningScreen, then GameScreen's opening). */
export const OPENING_PASSAGE: PassageKey = 'darkTunnel';

/** A passage, by its PASSAGES key. */
export type PassageKey = keyof typeof PASSAGES;

/** Where the party can be outside the Sanctum: a rift dungeon or a passage, by its key. */
export type AreaKey = DungeonKey | PassageKey;

export const isPassage = (key: AreaKey): boolean => key in PASSAGES;

/** The key a passage has lying in it to be found (PassageConfig.foundKey), if it is one and has one. */
export const foundKeyIn = (key: AreaKey) => (isPassage(key) ? PASSAGES[key].foundKey : undefined);

/** How an area's map is drawn: its name, terrain, clutter and doors. */
export const areaLook = (key: AreaKey): DungeonLook => (isPassage(key) ? PASSAGES[key] : DUNGEONS[key]);

/** A fresh area and its enemies: a rift dungeon (buildDungeon) or a passage (buildPassage). */
export const buildArea = (key: AreaKey, partyLevel: number, gen?: GenOptions) =>
  isPassage(key) ? buildPassage(PASSAGES[key], partyLevel, gen) : buildDungeon(DUNGEONS[key], partyLevel, gen);

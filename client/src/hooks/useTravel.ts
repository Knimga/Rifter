// Changes of map (GameScreen): into a dungeon or passage (a fresh one, from its preset) or back to the Sanctum, and
// through a door into another zone. Every change first fades the map to black (useFadeOut); the new one fades in once
// its 3D layer has drawn (useSceneReady). Where everyone is stays the screen's: this sets it on arrival.
import type { Dispatch, SetStateAction } from 'react';
import { bodyOf, followsParty, type EnemyInstance } from '../data/units/enemies';
import { findOpenTilesNear, posKey, samePos, type Pos } from '../data/world/grid';
import { findFollowerSpawns, placeBodiesNear } from '../data/world/movement';
import { SANCTUM } from '../data/world/sanctum';
import { npcQuestMark } from '../data/world/dialogue';
import type { QuestEvent, QuestLog } from '../data/world/quests';
import { isFreeFloor, zoneRift, type DungeonData, type ZoneData } from '../data/world/gen';
import { buildArea, foundKeyIn, isPassage, type AreaKey } from '../data/world/dungeons';
import { useFadeOut } from './useFadeOut';
import { useLatest } from './useLatest';
import type { useScenes } from './useScenes';

type Setter<T> = Dispatch<SetStateAction<T>>;

export function useTravel(p: {
  /** The party's level: a new dungeon's enemies are built for it. */
  partyLevel: number;
  questLog: QuestLog;
  /** The party did something: the quests waiting on it move on (useDialogue). */
  questDid: (event: QuestEvent) => void;
  /** The key lying to be found in this passage, if any (useLoot): while it lies there, its door out turns the party back. */
  foundKey: ReturnType<typeof foundKeyIn>;
  zone: ZoneData | null;
  dungeon: DungeonData | null;
  currentZone: number;
  enemies: EnemyInstance[];
  combatActive: boolean;
  setLocation: Setter<'sanctum' | 'dungeon'>;
  setDungeonKey: Setter<AreaKey>;
  setDungeon: Setter<DungeonData | null>;
  setCurrentZone: Setter<number>;
  setPlayerPos: Setter<Pos>;
  setFollowerPositions: Setter<Pos[]>;
  setEnemies: Setter<EnemyInstance[]>;
  /** Everything leaving a map resets (the fight, floats, effects, deaths, chests, fog). */
  leaveMap: () => void;
  scenes: Pick<ReturnType<typeof useScenes>, 'arrive' | 'startTurnBack'>;
  /** The Rifter goes dormant (useRifter): the party arrives in the Sanctum. */
  resetRifter: () => void;
  /** Wake the groups that see `pos` (GameScreen): true if a fight began or grew. */
  triggerAggro: (pos: Pos, zoneEnemyList: EnemyInstance[], sight: ReadonlySet<string>, inCombat: boolean) => boolean;
  clearFloats: () => void;
  /** Everyone back to full HP and MP (usePartyMembers): a party wipe. */
  restoreAll: () => void;
}) {
  const { fading, fadeMs, fadeOut } = useFadeOut();

  /**
   * Go back to the Sanctum (`by` a rift, arriving in front of the Rifter, or by a passage's door, arriving inside its
   * door), or into a dungeon or passage (a fresh one, generated from its preset). At once, no fade.
   */
  const changeLocation = (next: 'sanctum' | AreaKey, by: 'rift' | 'door' = 'rift') => {
    p.leaveMap();
    p.setLocation(next === 'sanctum' ? 'sanctum' : 'dungeon');
    // Through the Sanctum's door, the party faces its greeter, who speaks at once if he has a quest for it
    const greeter = next === 'sanctum' && by === 'door' ? SANCTUM.npcs.find(n => n.id === SANCTUM.doorGreeter) : undefined;
    p.scenes.arrive(greeter?.pos ?? null, !!greeter && !!npcQuestMark(greeter.id, p.questLog));

    if (next !== 'sanctum') {
      p.setDungeonKey(next);
      const { dungeon: d, enemies: spawned } = buildArea(next, p.partyLevel);
      p.setDungeon(d);
      p.setCurrentZone(d.startZoneId);
      p.setPlayerPos(d.playerStart);
      p.setEnemies(spawned);
      // The followers take the tiles around the rift the party came through, beside the leader
      const isFree = isFreeFloor(d, d.zones[d.startZoneId], spawned);
      p.setFollowerPositions(findFollowerSpawns(zoneRift(d, d.startZoneId) ?? d.playerStart, q => isFree(q) && !samePos(q, d.playerStart), 2));
    } else {
      p.setDungeon(null);
      p.setCurrentZone(0);
      p.resetRifter(); // its rift closed after use: dormant again
      // Every way back by a rift (or a party wipe) arrives in front of the Rifter; a passage's door, inside the Sanctum's door
      const [leader, ...followers] = by === 'door' ? SANCTUM.doorArrival : SANCTUM.riftArrival;
      p.setPlayerPos(leader);
      p.setFollowerPositions(followers);
      p.setEnemies([]);
    }
  };

  /** Through a door of this zone into another zone of the dungeon (never in a fight). */
  const enterZoneBy = (doorId: string) => {
    const { zone, dungeon, enemies, currentZone } = p;
    if (!zone || !dungeon || p.combatActive) return;

    const door = zone.doors.find(d => d.id === doorId);
    if (!door || door.to === 'sanctum') return; // (out to the Sanctum: goThroughDoor)
    const { zoneId, doorId: pairedId } = door.to;

    const targetZone = dungeon.zones[zoneId];
    const pairedDoor = targetZone.doors.find(d => d.id === pairedId);
    if (!pairedDoor) return;

    // Arrive on the free floor tile closest to the paired door (never on an enemy), followers around it, and the
    // party's forever summons come through too, beside them (an immobile one stays in its zone)
    const isFree = isFreeFloor(dungeon, targetZone, enemies);
    const spawnPos = findOpenTilesNear(pairedDoor.pos, isFree, 1, 4)[0];
    if (!spawnPos) return;
    const followers = findFollowerSpawns(spawnPos, isFree, 2);
    const forever = enemies.filter(e => e.zoneId === currentZone && e.currentHp > 0 && followsParty(e));
    const spots = placeBodiesNear(spawnPos, forever.map(e => bodyOf(e).size ?? 1), isFree, [spawnPos, ...followers].map(posKey), forever.map(() => spawnPos));
    const moved = forever.map((e, i) => ({ ...e, zoneId, pos: spots[i] }));

    p.setCurrentZone(zoneId);
    p.setPlayerPos(spawnPos);
    p.setFollowerPositions(followers);
    if (moved.length) {
      const byId = new Map(moved.map(e => [e.id, e]));
      p.setEnemies(prev => prev.map(e => byId.get(e.id) ?? e));
    }
    p.clearFloats();

    p.triggerAggro(spawnPos, [...enemies.filter(e => e.zoneId === zoneId), ...moved], targetZone.sight, false);
  };

  // (each change as of when the fade ends, with that render's state)
  const changes = useLatest({ changeLocation, enterZoneBy, restoreAll: p.restoreAll });

  /** Into a dungeon through the Rifter's rift (the quests waiting on the party entering it move on), or back. */
  const travel = (next: 'sanctum' | AreaKey) => {
    if (next !== 'sanctum' && !isPassage(next)) p.questDid({ enterRift: next });
    fadeOut(() => changes.current.changeLocation(next));
  };
  /** Through a door: into another zone, or (a passage's way out) into the Sanctum. */
  const goThroughDoor = (doorId: string) => {
    const { zone, foundKey } = p;
    const door = zone?.doors.find(d => d.id === doorId);
    // Out of a passage with its found key still lying in it: the key's words turn the party back instead
    if (door?.to === 'sanctum' && foundKey && zone && Object.values(zone.droppedKeys).includes(foundKey.key)) {
      p.scenes.startTurnBack(door.pos);
      return;
    }
    const out = door?.to === 'sanctum';
    fadeOut(() => (out ? changes.current.changeLocation('sanctum', 'door') : changes.current.enterZoneBy(doorId)));
  };
  /** A party wipe: everyone wakes in the Sanctum at full HP and MP, once the map has faded to black (a repeat call while it fades does nothing). */
  const wipeToSanctum = () => fadeOut(() => {
    changes.current.changeLocation('sanctum');
    changes.current.restoreAll();
  });

  return { changeLocation, travel, goThroughDoor, wipeToSanctum, fading, fadeMs };
}

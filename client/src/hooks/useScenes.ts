// The moments the party watches (GameScreen): while one lasts, the party can't act (move, use abilities or items, open
// windows); its dialogue is still clicked through.
//   arrival   the opening in the Dark Tunnel (useArrival: portals, then the narration)
//   finding   a found key's words (PassageConfig.foundKey), said as it is picked up
//   turnBack  the same key's words at the passage's door while it still lies there (the door stays shut). A 'finding'
//             scene too, told apart by `turnBack` being set instead of `finding`
//   greeting  the Sanctum's door greeter (SANCTUM.doorGreeter) speaking at once, as the party comes through its door
import { useCallback, useEffect, useState } from 'react';
import type { Pos } from '../data/world/grid';
import { SANCTUM, type NpcPlacement } from '../data/world/sanctum';
import { useArrival } from './useArrival';
import { useLatest } from './useLatest';

export type Scene = 'arrival' | 'finding' | 'greeting';

/** How long the party stands in the Sanctum, come through its door, before its greeter speaks (ms). */
const GREETING_PAUSE_MS = 1200;

/**
 * The scene playing (the game begins with the arrival, if `opening`), if any. `mapLoading`: the map is still under its
 * dark cover, which the arrival and the greeting wait out.
 */
export function useScenes({ location, mapLoading, opening }: { location: 'sanctum' | 'dungeon'; mapLoading: boolean; opening: boolean }) {
  const [scene, setScene] = useState<Scene | null>(opening ? 'arrival' : null);
  // The opening's arrival plays once the Dark Tunnel is shown: the party coming through its portals, then told
  const arrival = useArrival(scene === 'arrival' && !mapLoading);
  // The tile the party faces as it appears on a map (its greeter, through the Sanctum's door), if any
  const [faces, setFaces] = useState<Pos | null>(null);
  // Where the found key lies (its words now said) or, at the passage's door, where the party was turned back
  const [finding, setFinding] = useState<Pos | null>(null);
  const [turnBack, setTurnBack] = useState<Pos | null>(null);

  const end = useCallback(() => setScene(null), []);
  const arrive = useCallback((to: Pos | null, greeting = false) => {
    setFaces(to);
    if (greeting) setScene('greeting');
  }, []);
  const startFinding = useCallback((at: Pos) => { setFinding(at); setScene('finding'); }, []);
  const endFinding = useCallback(() => { setFinding(null); setScene(null); }, []);
  const startTurnBack = useCallback((at: Pos) => { setTurnBack(at); setScene('finding'); }, []);
  const endTurnBack = useCallback(() => { setTurnBack(null); setScene(null); }, []);

  return {
    scene,
    /** The party can't act while a scene plays. */
    locked: scene !== null,
    arrival,
    faces,
    finding,
    turnBack,
    /** The greeter is due to speak: the party is through the Sanctum's door, which is shown. */
    greetingDue: scene === 'greeting' && location === 'sanctum' && !mapLoading,
    /** The party appears on a new map, facing `to` if given; `greeting`: its greeter speaks to it first. */
    arrive,
    /** The found key lying on a tile speaks. */
    startFinding,
    endFinding,
    /** The found key speaks at the passage's door, turning the party back. */
    startTurnBack,
    endTurnBack,
    /** The scene is over (the narration is told, the greeting said). */
    end,
  };
}

/**
 * The greeting at the Sanctum's door (scene 'greeting'): `due`, GREETING_PAUSE_MS later its greeter speaks to the party
 * (`talkTo`), unless the party is already talking to someone.
 */
export function useGreeting(due: boolean, talkingTo: NpcPlacement | null, talkTo: (id: string) => void) {
  const talkToRef = useLatest(talkTo);
  useEffect(() => {
    if (!due || talkingTo) return;
    const id = setTimeout(() => talkToRef.current(SANCTUM.doorGreeter), GREETING_PAUSE_MS);
    return () => clearTimeout(id);
  }, [due, talkingTo, talkToRef]);
}

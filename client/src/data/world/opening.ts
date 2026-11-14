// The game's opening: what is told as the party falls into the In-Between (screens/OpeningScreen.tsx), and once it
// has arrived in the Dark Tunnel (GameScreen's arrival: three portals, then this). Told by Narration, a line at a time.

/** Told over the swirl, before the party wakes. */
export const FALLING_LINES: readonly string[] = [
  'You remember things going black...',
  'And then you were falling...',
  'Or... more like sliding. Through a place between places. Sinking deeper into a dense otherness that wiped everything away.',
  'Who you once were is all forgotten. You are only here now. But where is here?',
];

/** Told once the three have come through their portals into the Dark Tunnel; then the game begins. */
export const ARRIVAL_LINES: readonly string[] = [
  'Three strangers in the same plight. You together come to an understanding: all behind you is lost.',
  'Only one thing to do now. One way to go.',
  'Forward.',
];

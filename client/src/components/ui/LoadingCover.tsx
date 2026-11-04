// The dark cover over a 3D scene while it starts (useSceneReady): on at once, fading out when it is ready. With
// `fadeIn`, it also fades in when turned on (a screen fading to black as it leaves).

/** How long the cover takes to fade (ms), in and out, unless told otherwise (`fadeMs`: a slower one, the opening's). */
export const COVER_FADE_MS = 300;

/** `className`: where it sits (position, inset, z-index). */
export default function LoadingCover({ loading, fadeIn = false, fadeMs = COVER_FADE_MS, className }: { loading: boolean; fadeIn?: boolean; fadeMs?: number; className: string }) {
  return (
    <div aria-hidden="true"
      className={`${className} bg-rift-void transition-opacity ${loading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      style={{ transitionDuration: `${!loading || fadeIn ? fadeMs : 0}ms` }} />
  );
}

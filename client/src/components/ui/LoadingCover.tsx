// The dark cover over a 3D scene while it starts (useSceneReady): on at once, fading out when it is ready. With
// `fadeIn`, it also fades in when turned on (a screen fading to black as it leaves).

/** How long the cover takes to fade (ms), in and out. */
export const COVER_FADE_MS = 300;

/** `className`: where it sits (position, inset, z-index). */
export default function LoadingCover({ loading, fadeIn = false, className }: { loading: boolean; fadeIn?: boolean; className: string }) {
  return (
    <div aria-hidden="true"
      className={`${className} bg-rift-void transition-opacity ${loading ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
      style={{ transitionDuration: `${!loading || fadeIn ? COVER_FADE_MS : 0}ms` }} />
  );
}

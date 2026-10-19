// Full-screen background of every screen (UI handoff): a near-black radial gradient, on the menu screens a
// soft --glow tint behind the content and along the bottom edge, and a film-grain overlay.
import type { CSSProperties, ReactNode } from 'react';

/**
 * Where the glow tint sits and how strong it is: `title` = the home menu (stronger, centred higher),
 * `page` = other menu screens. `game` has no tint: the map is the content.
 */
const TINT = {
  title: { center: 'ellipse 60% 48% at 50% 40%', main: 13, bottom: 'ellipse 90% 40% at 50% 112%', edge: 8 },
  page: { center: 'ellipse 70% 40% at 50% 36%', main: 10, bottom: 'ellipse 90% 30% at 50% 108%', edge: 7 },
  game: null,
} as const;
type Variant = keyof typeof TINT;

function backdropStyle(variant: Variant): CSSProperties {
  const t = TINT[variant];
  if (!t) return { background: 'var(--bg-game)' };
  return {
    background: [
      `radial-gradient(${t.center}, color-mix(in srgb, var(--glow) ${t.main}%, transparent) 0%, transparent 70%)`,
      `radial-gradient(${t.bottom}, color-mix(in srgb, var(--glow) ${t.edge}%, transparent) 0%, transparent 70%)`,
      'var(--bg-menu)',
    ].join(', '),
  };
}

/** Film grain over everything (purely decorative, takes no clicks). */
function Grain() {
  return (
    <svg aria-hidden="true" className="absolute inset-0 w-full h-full pointer-events-none" style={{ opacity: 0.07, mixBlendMode: 'overlay' }}>
      <filter id="rf-grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#rf-grain)" />
    </svg>
  );
}

/** A full-screen themed background (gradient, glow tint, grain) with the screen's content on top. */
export default function Backdrop({ variant = 'page', className = '', children }: {
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`relative overflow-hidden min-h-screen font-tech text-rift-ink ${className}`} style={backdropStyle(variant)}>
      <Grain />
      {children}
    </div>
  );
}

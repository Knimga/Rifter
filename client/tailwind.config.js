/** @type {import('tailwindcss').Config} */

// The UI theme's colors as Tailwind classes (`bg-rift-panel`, `text-rift-label`...). The values are the
// CSS variables in src/index.css, the palette's one source.
const RIFT_COLORS = [
  'void', 'sunk', 'panel', 'raised', 'raised-hi',
  'divider', 'seam', 'line', 'edge', 'edge-hi', 'rim', 'rim-hi',
  'bright', 'ink', 'soft', 'muted', 'label', 'off', 'faint',
  'hp', 'mp', 'up', 'down', 'warn', 'affix', 'unusable', 'active', 'ally', 'foe', 'acting', 'loot', 'gold', 'keyname',
];

export default {
  content: [
    './index.html',
    './src/*.{js,ts,jsx,tsx}',
    './src/{components,screens,hooks,data}/**/*.{js,ts,jsx,tsx}',
    // Forge: only the dev page has classes. designs/ and drafts/ are left out on purpose: the
    // builder page's Approve/Discard deletes draft files, and a scanned file that disappears breaks
    // Vite's CSS dependency tracking ("Failed to load url ... in index.css").
    // Dev-only page: not scanned for production builds, so its classes don't ship.
    ...(process.env.NODE_ENV === 'production' ? [] : ['./src/forge/dev/**/*.{js,ts,jsx,tsx}']),
  ],
  theme: {
    extend: {
      fontFamily: {
        display: ['Metamorphous', 'Georgia', 'serif'],   // headings, names, buttons
        tech: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'], // body text, numbers, labels
      },
      colors: {
        rift: Object.fromEntries(RIFT_COLORS.map((name) => [name, `var(--rift-${name})`])),
      },
    },
  },
  plugins: [],
};

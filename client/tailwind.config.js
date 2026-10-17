/** @type {import('tailwindcss').Config} */
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
    extend: {},
  },
  plugins: [],
};

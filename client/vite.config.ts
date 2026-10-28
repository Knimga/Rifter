import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { forgePlugin } from './forge-plugin/vite-plugin-forge';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    // Dev server only (apply: 'serve'): approve/discard/snapshot endpoints for the /dev/forge page.
    forgePlugin({ forgeDir: here('./src/forge'), snapshotDir: here('./forge-snapshots') }),
  ],
  build: {
    // Vite warns past 500 kB per chunk (minified, before gzip); ours are well within what a browser game loads fine
    chunkSizeWarningLimit: 1000,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
});

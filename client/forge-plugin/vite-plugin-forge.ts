// DEV ONLY (apply: 'serve'). Lets the builder page Approve/Discard a draft and save snapshots,
// and keeps the design registries fresh when design files appear or disappear.
// Registered in vite.config.ts.
import { copyFileSync, existsSync, mkdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalizePath, type Plugin } from 'vite';

const ID = /^[a-z0-9-]+$/;

/** forgeDir: absolute path to src/forge. snapshotDir: absolute path for builder-page PNG snapshots. */
export function forgePlugin({ forgeDir, snapshotDir }: { forgeDir: string; snapshotDir: string }): Plugin {
  return {
    name: 'forge-dev',
    apply: 'serve',
    configureServer(server) {
      // Vite does not reliably invalidate the cached import.meta.glob results in the two registries
      // when a design file is added or deleted (Approve/Discard, or Claude Code writing a draft). A stale
      // registry then imports a deleted file and the page goes white. So on any add/remove under
      // designs/ or drafts/: drop both registries from the module cache and reload the page.
      const designDirs = ['designs', 'drafts'].map((d) => normalizePath(join(forgeDir, d)) + '/');
      const registries = [join(forgeDir, 'registry.vite.ts'), join(forgeDir, 'dev', 'draftRegistry.ts')].map(normalizePath);
      let reloadTimer: ReturnType<typeof setTimeout> | undefined;
      const onDesignFileAddedOrRemoved = (file: string) => {
        const f = normalizePath(file);
        if (!f.endsWith('.ts') || !designDirs.some((d) => f.startsWith(d))) return;
        for (const r of registries) for (const mod of server.moduleGraph.getModulesByFile(r) ?? []) server.moduleGraph.invalidateModule(mod);
        clearTimeout(reloadTimer); // coalesce bursts (Approve removes one file and adds another)
        reloadTimer = setTimeout(() => server.ws.send({ type: 'full-reload' }), 150);
      };
      server.watcher.on('add', onDesignFileAddedOrRemoved);
      server.watcher.on('unlink', onDesignFileAddedOrRemoved);

      server.middlewares.use('/__forge', (req, res) => {
        const send = (code: number, body: unknown) => {
          res.statusCode = code;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        const ip = req.socket.remoteAddress ?? '';
        if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) return send(403, { error: 'loopback only' });
        if (req.method !== 'POST') return send(405, { error: 'POST only' });
        // Basic CSRF guard: a page on another origin must not be able to trigger writes.
        const origin = req.headers.origin;
        if (origin && new URL(origin).host !== req.headers.host) return send(403, { error: 'bad origin' });

        const chunks: Buffer[] = [];
        let size = 0;
        req.on('data', (c: Buffer) => {
          size += c.length;
          if (size > 8_000_000) req.destroy();
          else chunks.push(c);
        });
        req.on('end', () => {
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
            const stem = String(body.stem ?? '');
            const url = req.url ?? '';
            const draft = join(forgeDir, 'drafts', `${stem}.ts`);
            const live = join(forgeDir, 'designs', `${stem}.ts`);
            if (url.startsWith('/approve') || url.startsWith('/discard')) {
              if (!ID.test(stem)) return send(400, { error: 'bad id' });
              if (!existsSync(draft)) return send(404, { error: 'no such draft' });
              if (url.startsWith('/approve')) {
                if (existsSync(live)) {
                  const hist = join(forgeDir, '.history');
                  mkdirSync(hist, { recursive: true });
                  copyFileSync(live, join(hist, `${stem}.${new Date().toISOString().replace(/[:.]/g, '-')}.ts`));
                }
                copyFileSync(draft, live);
              }
              unlinkSync(draft);
              onDesignFileAddedOrRemoved(draft);
              return send(200, { ok: true });
            }
            if (url.startsWith('/snapshot')) {
              const name = String(body.name ?? 'snapshot').replace(/[^a-z0-9-_]/gi, '_');
              const data = String(body.pngBase64 ?? '').replace(/^data:image\/png;base64,/, '');
              mkdirSync(snapshotDir, { recursive: true });
              const path = join(snapshotDir, `${name}.png`);
              writeFileSync(path, Buffer.from(data, 'base64'));
              return send(200, { ok: true, path });
            }
            return send(404, { error: 'unknown endpoint' });
          } catch (e) {
            return send(500, { error: String(e) });
          }
        });
      });
    },
  };
}

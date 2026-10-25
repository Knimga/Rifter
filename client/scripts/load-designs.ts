// Node-side design loader (the browser uses import.meta.glob instead; see src/forge/registry.vite.ts).
import { readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { Design } from '../src/forge/core/types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'forge');

export interface LoadedDesign {
  stem: string;
  /** The folder it is in under designs/ (approved designs; core/folders.ts), or '' for a draft (drafts/ is flat). */
  folder: string;
  source: 'approved' | 'draft';
  design: Design;
}

async function loadDir(dir: string, source: 'approved' | 'draft', folder = ''): Promise<LoadedDesign[]> {
  let files: string[] = [];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.startsWith('_'));
  } catch {
    return [];
  }
  const out: LoadedDesign[] = [];
  for (const f of files.sort()) {
    const mod = await import(pathToFileURL(join(dir, f)).href);
    out.push({ stem: f.replace(/\.ts$/, ''), folder, source, design: mod.default as Design });
  }
  return out;
}

export async function loadDesigns(opts: { drafts?: boolean } = {}): Promise<LoadedDesign[]> {
  // Approved designs: one folder per category under designs/ (its own files are helpers)
  const designsDir = join(root, 'designs');
  const folders = readdirSync(designsDir).filter((f) => statSync(join(designsDir, f)).isDirectory()).sort();
  const approved = (await Promise.all(folders.map((f) => loadDir(join(designsDir, f), 'approved', f)))).flat();
  if (!opts.drafts) return approved;
  return [...approved, ...(await loadDir(join(root, 'drafts'), 'draft'))];
}

// The bridge between forge designs and the game's data entries: every design is the model for exactly
// one entry (Design.source), named exactly like it. Used by forge:lint (which enforces the rules below)
// and by the builder page. No three.js; reads game data only.
import type { DataRef, Design, ModelLink } from './core/types';
import { slug } from './core/slug';
import { ENEMY_CLASSES, BOSS_CLASSES } from '../data/enemies';
import { WEAPON_SERIES, weaponName } from '../data/gear/weapons';
import { ARMOR_SERIES, armorName } from '../data/gear/armor';
import { SHIELDS } from '../data/gear/offhands';
import { CLASSES, type ClassKey } from '../data/classes';
import { ARMOR_SLOTS, type WeaponType } from '../data/gear/types';

export interface DataEntry {
  ref: DataRef;
  /** The display name players see; a design for this entry is labelled exactly this. */
  name: string;
  /** Where the entry lives, for people: 'data/gear/weapons.ts › WEAPON_SERIES plain › 1h Swords'. */
  path: string;
  /** The entry's model link (the id of its design). */
  link: ModelLink;
}

export const refKey = (r: DataRef) => `${r.table}:${r.key}`;

/** Every game data entry that can have a model. */
export function allDataEntries(): DataEntry[] {
  const enemies: DataEntry[] = [...ENEMY_CLASSES, ...BOSS_CLASSES].map((c) => ({
    ref: { table: 'enemies', key: c.id },
    name: c.name,
    path: `data/enemies.ts › ${c.id}`,
    link: c.model,
  }));
  const weapons: DataEntry[] = WEAPON_SERIES.flatMap((s) =>
    (Object.entries(s.weapons) as [WeaponType, { model: ModelLink }][]).map(([type, w]) => ({
      ref: { table: 'weapons', key: `${s.id}/${type}` },
      name: weaponName(s, type),
      path: `data/gear/weapons.ts › WEAPON_SERIES ${s.id} › ${type}`,
      link: w.model,
    })),
  );
  const armor: DataEntry[] = ARMOR_SERIES.flatMap((s) =>
    ARMOR_SLOTS.map((slot) => ({
      ref: { table: 'armor', key: `${s.id}/${slot}` },
      name: armorName(s, slot),
      path: `data/gear/armor.ts › ARMOR_SERIES ${s.id} › ${slot}`,
      link: s.models[slot],
    })),
  );
  const offhands: DataEntry[] = SHIELDS.map((s) => ({
    ref: { table: 'offhands', key: s.id },
    name: s.name,
    path: `data/gear/offhands.ts › SHIELDS ${s.id}`,
    link: s.model,
  }));
  const classes: DataEntry[] = (Object.entries(CLASSES) as [ClassKey, (typeof CLASSES)[ClassKey]][]).map(([key, c]) => ({
    ref: { table: 'classes', key },
    name: c.name,
    path: `data/classes.ts › ${key}`,
    link: c.model,
  }));
  return [...enemies, ...weapons, ...armor, ...offhands, ...classes];
}

// Built on first use. Game data is static at runtime (a hot reload re-runs this module).
let byRef: Map<string, DataEntry> | null = null;

export function dataEntry(ref: DataRef): DataEntry | undefined {
  byRef ??= new Map(allDataEntries().map((e) => [refKey(e.ref), e]));
  return byRef.get(refKey(ref));
}

/**
 * Problems tying designs to data entries (empty = all good). `stems` maps design id -> file stem.
 * Rules: the entry exists; the label is exactly the entry's name; the file name is slug(name);
 * at most one design per entry; every link in the data points at a design for that same entry.
 */
export function checkDataRefs(list: { design: Design; stem: string }[]): string[] {
  const problems: string[] = [];
  const byEntry = new Map<string, string>();
  for (const { design, stem } of list) {
    const entry = dataEntry(design.source);
    if (!entry) {
      problems.push(`${design.id}: source ${refKey(design.source)} is not an entry in the game data`);
      continue;
    }
    if (design.label !== entry.name) problems.push(`${design.id}: label "${design.label}" must be exactly "${entry.name}" (${entry.path})`);
    if (stem !== slug(entry.name)) problems.push(`${design.id}: file must be named ${slug(entry.name)}.ts to match "${entry.name}"`);
    const other = byEntry.get(refKey(design.source));
    if (other && other !== design.id) problems.push(`${design.id} and ${other} are both designs for ${entry.path}`);
    byEntry.set(refKey(design.source), design.id);
  }
  const designsById = new Map(list.map(({ design }) => [design.id, design]));
  for (const entry of allDataEntries()) {
    const d = designsById.get(entry.link);
    if (!d) problems.push(`${entry.path}: links ${entry.link}, which has no design file (approved or draft)`);
    else if (refKey(d.source) !== refKey(entry.ref)) problems.push(`${entry.path}: links ${d.id}, but that design is for ${refKey(d.source)}`);
  }
  return problems;
}

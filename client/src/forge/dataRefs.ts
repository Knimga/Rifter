// The bridge between forge designs and the game's data entries: every design is the model for exactly
// one entry (Design.source), named exactly like it. Used by forge:lint (which enforces the rules below)
// and by the builder page. No three.js; reads game data only.
import type { DataRef, Design, ModelLink } from './core/types';
import { slug } from './core/slug';
import { ENEMY_CLASSES, bodySize } from '../data/units/enemies';
import { BOSS_CLASSES } from '../data/units/bosses';
import { SUMMON_CLASSES } from '../data/units/summons';
import { STARTER_WEAPON_SERIES, WEAPON_SERIES, weaponName } from '../data/gear/weapons';
import { ARMOR_SERIES, STARTER_ARMOR_SERIES, armorName } from '../data/gear/armor';
import { OFFHANDS, SHIELDS, STARTER_SHIELDS } from '../data/gear/offhands';
import { JEWELRY } from '../data/gear/jewelry';
import { CLASSES, type ClassKey } from '../data/units/classes';
import { INTERACTIVE_OBJECTS } from '../data/world/interactiveObjects';
import { DECOR_OBJECTS } from '../data/world/decorObjects';
import { LOOT } from '../data/gear/loot';
import { RIFT_MODELS } from '../data/world/rifts';
import { NPCS } from '../data/world/npcs';
import { ARMOR_SLOTS, JEWELRY_KINDS, type WeaponType } from '../data/gear/types';

export interface DataEntry {
  ref: DataRef;
  /** The display name players see; a design for this entry is labelled exactly this. */
  name: string;
  /** Where the entry lives, for people: 'data/gear/weapons.ts › WEAPON_SERIES plain › 1h Swords'. */
  path: string;
  /** The entry's model link (the id of its design). */
  link: ModelLink;
  /** A large creature's square, in tiles a side (2: it stands on 2×2 in game); absent: one tile. */
  tiles?: number;
}

export const refKey = (r: DataRef) => `${r.table}:${r.key}`;

/** How many tiles a side a design's model stands on in game: its entry's (a large creature's 2), else 1. */
export const designTiles = (d: Pick<Design, 'source'>): number => dataEntry(d.source)?.tiles ?? 1;

/** Every game data entry that can have a model. */
export function allDataEntries(): DataEntry[] {
  // Bosses are enemies too (table 'enemies'), kept in their own file
  const enemies: DataEntry[] = [
    ...ENEMY_CLASSES.map((c) => ({ c, file: 'enemies' })),
    ...BOSS_CLASSES.map((c) => ({ c, file: 'bosses' })),
  ].map(({ c, file }) => ({
    ref: { table: 'enemies', key: c.id },
    name: c.name,
    path: `data/units/${file}.ts › ${c.id}`,
    link: c.model,
    ...(c.large ? { tiles: bodySize(c) } : {}),
  }));
  const summons: DataEntry[] = SUMMON_CLASSES.map((c) => ({
    ref: { table: 'summons', key: c.id },
    name: c.name,
    path: `data/units/summons.ts › ${c.id}`,
    link: c.model,
    ...(c.large ? { tiles: bodySize(c) } : {}),
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
  const offhands: DataEntry[] = [
    ...SHIELDS.map((s) => ({ ...s, list: 'SHIELDS' })),
    ...Object.entries(OFFHANDS).flatMap(([kind, o]) => o.drops.map((t) => ({ ...t, list: `${kind} drops` }))),
  ].map((o) => ({
    ref: { table: 'offhands', key: o.id },
    name: o.name,
    path: `data/gear/offhands.ts › ${o.list} ${o.id}`,
    link: o.model,
  }));
  const jewelry: DataEntry[] = JEWELRY_KINDS.flatMap((kind) => JEWELRY[kind].map((t) => ({
    ref: { table: 'jewelry' as const, key: t.id },
    name: t.name,
    path: `data/gear/jewelry.ts › ${kind} ${t.id}`,
    link: t.model,
  })));
  const classes: DataEntry[] = (Object.entries(CLASSES) as [ClassKey, (typeof CLASSES)[ClassKey]][]).map(([key, c]) => ({
    ref: { table: 'classes', key },
    name: c.name,
    path: `data/units/classes.ts › ${key}`,
    link: c.model,
  }));
  const interactive: DataEntry[] = INTERACTIVE_OBJECTS.map((o) => ({
    ref: { table: 'interactiveObjects', key: o.id },
    name: o.name,
    path: `data/world/interactiveObjects.ts › ${o.id}`,
    link: o.model,
  }));
  const decor: DataEntry[] = DECOR_OBJECTS.map((o) => ({
    ref: { table: 'decorObjects', key: o.id },
    name: o.name,
    path: `data/world/decorObjects.ts › ${o.id}`,
    link: o.model,
  }));
  const loot: DataEntry[] = LOOT.map((l) => ({
    ref: { table: 'loot', key: l.id },
    name: l.name,
    path: `data/gear/loot.ts › ${l.id}`,
    link: l.model,
  }));
  const rifts: DataEntry[] = Object.values(RIFT_MODELS).map((r) => ({
    ref: { table: 'rifts', key: r.id },
    name: r.name,
    path: `data/world/rifts.ts › ${r.id}`,
    link: r.model,
  }));
  const npcs: DataEntry[] = NPCS.map((n) => ({
    ref: { table: 'npcs', key: n.id },
    name: n.name,
    path: `data/world/npcs.ts › ${n.id}`,
    link: n.model,
  }));
  return [...enemies, ...summons, ...weapons, ...armor, ...offhands, ...jewelry, ...classes, ...interactive, ...decor, ...loot, ...rifts, ...npcs];
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
    // A blank link ('') is an entry with no design yet: nothing to check (the game draws nothing for it; jewelry
    // without one doesn't drop)
    if (!entry.link) continue;
    const d = designsById.get(entry.link);
    if (!d) problems.push(`${entry.path}: links ${entry.link}, which has no design file (approved or draft)`);
    else if (refKey(d.source) !== refKey(entry.ref)) problems.push(`${entry.path}: links ${d.id}, but that design is for ${refKey(d.source)}`);
  }
  // The one exception: starting gear (the Worn series) has no designs of its own and borrows the models of
  // the tier it is a worn version of. Each borrowed link must be one a real data entry uses.
  const entryLinks = new Set(allDataEntries().map((e) => e.link));
  for (const { path, link } of starterLinks()) {
    if (!entryLinks.has(link)) problems.push(`${path}: borrows ${link}, which is not the model of any game data entry`);
  }
  return problems;
}

/** Model links of the starting gear (STARTER_* series), which borrow the designs of the gear they are worn versions of. */
function starterLinks(): { path: string; link: ModelLink }[] {
  return [
    ...STARTER_WEAPON_SERIES.flatMap((s) => Object.entries(s.weapons).map(([type, w]) => ({ path: `data/gear/weapons.ts › STARTER_WEAPON_SERIES ${s.id} › ${type}`, link: w!.model }))),
    ...STARTER_ARMOR_SERIES.flatMap((s) => ARMOR_SLOTS.map((slot) => ({ path: `data/gear/armor.ts › STARTER_ARMOR_SERIES ${s.id} › ${slot}`, link: s.models[slot] }))),
    ...STARTER_SHIELDS.map((s) => ({ path: `data/gear/offhands.ts › STARTER_SHIELDS ${s.id}`, link: s.model })),
    ...Object.entries(OFFHANDS).flatMap(([kind, o]) => o.starter.map((t) => ({ path: `data/gear/offhands.ts › ${kind} starter ${t.id}`, link: t.model }))),
  ];
}

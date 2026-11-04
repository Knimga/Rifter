// Portraits: a character's model (a party member's class holding their gear, or an NPC), head and shoulders, turned
// slightly to the right. Rendered once per look by the shared icon renderer (lazy-loaded, it pulls in three.js); the
// box stays empty until it is ready.
import { useEffect, useState } from 'react';
import type { ClassKey } from '../../data/units/classes';
import type { Model, ModelLink } from '../../forge/core/types';
import type { HeldWeapon } from '../../forge/equip';
import { characterLookKey, characterModel, npcModel } from '../characterModel';

/** The game HUD's portrait size, px: the party panes' and the action bar's, the same. */
export const HUD_PORTRAIT_SIZE = 56;

// Rendered portraits by look
const cache = new Map<string, string>();

/** A portrait of the model `build` makes (null: none yet), cached by `lookKey` (what it looks like). */
export function ModelPortrait({ lookKey, build, size }: {
  lookKey: string;
  build: () => Model | null;
  /** Box size, px. */
  size: number;
}) {
  const url = cache.get(lookKey);
  const [, setReady] = useState(0);

  useEffect(() => {
    if (url) return;
    const model = build();
    if (!model) return;
    let live = true;
    import('../../viewEngine/three/icons').then(({ renderPortrait }) => {
      if (!cache.has(lookKey)) cache.set(lookKey, renderPortrait(model));
      if (live) setReady((n) => n + 1);
    });
    return () => { live = false; };
  }, [lookKey, url]); // eslint-disable-line react-hooks/exhaustive-deps -- `build` makes the look `lookKey` names

  return (
    <span aria-hidden="true" className="flex-none block box-border overflow-hidden bg-rift-raised-hi border border-rift-edge rounded-sm" style={{ width: size, height: size }}>
      {url && <img src={url} alt="" draggable={false} className="block w-full h-full object-cover" />}
    </span>
  );
}

/** A party member's portrait: their class's character holding their gear. */
export default function Portrait({ classKey, weapon, offhand, size }: {
  classKey: ClassKey;
  weapon?: HeldWeapon;
  offhand?: ModelLink;
  /** Box size, px. */
  size: number;
}) {
  return <ModelPortrait lookKey={characterLookKey(classKey, weapon, offhand)} build={() => characterModel(classKey, weapon, offhand)} size={size} />;
}

/** An NPC's portrait (NPCS id): its model as the map draws it. */
export function NpcPortrait({ npcId, size }: { npcId: string; size: number }) {
  return <ModelPortrait lookKey={`npc:${npcId}`} build={() => npcModel(npcId)} size={size} />;
}

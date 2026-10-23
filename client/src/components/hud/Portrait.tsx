// A party member's portrait: their character model (holding their gear, seeded as on the map), head and
// shoulders, turned slightly to the right. Rendered once per look by the shared icon renderer (lazy-loaded,
// it pulls in three.js); the box stays empty until it is ready.
import { useEffect, useState } from 'react';
import type { ClassKey } from '../../data/units/classes';
import type { ModelLink } from '../../forge/core/types';
import type { HeldWeapon } from '../../forge/equip';
import { characterLookKey, characterModel } from '../characterModel';

// Rendered portraits by look (class + held gear)
const cache = new Map<string, string>();

export default function Portrait({ classKey, weapon, shield, size }: {
  classKey: ClassKey;
  weapon?: HeldWeapon;
  shield?: ModelLink;
  /** Box size, px. */
  size: number;
}) {
  const key = characterLookKey(classKey, weapon, shield);
  const url = cache.get(key);
  const [, setReady] = useState(0);

  useEffect(() => {
    if (url) return;
    const model = characterModel(classKey, weapon, shield);
    if (!model) return;
    let live = true;
    import('../../viewEngine/three/icons').then(({ renderPortrait }) => {
      if (!cache.has(key)) cache.set(key, renderPortrait(model));
      if (live) setReady((n) => n + 1);
    });
    return () => { live = false; };
  }, [key, url]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <span aria-hidden="true" className="flex-none block box-border overflow-hidden bg-rift-raised-hi border border-rift-edge rounded-sm" style={{ width: size, height: size }}>
      {url && <img src={url} alt="" draggable={false} className="block w-full h-full object-cover" />}
    </span>
  );
}

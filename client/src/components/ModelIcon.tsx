// Icon of an item's forge model, rendered once per design by a shared offscreen WebGL context (every item
// of a design looks the same). The renderer is lazy-loaded (it pulls in three.js); until it is ready, or
// while the design isn't approved, the icon's box stays empty. A tinted model (a rift key) takes `tint`, its
// dungeon's color: one icon per design and color. A `turn` (a quaternion) draws the model turned in 3D: one icon per
// design, color and turn.
import { useEffect, useState, type CSSProperties } from 'react';
import type { Design, ModelLink } from '../forge/core/types';
import type { RGB } from '../forge/core/vec';
import type { IconTurn } from '../viewEngine/three/icons';
import { linkedDesign } from '../forge/core/link';
import { designs } from '../forge/registry.vite';

// Rendered icons per design object (a design edited in dev is a new object, so its icons re-render), by tint and turn
const cache = new WeakMap<Design, Map<string, string>>();

export default function ModelIcon({ link, alt, className, tint, turn, style }: { link: ModelLink; alt: string; className: string; tint?: RGB; turn?: IconTurn; style?: CSSProperties }) {
  const design = linkedDesign(designs, link);
  const tintKey = `${tint?.join(',') ?? ''}|${turn?.join(',') ?? ''}`; // the cache key: the color and the turn
  const url = design ? cache.get(design)?.get(tintKey) : undefined;
  const [, setRendered] = useState(0);

  useEffect(() => {
    if (!design || url) return;
    let live = true;
    import('../viewEngine/three/icons').then(({ renderItemIcon }) => {
      const byTint = cache.get(design) ?? new Map<string, string>();
      cache.set(design, byTint);
      if (!byTint.has(tintKey)) byTint.set(tintKey, renderItemIcon(design, tint, turn));
      if (live) setRendered((n) => n + 1);
    });
    return () => { live = false; };
  }, [design, url, tintKey]); // eslint-disable-line react-hooks/exhaustive-deps -- tint and turn are tracked through tintKey

  return url
    ? <img src={url} alt={alt} draggable={false} className={`${className} object-contain`} style={style} />
    : <span className={`${className} inline-block`} style={style} />;
}

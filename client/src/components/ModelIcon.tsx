// Icon of an item's forge model, rendered once per design by a shared offscreen WebGL context (every item
// of a design looks the same). The renderer is lazy-loaded (it pulls in three.js); until it is ready, or
// while the design isn't approved, the icon's box stays empty.
import { useEffect, useState } from 'react';
import type { Design, ModelLink } from '../forge/core/types';
import { linkedDesign } from '../forge/core/link';
import { designs } from '../forge/registry.vite';

// Rendered icon per design object (a design edited in dev is a new object, so its icon re-renders)
const cache = new WeakMap<Design, string>();

export default function ModelIcon({ link, alt, className }: { link: ModelLink; alt: string; className: string }) {
  const design = linkedDesign(designs, link);
  const url = design ? cache.get(design) : undefined;
  const [, setRendered] = useState(0);

  useEffect(() => {
    if (!design || url) return;
    let live = true;
    import('../forge/three/icons').then(({ renderItemIcon }) => {
      if (!cache.has(design)) cache.set(design, renderItemIcon(design));
      if (live) setRendered((n) => n + 1);
    });
    return () => { live = false; };
  }, [design, url]);

  return url
    ? <img src={url} alt={alt} draggable={false} className={`${className} object-contain`} />
    : <span className={`${className} inline-block`} />;
}

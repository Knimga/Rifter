// Icon of a linked forge model (e.g. a weapon item), rendered once by a shared offscreen WebGL context.
// The renderer is lazy-loaded (it pulls in three.js); until it is ready the icon's box stays empty.
import { useEffect, useState } from 'react';
import type { Design, ModelLink } from '../forge/core/types';
import { instanceSeed, linkedDesign } from '../forge/core/link';
import { designs } from '../forge/registry.vite';

// Rendered icons per design object (a design edited in dev is a new object, so its icons re-render)
const cache = new WeakMap<Design, Map<string, string>>();

export default function ModelIcon({ link, instanceId, alt, className }: {
  link: ModelLink;
  /** Stable id of this instance (e.g. the item id); seeds the parts the link leaves free. */
  instanceId: string;
  alt: string;
  className: string;
}) {
  const design = linkedDesign(designs, link);
  const key = `${instanceSeed(link, instanceId)}:${JSON.stringify(link.params)}`;
  const url = design ? cache.get(design)?.get(key) : undefined;
  const [, setRendered] = useState(0);

  useEffect(() => {
    if (!design || url) return;
    let live = true;
    import('../forge/three/icons').then(({ renderLinkedIcon }) => {
      let icons = cache.get(design);
      if (!icons) cache.set(design, (icons = new Map()));
      if (!icons.has(key)) icons.set(key, renderLinkedIcon(design, link, instanceId));
      if (live) setRendered((n) => n + 1);
    });
    return () => { live = false; };
  }, [design, key, url]); // eslint-disable-line react-hooks/exhaustive-deps

  return url
    ? <img src={url} alt={alt} draggable={false} className={`${className} object-contain`} />
    : <span className={`${className} inline-block`} />;
}

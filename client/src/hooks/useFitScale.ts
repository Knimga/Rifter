// A window's scale: as large as fits the viewport (with a margin), never above 1 (the party window, the Rifter).
import { useEffect, useState } from 'react';

/** The scale a window of design size `width` x `height` (px) is drawn at: it shrinks to fit, never grows. */
export function useFitScale(width: number, height: number): number {
  const fit = () => Math.max(0.4, Math.min(1, (window.innerWidth - 40) / width, (window.innerHeight - 40) / height));
  const [scale, setScale] = useState(fit);
  useEffect(() => {
    const onResize = () => setScale(fit());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [width, height]); // eslint-disable-line react-hooks/exhaustive-deps -- fit reads only width and height
  return scale;
}

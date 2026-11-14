// An announcement: large display-font text just above the screen's center, over the map and under the HUD. It fades in
// as it slides up, holds, then fades away (rf-announce), and never takes a click. Render it with a new key for each
// announcement (the next one starts as this one ends: useAnnouncements).
import { useEffect } from 'react';

export interface Announcement {
  id: number;
  text: string;
  /** A CSS color: the text's, and its glow's. */
  color: string;
}

/** How long one announcement lasts (its animation, rf-announce in index.css, runs the same time). */
const DURATION_MS = 2800;

export default function AnnouncementText({ announcement, onEnd }: { announcement: Announcement; onEnd: (id: number) => void }) {
  const { id, text, color } = announcement;
  useEffect(() => {
    const timer = setTimeout(() => onEnd(id), DURATION_MS);
    return () => clearTimeout(timer);
  }, [id, onEnd]);

  return (
    <div role="status" className="rf-announce-pos">
      <div className="rf-announce" style={{ color, animationDuration: `${DURATION_MS}ms` }}>{text}</div>
    </div>
  );
}

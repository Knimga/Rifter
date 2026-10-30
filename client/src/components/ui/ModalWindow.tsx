// A modal window over the game, dimmed and blurred (the party window, the Rifter's) or not (a vendor's): drawn at a fixed design size and
// scaled down to fit smaller screens (never up), with the window frame's faint outer glow. Clicking outside it
// closes it.
import type { CSSProperties, ReactNode } from 'react';
import { useFitScale } from '../../hooks/useFitScale';

/** A modal window's close button (an X), at its header's right. */
export function WindowCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button type="button" className="rf-btn flex-none w-11 h-11 flex items-center justify-center p-0 text-rift-soft" aria-label="Close" onClick={onClose}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
    </button>
  );
}

export default function ModalWindow({ width, height, labelledBy, closeLabel, onClose, dim = true, className = '', style, children }: {
  /** Its design size (px). */
  width: number;
  height: number;
  /** The id of its title (aria-labelledby). */
  labelledBy: string;
  /** What the click-outside button says it closes ('Close party window'). */
  closeLabel: string;
  onClose: () => void;
  /** Dim and blur the game behind it (default). Off: the game stays as it is around it (the vendor's). */
  dim?: boolean;
  /** Its own layout and padding (the frame's look is shared). */
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const scale = useFitScale(width, height);
  return (
    <div className={`fixed inset-0 z-[60] flex items-center justify-center font-tech text-rift-ink ${dim ? 'bg-[rgba(4,5,6,0.76)] backdrop-blur-[2px]' : ''}`}>
      {/* Clicking outside the window closes it */}
      <button type="button" aria-label={closeLabel} tabIndex={-1} onClick={onClose} className="absolute inset-0 w-full h-full p-0 bg-transparent border-0" />
      <div role="dialog" aria-modal="true" aria-labelledby={labelledBy}
        className={`relative flex-none box-border bg-rift-sunk border border-rift-edge rounded-sm ${className}`}
        style={{
          width, height, transform: `scale(${scale})`,
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 30px 90px rgba(0, 0, 0, 0.8), 0 0 90px color-mix(in srgb, var(--glow) 7%, transparent)',
          ...style,
        }}>
        {children}
      </div>
    </div>
  );
}

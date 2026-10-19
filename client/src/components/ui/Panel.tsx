// The UI theme's panel (.rf-panel in index.css): a dark slab holding related information, with an optional
// small-caps title.
import type { HTMLAttributes, ReactNode } from 'react';

/**
 * A panel or section title (.rf-label / .rf-h in index.css): `label` = small grey caps (the menu screens),
 * `heading` = display-font caps (the party window).
 */
export function PanelTitle({ variant = 'label', children, className = '' }: { variant?: 'label' | 'heading'; children: ReactNode; className?: string }) {
  return <h3 className={`${variant === 'heading' ? 'rf-h' : 'rf-label'} ${className}`}>{children}</h3>;
}

export default function Panel({ title, className = '', children, ...rest }: HTMLAttributes<HTMLElement> & { title?: ReactNode }) {
  return (
    <section className={`rf-panel px-6 py-[22px] ${className}`} {...rest}>
      {title && <PanelTitle className="mb-3">{title}</PanelTitle>}
      {children}
    </section>
  );
}

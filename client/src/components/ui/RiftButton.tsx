// The UI theme's raised button (.rf-btn in index.css): display font, uppercase, wide tracking, glows on hover.
import type { ButtonHTMLAttributes } from 'react';

/** Sizes: `lg` = title / start buttons, `md` = panel actions, `sm` = HUD buttons. */
const SIZE = {
  lg: 'min-h-[56px] px-16 text-sm tracking-[0.25em]',
  md: 'min-h-[44px] px-6 text-xs tracking-[0.2em]',
  sm: 'min-h-[44px] px-5 text-xs tracking-[0.2em]',
} as const;

export default function RiftButton({ size = 'md', className = '', type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & {
  size?: keyof typeof SIZE;
}) {
  // The trailing letter-spacing is balanced with a little extra left padding (indent) so the text sits centred
  return <button type={type} className={`rf-btn ${SIZE[size]} ${className}`} style={{ textIndent: '0.2em' }} {...rest} />;
}

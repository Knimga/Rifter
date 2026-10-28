// The party window's keyring: every rift key the party holds, in one dark box,
// two columns of ten filled top to bottom, in the order obtained. A row: the key's icon (the keystone model in
// its dungeon's color, turned 45° as the mockup has it, with a soft glow), its name, and its dungeon on the right.
import { DUNGEONS, type DungeonKey } from '../data/world/dungeons';
import { RIFT_MODELS, riftGlowCss } from '../data/world/rifts';
import ModelIcon from './ModelIcon';
import type { RGB } from '../forge/core/vec';

/**
 * A rift key's icon: the keystone model in the key's color, turned 45°, glowing softly in it (`glow`: the glow's
 * spread, px). 18 px on the keyring and the Rifter's list; `className` sizes it otherwise (the Rifter's socket).
 */
export function KeyIcon({ color, className = 'w-[18px] h-[18px]', glow = 3, strength = 60 }: { color: RGB; className?: string; glow?: number; strength?: number }) {
  return (
    <ModelIcon link={RIFT_MODELS.keystone.model} alt="" tint={color} className={`flex-none -rotate-45 ${className}`}
      style={{ filter: `drop-shadow(0 0 ${glow}px color-mix(in srgb, ${riftGlowCss(color)} ${strength}%, transparent))` }} />
  );
}

export default function Keyring({ keys }: { keys: readonly DungeonKey[] }) {
  // No keys yet: the empty box says so, dimly, in its middle
  if (keys.length === 0) {
    return (
      <div role="list" aria-label="Keyring" className="rf-keyring" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="text-[11px] tracking-[0.14em] uppercase" style={{ color: 'var(--rift-cap)' }}>No keys found yet</span>
      </div>
    );
  }
  return (
    <div role="list" aria-label="Keyring" className="rf-keyring">
      {keys.map((k) => {
        const { keyName, name, riftColor } = DUNGEONS[k];
        return (
          <div key={k} role="listitem" className="rf-key" aria-label={`${keyName}, ${name}`}>
            <KeyIcon color={riftColor} />
            <span className="text-xs whitespace-nowrap text-rift-keyname">{keyName}</span>
            <span className="ml-auto text-[11px] whitespace-nowrap text-rift-label">{name}</span>
          </div>
        );
      })}
    </div>
  );
}

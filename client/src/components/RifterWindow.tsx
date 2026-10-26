// The Rifter's window (UI handoff: Rifter device modal): pick one of the party's rift keys to set in the device,
// then open its rift. Opened from the Sanctum's Rifter (its receptacle, the leader beside it). A centred dialog
// over the dimmed game, at a fixed design size (it scales down to fit, never up):
//   - the device: rings around the socket, tinted and turning in the set key's color (faster once open), the key
//     in the socket, and a readout of what it opens;
//   - the keys: every key on the keyring, in the order obtained; clicking one picks it (shown in the socket here);
//   - the button: Insert a key (none picked, disabled) / Open rift / Rift open (the picked key's rift is open).
// Opening another key's rift while one is open swaps them (the Rifter closes the old, then opens the new). Keys are
// never used up. Taking a key out (and so closing the rift) comes later.
import { useState, type CSSProperties } from 'react';
import { DUNGEONS, type DungeonKey } from '../data/world/dungeons';
import { riftGlowCss } from '../data/world/rifts';
import { KeyIcon } from './Keyring';
import ModalWindow from './ui/ModalWindow';

/** The window's design size (px). */
const WIDTH = 440, HEIGHT = 690;

/** A rift key's color as CSS, at `pct`% (the rest transparent). */
const tintPct = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** The device art: the rings around the socket, and the key set in it (or the empty socket's outline). */
function Device({ color, open }: { color: string | null; open: boolean }) {
  const ring = color ? tintPct(color, open ? 85 : 40) : 'var(--rift-edge)';
  const rim = color ? tintPct(color, open ? 90 : 50) : 'var(--rift-line)';
  const fast = open ? 'is-fast' : '';
  return (
    <div aria-hidden="true" className="relative flex-none w-[160px] h-[160px] -mt-1.5">
      <svg width="160" height="160" viewBox="0 0 160 160" fill="none" className="absolute inset-0">
        <circle cx="80" cy="80" r="76" stroke="var(--rift-edge)" strokeWidth="1" />
        <g className={`rf-spin ${fast}`}>
          <circle cx="80" cy="80" r="68" stroke={ring} strokeWidth="1.2" strokeDasharray="2 7" strokeLinecap="round" />
          <path d="M80 8v10M80 142v10M8 80h10M142 80h10" stroke={ring} strokeWidth="1.6" strokeLinecap="round" />
        </g>
        <g className={`rf-spin-r ${fast}`}>
          <circle cx="80" cy="80" r="56" stroke={ring} strokeWidth="1" strokeDasharray="14 5 3 5" />
          <path d="M80 22l3 6h-6zM138 80l-6 3v-6zM80 138l-3-6h6zM22 80l6-3v6z" fill={ring} />
        </g>
        <circle cx="80" cy="80" r="42" fill="var(--rift-void)" stroke="var(--rift-line)" strokeWidth="1.5" />
        {color && (
          <>
            <defs>
              <radialGradient id="rf-socket-core">
                <stop offset="0%" stopColor={color} stopOpacity={open ? 0.45 : 0.16} />
                <stop offset="75%" stopColor={color} stopOpacity={0} />
              </radialGradient>
            </defs>
            <circle cx="80" cy="80" r="42" fill="url(#rf-socket-core)" />
          </>
        )}
        <circle cx="80" cy="80" r="42" stroke={rim} strokeWidth="1" />
      </svg>
      {!color && (
        // The empty socket: a dashed outline of a key, breathing
        <svg className="rf-breathe absolute inset-0" width="160" height="160" viewBox="0 0 160 160" fill="none">
          <g transform="rotate(45 80 80)"><rect x="62" y="48" width="36" height="64" rx="18" stroke="var(--rift-cap)" strokeWidth="1.5" strokeDasharray="4 5" /></g>
        </svg>
      )}
    </div>
  );
}

export default function RifterWindow({ keys, inserted, open: riftOpen, onOpenRift, onClose }: {
  /** The party's rift keys, in the order obtained (the keyring). */
  keys: readonly DungeonKey[];
  /** The key set in the device, if any. */
  inserted: DungeonKey | null;
  /** Its rift is open. */
  open: boolean;
  /** Open the picked key's rift (swapping it in, if another's is open). */
  onOpenRift: (key: DungeonKey) => void;
  onClose: () => void;
}) {
  // The key picked in the window (the device's own until another is picked): Open rift opens its rift
  const [picked, setPicked] = useState<DungeonKey | null>(inserted);
  const key = picked ? DUNGEONS[picked] : null;
  // The picked key's rift is the one open
  const open = riftOpen && picked === inserted;
  const color = key ? riftGlowCss(key.riftColor) : null;
  const go = open ? { cls: 'is-open', label: 'Rift open' } : key ? { cls: 'is-ready', label: 'Open rift' } : { cls: 'is-off', label: 'Insert a key' };

  return (
    <ModalWindow width={WIDTH} height={HEIGHT} labelledBy="rifter-title" closeLabel="Close the Rifter" onClose={onClose}
      className="flex flex-col pt-5 px-6 pb-[22px]" style={color ? ({ '--kc': color } as CSSProperties) : undefined}>

        <header className="flex-none flex items-center justify-between gap-4 min-h-[52px]">
          <div className="min-w-0">
            <h2 id="rifter-title" className="m-0 font-display font-normal text-[26px] tracking-[0.06em] leading-[1.1] text-rift-bright">The Rifter</h2>
            <p className="mt-1.5 mb-0 text-xs tracking-[0.14em] uppercase text-rift-muted">Arcane rift device</p>
          </div>
          <button type="button" className="rf-btn flex-none w-11 h-11 p-0 text-rift-soft" aria-label="Close" onClick={onClose}>
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M2 2l10 10M12 2L2 12" /></svg>
          </button>
        </header>

        {/* The device */}
        <section aria-label="Device" className="rf-panel flex-none mt-3.5 h-[232px] flex flex-col items-center justify-center p-3"
          style={color ? { backgroundImage: `radial-gradient(ellipse 60% 70% at 50% 42%, ${tintPct(color, open ? 20 : 9)} 0%, transparent 100%)` } : undefined}>
          <div className="relative">
            <Device color={color} open={open} />
            {key && (
              // The key in the socket: the keystone, glowing in its color (brighter once open)
              <div className="absolute inset-0 -mt-1.5 flex items-center justify-center pointer-events-none">
                <KeyIcon color={key.riftColor} className="w-[74px] h-[74px]" glow={open ? 12 : 6} strength={open ? 95 : 70} />
              </div>
            )}
          </div>
          <div role="status" className="flex-none mt-2 text-center min-h-10">
            <div className={`font-display text-[17px] tracking-[0.08em] leading-[1.2] ${key ? 'text-rift-bright' : 'text-rift-muted'}`}>
              {open ? 'Rift open' : key ? key.keyName : 'No key inserted'}
            </div>
            <div className="mt-[5px] text-[11px] tracking-[0.14em] uppercase" style={{ color: open && color ? color : key ? 'var(--rift-muted)' : 'var(--rift-cap)' }}>
              {open && key ? key.name : key ? `Opens ${key.name}` : 'Select a key below'}
            </div>
          </div>
        </section>

        {/* The keys */}
        <div className="flex-none flex items-baseline justify-between mt-3.5 px-0.5 pb-[7px]">
          <h3 className="rf-h">Keys</h3>
          <span className="text-xs text-rift-muted">{keys.length} {keys.length === 1 ? 'key' : 'keys'}</span>
        </div>
        <div role="listbox" aria-label="Keys" className="rf-rifter-keys">
          {keys.map((k) => {
            const { keyName, name, riftColor } = DUNGEONS[k];
            const sel = k === picked;
            return (
              <button key={k} type="button" role="option" aria-selected={sel}
                aria-label={`${keyName}, ${name}${sel ? ', inserted' : ''}`}
                className={`rf-krow ${sel ? 'is-sel' : ''}`} style={{ '--kc': riftGlowCss(riftColor) } as CSSProperties}
                onClick={() => setPicked(k)}>
                <KeyIcon color={riftColor} />
                <span className="text-xs whitespace-nowrap text-rift-keyname">{keyName}</span>
                <span className="ml-auto text-[11px] whitespace-nowrap text-rift-label">{name}</span>
              </button>
            );
          })}
        </div>

        <button type="button" className={`rf-btn rf-go ${go.cls} flex-none mt-3.5`} aria-disabled={!key || open}
          onClick={() => { if (picked && !open) onOpenRift(picked); }}>
          {go.label}
        </button>
    </ModalWindow>
  );
}

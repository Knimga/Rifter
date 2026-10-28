// Character select, "Assemble Your Party": pick three classes (each at most once), name
// them and set their marching order. A focused class shows its dossier: roles, passives, armor and weapon
// proficiencies, and abilities.
import { lazy, Suspense, useMemo, useRef, useState, type MouseEvent } from 'react';
import { CLASSES, ROLE_ICONS, type ClassKey, type ArmorProficiency, type Role } from '../data/units/classes';
import { capitalizeWords, formatPassiveValue, formatStatLabel } from '../data/detailStrings';
import { heldWeapon } from '../data/gear';
import { HERO_NAMES, startingGear } from '../data/units/party';
import { pick } from '../data/random';
import Backdrop from '../components/ui/Backdrop';
import RiftButton from '../components/ui/RiftButton';
import Panel, { PanelTitle } from '../components/ui/Panel';
import AbilityCard from '../components/ui/AbilityCard';
import { Hint } from '../components/Tooltip';
import LoadingCover from '../components/ui/LoadingCover';
import { useSceneReady } from '../hooks/useSceneReady';
import { useFadeOut } from '../hooks/useFadeOut';

// The class models (three.js): lazy, so the menu screens don't pull in the renderer up front
const ClassShowcase = lazy(() => import('../components/ClassShowcase'));

/** A party slot: a class and the name given to it. */
export interface PartyPick {
  classKey: ClassKey;
  name: string;
}
type Slot = { classKey: ClassKey | null; name: string };

const CLASS_KEYS = Object.keys(CLASSES) as ClassKey[];
const ARMOR_TYPES: ArmorProficiency[] = ['Cloth', 'Light', 'Medium', 'Heavy'];
const ROLE_ORDER: Role[] = ['tank', 'healer', 'melee', 'ranged', 'caster'];
const ROLE_LABEL: Record<Role, string> = { tank: 'Tank', healer: 'Healer', melee: 'Melee', ranged: 'Ranged', caster: 'Caster' };
const MARCH_LABEL = ['1 · Front', '2 · Middle', '3 · Rear'];
const ORDINAL = ['1st', '2nd', '3rd'];
const EMPTY: Slot[] = [{ classKey: null, name: '' }, { classKey: null, name: '' }, { classKey: null, name: '' }];

const rolesOf = (key: ClassKey) => ROLE_ORDER.filter((r) => CLASSES[key].roles.includes(r));

function RoleIcons({ roles, labels = false }: { roles: Role[]; labels?: boolean }) {
  return (
    <span className={`flex flex-wrap ${labels ? 'gap-x-4 gap-y-1.5' : 'gap-2.5 justify-center'}`}>
      {roles.map((r) => {
        const Icon = ROLE_ICONS[r];
        return (
          labels ? (
            <span key={r} className="inline-flex items-center gap-2 text-xs tracking-[0.04em] text-rift-soft">
              <Icon className="w-[18px] h-[18px]" />
              {ROLE_LABEL[r]}
            </span>
          ) : (
            <Hint key={r} text={ROLE_LABEL[r]}>
              <span className="inline-flex text-rift-muted"><Icon className="w-[18px] h-[18px]" aria-label={ROLE_LABEL[r]} /></span>
            </Hint>
          )
        );
      })}
    </span>
  );
}

export default function CharacterSelectScreen({ onStart, onBack }: {
  onStart: (party: PartyPick[]) => void;
  onBack: () => void;
}) {
  const [focusKey, setFocusKey] = useState<ClassKey | null>(null);
  const [hoverKey, setHoverKey] = useState<ClassKey | null>(null);
  const [slots, setSlots] = useState<Slot[]>(EMPTY);
  const classRowRef = useRef<HTMLDivElement>(null);
  // The screen stays under a dark cover until the class models have drawn (useSceneReady), as the game's map does,
  // and fades to black before it leaves (useFadeOut)
  const { loading: showcaseLoading, onReady: onShowcaseReady } = useSceneReady('character-select');
  const { fading, fadeOut } = useFadeOut();
  // Each class's starting weapon, so weapon abilities show its AP cost and element in the dossier
  const startingWeapons = useMemo(() => Object.fromEntries(CLASS_KEYS.map((k) => [k, heldWeapon(startingGear(k))])), []);

  const filled = slots.filter((s) => s.classKey).length;
  const named = slots.filter((s) => s.classKey && s.name.trim()).length;
  const ready = filled === 3 && named === 3;
  const placeOf = (key: ClassKey) => slots.findIndex((s) => s.classKey === key);
  const update = (fn: (next: Slot[]) => void) => setSlots((prev) => { const next = prev.map((s) => ({ ...s })); fn(next); return next; });

  // A class goes into the first empty slot of the marching order (or leaves the party)
  const toggleInParty = (key: ClassKey) => update((next) => {
    const at = next.findIndex((s) => s.classKey === key);
    if (at >= 0) next[at] = { classKey: null, name: '' };
    else {
      const free = next.findIndex((s) => !s.classKey);
      if (free >= 0) next[free] = { classKey: key, name: '' };
    }
  });
  const removeAt = (i: number) => update((next) => { next[i] = { classKey: null, name: '' }; });
  const moveAt = (i: number, d: -1 | 1) => update((next) => { [next[i], next[i + d]] = [next[i + d], next[i]]; });
  const renameAt = (i: number, name: string) => update((next) => { next[i].name = capitalizeWords(name); });
  // A name from the pool that no one in the party already has
  const randomNameAt = (i: number) => update((next) => {
    const used = new Set(next.map((s) => s.name.toLowerCase()));
    const pool = HERO_NAMES.filter((n) => !used.has(n.toLowerCase()));
    next[i].name = pool.length ? pick(pool) : HERO_NAMES[0];
  });

  const stepText = filled === 0 ? 'Choose three heroes for your party.'
    : filled < 3 ? `Choose ${3 - filled} more.` : 'Name your heroes and set their marching order.';
  const startHint = filled < 3 ? `${3 - filled} more to choose`
    : named < 3 ? `${3 - named} ${3 - named === 1 ? 'name' : 'names'} missing` : 'Party ready';
  // A full party with no one who can heal: worth a warning (not a block)
  const noHealer = filled === 3 && !slots.some((s) => s.classKey && CLASSES[s.classKey].roles.includes('healer'));

  const focus = focusKey ? CLASSES[focusKey] : null;
  const focusInParty = focusKey ? placeOf(focusKey) >= 0 : false;
  // Clicks that reach the background clear the focus (interactive parts stop them)
  const stop = (e: MouseEvent) => e.stopPropagation();

  return (
    <Backdrop variant="page" className="flex flex-col">
      <div className="relative z-[1] flex-1 w-full max-w-[1600px] mx-auto box-border px-12 pt-9 pb-8 flex flex-col gap-6" onClick={() => setFocusKey(null)}>

        <header className="relative box-border px-24 text-center">
          <button type="button" onClick={(e) => { stop(e); fadeOut(onBack); }}
            className="rf-link absolute left-0 top-1 inline-flex items-center gap-2.5 min-h-[44px] text-xs tracking-[0.16em] uppercase text-rift-muted bg-transparent border-0">
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25"><path d="M13 8H3M7 4L3 8l4 4" /></svg>
            Back
          </button>
          <h1 className="m-0 font-display font-normal leading-[1.1] tracking-[0.1em] text-rift-ink"
            style={{ fontSize: 'clamp(26px, 3.2vw, 40px)', textShadow: '0 -1px 0 rgba(255, 255, 255, 0.07), 0 3px 2px rgba(0, 0, 0, 0.85), 0 0 36px color-mix(in srgb, var(--glow) 14%, transparent)' }}>
            Assemble Your Party
          </h1>
          <p className="mt-3 mb-0 min-h-5 text-[13px] tracking-[0.06em] text-rift-muted">{stepText}</p>
        </header>

        {/* Classes: a column each, its model drawn by ClassShowcase over the marked slot */}
        <section aria-label="Classes" ref={classRowRef} className="relative -mx-2 px-2 pt-9">
          <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${CLASS_KEYS.length}, minmax(136px, 1fr))` }}>
            {CLASS_KEYS.map((key) => {
              const c = CLASSES[key];
              const at = placeOf(key);
              const focused = focusKey === key;
              return (
                <button key={key} type="button"
                  className={`rf-col ${focused ? 'is-focused' : ''} ${focusKey && !focused ? 'is-dim' : ''}`}
                  aria-pressed={focused}
                  onClick={(e) => { stop(e); setFocusKey(key); }}
                  onMouseEnter={() => setHoverKey(key)}
                  onMouseLeave={() => setHoverKey((k) => (k === key ? null : k))}>
                  {at >= 0 && <span className={`rf-badge ${at === 0 ? 'is-lead' : ''}`}>{ORDINAL[at]}</span>}
                  <span data-showcase-slot={key} aria-hidden="true" className="block w-full h-[236px]" />
                  <span className="rf-col-name block mt-[18px] font-display text-[21px] tracking-[0.08em]">{c.name}</span>
                  <span className="mt-2.5 min-h-[18px]"><RoleIcons roles={rolesOf(key)} /></span>
                  <span className="rf-col-text block max-w-[210px] mt-2 text-xs leading-[1.55] text-rift-muted" style={{ textWrap: 'pretty' }}>{c.description}</span>
                </button>
              );
            })}
          </div>
          <Suspense fallback={null}>
            <ClassShowcase hostRef={classRowRef} onReady={onShowcaseReady} items={CLASS_KEYS.map((key) => ({
              classKey: key,
              active: hoverKey === key || focusKey === key,
              focused: focusKey === key,
              dim: !!focusKey && focusKey !== key && hoverKey !== key,
            }))} />
          </Suspense>
        </section>

        <div className="flex flex-wrap items-stretch gap-6">

          {/* The focused class's dossier */}
          <Panel aria-label="Class details" className="flex-[1_1_420px] min-w-0 flex flex-col justify-center" onClick={stop}>
            {focus && focusKey ? (
              <div className="flex flex-col gap-5">
                <div className="flex items-center justify-between gap-4">
                  {/* Name with its roles beneath, so the button keeps its place however many roles there are */}
                  <div className="min-w-0 flex flex-col gap-2">
                    <h2 className="m-0 font-display font-normal text-[26px] leading-[1.1] tracking-[0.08em] text-rift-bright">{focus.name}</h2>
                    <RoleIcons roles={rolesOf(focusKey)} labels />
                  </div>
                  <RiftButton size="md" disabled={!focusInParty && filled === 3} onClick={() => toggleInParty(focusKey)}>
                    {focusInParty ? 'Remove from Party' : filled === 3 ? 'Party Full' : 'Add to Party'}
                  </RiftButton>
                </div>

                <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(150px, 100%), 1fr))' }}>
                  <div>
                    <PanelTitle className="mb-3">Passives</PanelTitle>
                    {Object.entries(focus.passives).map(([stat, p]) => (
                      <p key={stat} className="m-0 mb-2 text-[13px] leading-[1.4]">
                        <span className="font-medium text-rift-ink">{formatPassiveValue(stat, p)}</span>{' '}
                        <span className="text-rift-muted">{formatStatLabel(stat)}</span>
                        <span className="block text-[11px] text-rift-label">{p.name}</span>
                      </p>
                    ))}
                  </div>
                  <div>
                    <PanelTitle className="mb-3">Armor</PanelTitle>
                    <div className="flex flex-wrap gap-1.5">
                      {ARMOR_TYPES.map((a) => <span key={a} className={`rf-chip ${focus.armorProficiencies.includes(a) ? 'is-lit' : ''}`}>{a}</span>)}
                    </div>
                  </div>
                  <div>
                    <PanelTitle className="mb-3">Weapons</PanelTitle>
                    <div className="flex flex-wrap gap-1.5">
                      {focus.weaponProficiencies.map((w) => <span key={w} className="rf-chip is-plain">{w}</span>)}
                    </div>
                  </div>
                </div>

                <div>
                  <PanelTitle className="mb-3">Abilities</PanelTitle>
                  <div className="grid gap-2.5" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))' }}>
                    {focus.abilities.map((a) => <AbilityCard key={a.name} ability={a} weapon={startingWeapons[focusKey]} />)}
                  </div>
                </div>
              </div>
            ) : (
              <p className="m-0 text-[13px] leading-[1.6] text-rift-muted">Select a class to read its dossier.</p>
            )}
          </Panel>

          {/* The party, in marching order */}
          <Panel aria-label="Your party" className="flex-[1.5_1_560px] min-w-0 flex flex-col gap-4" onClick={stop}>
            <div className="flex items-baseline justify-between gap-3">
              <PanelTitle>Marching Order</PanelTitle>
              <span className="text-xs text-rift-muted">{filled} / 3</span>
            </div>
            <p className="-mt-1.5 mb-0 text-xs leading-[1.5] text-rift-muted">The party marches left to right. Slot 1 leads.</p>
            <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))' }}>
              {slots.map((s, i) => (
                <div key={i} className={`rf-slot ${s.classKey ? 'is-filled' : 'is-empty'} min-h-[150px] px-3.5 pt-3.5 pb-4 gap-2.5`}>
                  <span className="rf-label">{MARCH_LABEL[i]}</span>
                  {s.classKey ? (
                    <>
                      <span className="flex flex-col gap-1">
                        <span className="font-display text-[19px] tracking-[0.06em] text-rift-bright">{CLASSES[s.classKey].name}</span>
                        <span className="flex"><RoleIcons roles={rolesOf(s.classKey)} /></span>
                      </span>
                      <span className="absolute top-0 right-0 flex">
                        {i > 0 && (
                          <Hint text="Move toward the front">
                            <button type="button" className="rf-icon-btn w-9 h-10" aria-label={`Move ${CLASSES[s.classKey].name} earlier in the march`} onClick={() => moveAt(i, -1)}>
                              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><path d="M9 3L5 7l4 4" /></svg>
                            </button>
                          </Hint>
                        )}
                        {i < 2 && (
                          <Hint text="Move toward the rear">
                            <button type="button" className="rf-icon-btn w-9 h-10" aria-label={`Move ${CLASSES[s.classKey].name} later in the march`} onClick={() => moveAt(i, 1)}>
                              <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round"><path d="M5 3l4 4-4 4" /></svg>
                            </button>
                          </Hint>
                        )}
                        <Hint text="Remove from party">
                          <button type="button" className="rf-icon-btn w-9 h-10" aria-label={`Remove ${CLASSES[s.classKey].name} from party`} onClick={() => removeAt(i)}>
                            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.25"><path d="M3 3l8 8M11 3l-8 8" /></svg>
                          </button>
                        </Hint>
                      </span>
                      <label htmlFor={`rf-name-${i}`} className="mt-auto rf-label">Name</label>
                      <span className="flex gap-1.5 -mt-1">
                        <input id={`rf-name-${i}`} className="rf-input flex-1 min-w-0 font-tech text-sm tracking-[0.02em]" type="text" maxLength={16}
                          autoComplete="off" spellCheck={false} placeholder="Enter a name" value={s.name} onChange={(e) => renameAt(i, e.target.value)} />
                        <Hint text="Randomize name" className="flex-none inline-flex">
                          <button type="button" className="rf-box-btn flex-none w-10 h-10" aria-label={`Randomize name for ${CLASSES[s.classKey].name}`} onClick={() => randomNameAt(i)}>
                            <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"><rect x="3" y="3" width="12" height="12" rx="2" /><circle cx="6.5" cy="6.5" r="0.9" fill="currentColor" stroke="none" /><circle cx="9" cy="9" r="0.9" fill="currentColor" stroke="none" /><circle cx="11.5" cy="11.5" r="0.9" fill="currentColor" stroke="none" /></svg>
                          </button>
                        </Hint>
                      </span>
                    </>
                  ) : (
                    <span className="my-auto text-xs leading-[1.6] text-rift-label" style={{ textWrap: 'pretty' }}>Select a class, then add it to your party.</span>
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <span className="flex flex-col gap-1">
                <span className="text-xs tracking-[0.04em] text-rift-muted">{startHint}</span>
                {noHealer && <span className="text-xs tracking-[0.04em] text-rift-warn">Healing class recommended!</span>}
              </span>
              <RiftButton size="lg" className="!min-h-[52px] !px-12" disabled={!ready}
                onClick={() => fadeOut(() => onStart(slots.map((s) => ({ classKey: s.classKey!, name: s.name.trim() }))))}>
                Start Game
              </RiftButton>
            </div>
          </Panel>
        </div>
      </div>
      <LoadingCover loading={showcaseLoading || fading} fadeIn={fading} className="fixed inset-0 z-50" />
    </Backdrop>
  );
}

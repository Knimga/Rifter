import { Check } from 'lucide-react';
import { CLASSES, type Ability, type ClassKey } from '../data/classes';
import type { AttributeKey, SkillKey } from '../data/stats';
import { BASE_ATTRIBUTES, STARTING_ATTR_POINTS, STARTING_SKILL_POINTS, SKILL_KEYS, calculateStats, statSuffix } from '../data/stats';
import { DAMAGE_ELEMENT_COLOR } from '../data/constants';
import type { PartyMemberConfig } from '../data/party';
import { Tooltip } from '../components/Tooltip';
import { AttributeTooltips, SkillTooltips, AREA_LABEL, passiveBonusText, scalingPassiveText } from '../data/detailStrings';

interface Props {
  party: PartyMemberConfig[];
  activeIdx: number;
  onSelectMember: (idx: number) => void;
  onUpdateMember: (idx: number, update: Partial<PartyMemberConfig>) => void;
  onStart: () => void;
  onBack: () => void;
}

const ATTRIBUTES: AttributeKey[] = ['strength', 'toughness', 'finesse', 'mind', 'spirit', 'speed'];



const EL_COLOR = DAMAGE_ELEMENT_COLOR as Record<string, string>;

function AbilityPane({ ability }: { ability: Ability }) {
  const category = ability.useWeapon ? 'weapon' : ability.attackCategory;
  return (
    <div className="bg-gray-900 rounded p-2 text-left">
      <div className="flex items-center justify-between gap-2 mb-0.5">
        <div className="flex items-center gap-1.5">
          {ability.icon && <ability.icon className="w-3.5 h-3.5 shrink-0" style={{ color: DAMAGE_ELEMENT_COLOR[ability.displayElement ?? 'slashing'] }} />}
          <span className="font-bold text-xs" style={{ color: ability.displayElement ? DAMAGE_ELEMENT_COLOR[ability.displayElement] : 'rgb(229 231 235)' }}>{ability.name}</span>
        </div>
        <span className="text-blue-400 text-[10px] shrink-0">{ability.mpCost} MP</span>
      </div>
      <p className="text-[10px] text-gray-500 mb-1.5">
        {category && <span className="capitalize">{category} · </span>}
        {AREA_LABEL[ability.area ?? 'single']} · range {ability.range}
      </p>
      <div className="border-t border-gray-700 mb-1.5" />
      <div className="space-y-0.5 text-[10px]">
        {ability.useWeapon && <p className="text-gray-400 italic">Uses equipped weapon</p>}
        {ability.effects.map((eff, i) => {
          const self = eff.appliesTo === 'caster' ? ' (self)' : '';
          const elName  = ('damageElement' in eff ? eff.damageElement : '') ?? '';
          const elStyle = elName ? { color: EL_COLOR[elName] } : undefined;
          switch (eff.type) {
            case 'damage': return (
              <p key={i} className="text-red-400">
                {eff.minDamage}–{eff.maxDamage} <span style={elStyle}>{elName}</span> damage{self}
              </p>
            );
            case 'dot': return (
              <p key={i} className="text-orange-400">
                {eff.damagePerRound}/rnd × {eff.rounds}r <span style={elStyle}>{elName}</span> DoT{self}
              </p>
            );
            case 'heal': return (
              <p key={i} className="text-green-400">Heal {eff.minHeal}–{eff.maxHeal}{self}</p>
            );
            case 'hot': return (
              <p key={i} className="text-emerald-400">
                {eff.healPerRound}/rnd × {eff.rounds}r <span style={elStyle}>{elName}</span> HoT{self}
              </p>
            );
            case 'buff': return (
              <p key={i} className="text-yellow-300">
                Buff: {Object.entries(eff.stats).map(([s, v]) => `+${v} ${s}`).join(', ')} × {eff.rounds}r{self}
              </p>
            );
            case 'debuff': return (
              <p key={i} className="text-purple-400">
                Debuff: {Object.entries(eff.stats).map(([s, v]) => `−${v} ${s}`).join(', ')} × {eff.rounds}r{self}
              </p>
            );
          }
        })}
      </div>
    </div>
  );
}

function isMemberComplete(m: PartyMemberConfig): boolean {
  const attrSpent = Object.values(m.pointsSpent).reduce((a, b) => a + b, 0);
  const skillSpent = Object.values(m.skillPointsSpent).reduce((a, b) => a + b, 0);
  return (
    m.characterName.trim() !== '' &&
    m.selectedClass !== null &&
    attrSpent === STARTING_ATTR_POINTS &&
    skillSpent === STARTING_SKILL_POINTS
  );
}

export default function BuilderScreen({ party, activeIdx, onSelectMember, onUpdateMember, onStart, onBack }: Props) {
  const member = party[activeIdx];
  const { characterName, selectedClass, pointsSpent, skillPointsSpent } = member;

  const canStart = party.every(isMemberComplete);
  const remainingPoints = STARTING_ATTR_POINTS - Object.values(pointsSpent).reduce((a, b) => a + b, 0);
  const remainingSkillPoints = STARTING_SKILL_POINTS - Object.values(skillPointsSpent).reduce((a, b) => a + b, 0);
  const stats = calculateStats({ mode: 'player', classKey: selectedClass, pointsSpent, skillPointsSpent });

  const adjustPoints = (attr: AttributeKey, delta: number) => {
    const newValue = pointsSpent[attr] + delta;
    if (newValue < 0) return;
    if (delta > 0 && remainingPoints <= 0) return;
    onUpdateMember(activeIdx, { pointsSpent: { ...pointsSpent, [attr]: newValue } });
  };

  const adjustSkillPoints = (skill: SkillKey, delta: number) => {
    const newValue = (skillPointsSpent[skill] ?? 0) + delta;
    if (newValue < 0) return;
    if (delta > 0 && remainingSkillPoints <= 0) return;
    onUpdateMember(activeIdx, { skillPointsSpent: { ...skillPointsSpent, [skill]: newValue } });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex">

      {/* ── Left Sidebar — Party ──────────────────────────────────────────── */}
      <div className="w-52 shrink-0 bg-gray-800 border-r border-gray-700 p-4 flex flex-col">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Party</h2>

        <div className="space-y-2">
          {party.map((m, i) => {
            const isActive = activeIdx === i;
            const isComplete = isMemberComplete(m);
            const cd = m.selectedClass ? CLASSES[m.selectedClass] : null;

            return (
              <button
                key={i}
                onClick={() => onSelectMember(i)}
                className={`w-full text-left px-3 py-2.5 rounded-lg border transition-colors ${
                  isActive
                    ? 'bg-gray-700 border-gray-500'
                    : 'bg-gray-900/50 border-gray-700 hover:bg-gray-700/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  {cd ? (
                    <div className="w-6 h-6 rounded-full shrink-0" style={{ backgroundColor: cd.color }} />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gray-700 border border-gray-600 shrink-0 flex items-center justify-center">
                      <span className="text-xs text-gray-400">{i + 1}</span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-100 truncate">
                      {m.characterName.trim() || `Character ${i + 1}`}
                    </p>
                    <p className="text-xs text-gray-400 truncate">
                      {cd ? cd.name : 'No class'}
                    </p>
                  </div>
                  {isComplete && <Check className="w-4 h-4 text-green-400 shrink-0" />}
                </div>
              </button>
            );
          })}
        </div>

        <p className="mt-auto pt-4 text-xs text-gray-600 italic">Top = marching leader</p>
      </div>

      {/* ── Class Selection Sidebar ───────────────────────────────────────── */}
      <div className="w-72 shrink-0 bg-gray-800 border-r border-gray-700 p-4 overflow-y-auto">
        <h2 className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-4">Select Class</h2>
        <div className="space-y-2">
          {Object.entries(CLASSES).map(([key, cd]) => {
            const isSelected = selectedClass === key;
            return (
              <div
                key={key}
                className={`rounded-lg border transition-colors ${
                  isSelected
                    ? 'bg-gray-700 border-gray-500'
                    : 'bg-gray-900/50 border-gray-700 hover:bg-gray-700/50'
                }`}
              >
                {/* Header — always visible */}
                <button
                  onClick={() => onUpdateMember(activeIdx, { selectedClass: key as ClassKey })}
                  className="w-full text-left px-3 py-3"
                >
                  <div className="font-bold text-sm" style={{ color: cd.color }}>{cd.name}</div>
                  <p className="text-xs text-gray-400 italic mt-0.5 leading-snug">{cd.description}</p>
                </button>

                {/* Accordion body */}
                <div className={`grid transition-[grid-template-rows] duration-200 ${isSelected ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
                  <div className="overflow-hidden">
                    <div className="px-2 pb-2 space-y-1.5">
                      <div className="bg-gray-800 rounded-md p-2.5 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Attributes</div>
                        <p className="text-xs text-gray-300">
                          {Object.entries(cd.attributes)
                            .filter(([, val]) => val > 0)
                            .map(([attr, val]) => `+${val} ${attr.charAt(0).toUpperCase() + attr.slice(1)}`)
                            .join(', ') || 'None'}
                        </p>
                      </div>
                      <div className="bg-gray-800 rounded-md p-2.5 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Armor</div>
                        <p className="text-xs text-gray-300">{cd.armorProficiencies.join(', ')}</p>
                      </div>
                      <div className="bg-gray-800 rounded-md p-2.5 text-center">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1">Weapons</div>
                        <p className="text-xs text-gray-300">{cd.weaponProficiencies.join(', ')}</p>
                      </div>
                      <div className="bg-gray-800 rounded-md p-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5">Passives</div>
                        <div className="space-y-1">
                          {Object.entries(cd.passives).map(([key, p]) => (
                            <div key={key}>
                              <span className="font-bold text-xs text-gray-200">{p.name}: </span>
                              <span className="text-[11px] text-gray-400 italic">{passiveBonusText(p, key)}</span>
                            </div>
                          ))}
                          {(cd.scalingPassives ?? []).map((sp, i) => (
                            <div key={i}>
                              <span className="font-bold text-xs text-gray-200">{sp.name}: </span>
                              <span className="text-[11px] text-gray-400 italic">{scalingPassiveText(sp)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="bg-gray-800 rounded-md p-2.5">
                        <div className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-1.5 text-center">Starting Abilities</div>
                        <div className="flex flex-col gap-1.5">
                          {cd.abilities.map((ability, i) => (
                            <AbilityPane key={i} ability={ability} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Center Content ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-4xl font-bold text-center mb-8 text-red-500">Character Builder</h1>

          {/* Character Name */}
          <div className="mb-8">
            <label className="block text-xl font-semibold mb-2">Character Name</label>
            <input
              type="text"
              value={characterName}
              onChange={(e) => { const v = e.target.value; onUpdateMember(activeIdx, { characterName: v ? v[0].toUpperCase() + v.slice(1) : v }); }}
              placeholder="Enter your name..."
              className="w-full bg-gray-800 text-white px-4 py-3 rounded border-2 border-gray-700 focus:border-red-500 focus:outline-none text-lg"
            />
          </div>

          {/* Attribute Point Buy */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-2xl font-semibold">Allocate Attributes</h2>
              <div className="text-xl font-bold">
                Points Remaining:{' '}
                <span className={remainingPoints === 0 ? 'text-green-500' : 'text-yellow-500'}>
                  {remainingPoints}
                </span>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-6">
              {ATTRIBUTES.map((attr) => (
                <div key={attr} className="flex items-center justify-between py-3 border-b border-gray-700 last:border-b-0">
                  <Tooltip
                    className="flex-1 group"
                    content={<div className="px-3 py-2 max-w-[240px]"><p className="italic text-gray-300 text-sm">{AttributeTooltips[attr]}</p></div>}
                  >
                    <div className="font-semibold text-lg capitalize group-hover:text-gray-300 transition-colors">{attr}</div>
                    <div className="text-sm text-gray-400">
                      {(() => {
                        const cd = selectedClass ? CLASSES[selectedClass] : null;
                        const classAttr = cd?.attributes[attr] ?? 0;
                        const passiveFlat = cd ? ((cd.passives[`${attr}Bonus`]?.flat ?? 0) + (cd.passives[attr]?.flat ?? 0)) : 0;
                        const classTotal = classAttr + passiveFlat;
                        return `Base: ${BASE_ATTRIBUTES} + Spent: ${pointsSpent[attr]} + Class: ${classTotal}`;
                      })()}
                    </div>
                  </Tooltip>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => adjustPoints(attr, -1)}
                      disabled={pointsSpent[attr] === 0}
                      className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold w-10 h-10 rounded transition-colors"
                    >
                      -
                    </button>
                    <div className="text-2xl font-bold w-12 text-center text-yellow-500">
                      {stats.attributes[attr]}
                    </div>
                    <button
                      onClick={() => adjustPoints(attr, 1)}
                      disabled={remainingPoints === 0}
                      className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold w-10 h-10 rounded transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Skill Point Buy */}
          <div className="mb-8">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-semibold text-gray-300">Allocate Skills</h2>
              <div className="text-sm font-semibold text-gray-400">
                Points:{' '}
                <span className={remainingSkillPoints === 0 ? 'text-green-500' : 'text-yellow-500'}>
                  {remainingSkillPoints}
                </span>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg px-4 py-2">
              {SKILL_KEYS.map((skill) => {
                const classVal = selectedClass ? (CLASSES[selectedClass].skills[skill] ?? 0) : 0;
                const spent = skillPointsSpent[skill] ?? 0;
                return (
                  <div key={skill} className="flex items-center justify-between py-1.5 border-b border-gray-700/50 last:border-b-0">
                    <Tooltip
                      className="flex-1 group"
                      content={<div className="px-3 py-2 max-w-[240px]"><p className="italic text-gray-300 text-sm">{SkillTooltips[skill]}</p></div>}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium capitalize text-gray-300 group-hover:text-gray-100 transition-colors">{skill}</span>
                        {classVal > 0 && <span className="text-xs text-blue-400">+{classVal}</span>}
                      </div>
                    </Tooltip>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => adjustSkillPoints(skill, -1)}
                        disabled={spent === 0}
                        className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold w-7 h-7 rounded transition-colors text-sm"
                      >
                        -
                      </button>
                      <div className="text-base font-bold w-8 text-center text-yellow-500">
                        {stats.skills[skill]}
                      </div>
                      <button
                        onClick={() => adjustSkillPoints(skill, 1)}
                        disabled={remainingSkillPoints === 0}
                        className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold w-7 h-7 rounded transition-colors text-sm"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Stats Preview */}
          <div className="mb-8">
            <h2 className="text-2xl font-semibold mb-4">Final Stats (Level {stats.level})</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-bold mb-3 text-red-400">Core Stats</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Level:</span><span className="font-bold">{stats.level}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">HP:</span><span className="font-bold">{stats.hp}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">MP:</span><span className="font-bold">{stats.mp}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Initiative:</span><span className="font-bold">{stats.initiative}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Movement:</span><span className="font-bold">{stats.movement}</span></div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-bold mb-3 text-blue-400">Defense Stats</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Armor:</span><span className="font-bold">{stats.armor}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Dodge:</span><span className="font-bold">{stats.dodge}{statSuffix('dodge')}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Magic Resistance:</span><span className="font-bold">{stats.magicResistance}{statSuffix('magicResistance')}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Healing:</span><span className="font-bold">{stats.healing}</span></div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-bold mb-3 text-red-400">Melee</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Hit Bonus:</span><span className="font-bold">{stats.melee.hit}{statSuffix('meleeHit')}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Damage:</span><span className="font-bold">{stats.melee.damage}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Crit Chance:</span><span className="font-bold">{stats.melee.crit}{statSuffix('meleeCrit')}</span></div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-bold mb-3 text-green-400">Ranged</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Hit Bonus:</span><span className="font-bold">{stats.ranged.hit}{statSuffix('rangedHit')}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Damage:</span><span className="font-bold">{stats.ranged.damage}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Crit Chance:</span><span className="font-bold">{stats.ranged.crit}{statSuffix('rangedCrit')}</span></div>
                </div>
              </div>

              <div className="bg-gray-800 rounded-lg p-4">
                <h3 className="text-lg font-bold mb-3 text-purple-400">Magic</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-gray-400">Hit Bonus:</span><span className="font-bold">{stats.magic.hit}{statSuffix('magicHit')}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Damage:</span><span className="font-bold">{stats.magic.damage}</span></div>
                  <div className="flex justify-between"><span className="text-gray-400">Crit Chance:</span><span className="font-bold">{stats.magic.crit}{statSuffix('magicCrit')}</span></div>
                </div>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-4 justify-center">
            <button
              onClick={onBack}
              className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-8 text-lg rounded transition-colors"
            >
              Back to Menu
            </button>
            <button
              onClick={onStart}
              disabled={!canStart}
              className={`font-bold py-3 px-8 text-lg rounded transition-colors ${
                canStart ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-800 text-gray-600 cursor-not-allowed'
              }`}
            >
              Start Adventure
            </button>
          </div>

          {!canStart && (
            <div className="text-center mt-4 text-sm space-y-1">
              {party.map((m, i) => {
                if (isMemberComplete(m)) return null;
                const issues: string[] = [];
                if (!m.characterName.trim()) issues.push('name required');
                if (!m.selectedClass) issues.push('no class');
                const spent = Object.values(m.pointsSpent).reduce((a, b) => a + b, 0);
                if (spent < STARTING_ATTR_POINTS) issues.push(`${STARTING_ATTR_POINTS - spent} attr pts unspent`);
                const skillSpent = Object.values(m.skillPointsSpent).reduce((a, b) => a + b, 0);
                if (skillSpent < STARTING_SKILL_POINTS) issues.push(`${STARTING_SKILL_POINTS - skillSpent} skill pts unspent`);
                return (
                  <p key={i} className="text-yellow-500">
                    • {m.characterName.trim() || `Character ${i + 1}`}: {issues.join(' · ')}
                  </p>
                );
              })}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

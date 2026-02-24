import {
  CLASSES, BASE_ATTRIBUTES, TOTAL_POINTS,
  getTotalAttribute, calculateStats,
  type AttributeKey, type ClassKey
} from '../data/classes';

interface Props {
  characterName: string;
  setCharacterName: (name: string) => void;
  selectedClass: ClassKey | null;
  setSelectedClass: (key: ClassKey) => void;
  pointsSpent: Record<AttributeKey, number>;
  setPointsSpent: (points: Record<AttributeKey, number>) => void;
  onStart: () => void;
  onBack: () => void;
}

const ATTRIBUTES: AttributeKey[] = ['strength', 'toughness', 'finesse', 'mind', 'spirit'];

export default function BuilderScreen({
  characterName, setCharacterName,
  selectedClass, setSelectedClass,
  pointsSpent, setPointsSpent,
  onStart, onBack
}: Props) {
  const remainingPoints = TOTAL_POINTS - Object.values(pointsSpent).reduce((a, b) => a + b, 0);
  const canStart = characterName.trim() !== '' && selectedClass !== null && remainingPoints === 0;
  const stats = calculateStats(selectedClass, pointsSpent);

  const adjustPoints = (attr: AttributeKey, delta: number) => {
    const newValue = pointsSpent[attr] + delta;
    if (newValue < 0) return;
    if (delta > 0 && remainingPoints <= 0) return;
    setPointsSpent({ ...pointsSpent, [attr]: newValue });
  };

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8 text-red-500">Character Builder</h1>

        <div className="mb-8">
          <label className="block text-xl font-semibold mb-2">Character Name</label>
          <input
            type="text"
            value={characterName}
            onChange={(e) => setCharacterName(e.target.value)}
            placeholder="Enter your name..."
            className="w-full bg-gray-800 text-white px-4 py-3 rounded border-2 border-gray-700 focus:border-red-500 focus:outline-none text-lg"
          />
        </div>

        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Select Class</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(CLASSES).map(([key, classData]) => {
              const Token = classData.token;
              const isSelected = selectedClass === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedClass(key as ClassKey)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    isSelected ? 'border-red-500 bg-gray-800' : 'border-gray-700 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`${classData.color} p-2 rounded`}>
                      <Token className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold">{classData.name}</h3>
                  </div>
                  <p className="text-sm text-gray-400 mb-3">{classData.description}</p>
                  <div className="text-xs text-gray-500">
                    <div className="mb-1">
                      <strong>Attributes:</strong>{' '}
                      {Object.entries(classData.attributes)
                        .filter(([, val]) => val > 0)
                        .map(([attr, val]) => `+${val} ${attr.charAt(0).toUpperCase() + attr.slice(1)}`)
                        .join(', ')}
                    </div>
                    <div className="mb-1">
                      <strong>Passives:</strong>{' '}
                      {Object.entries(classData.passives)
                        .map(([k, val]) => {
                          const label = k.replace('Bonus', '').replace(/([A-Z])/g, ' $1').trim();
                          return `+${val}${k.includes('Crit') || k.includes('dodge') || k.includes('Hit') ? '%' : ''} ${label}`;
                        })
                        .join(', ')}
                    </div>
                    <div className="mb-1">
                      <strong>Armor:</strong>{' '}
                      {classData.armorProficiencies.join(', ')}
                    </div>
                    <div>
                      <strong>Weapons:</strong>{' '}
                      {classData.weaponProficiencies.join(', ')}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-semibold">Distribute Attribute Points</h2>
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
                <div className="flex-1">
                  <div className="font-semibold text-lg capitalize">{attr}</div>
                  <div className="text-sm text-gray-400">
                    Base: {BASE_ATTRIBUTES} + Spent: {pointsSpent[attr]} + Class: {selectedClass ? CLASSES[selectedClass].attributes[attr] : 0}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    onClick={() => adjustPoints(attr, -1)}
                    disabled={pointsSpent[attr] === 0}
                    className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 text-white font-bold w-10 h-10 rounded transition-colors"
                  >
                    -
                  </button>
                  <div className="text-2xl font-bold w-12 text-center text-yellow-500">
                    {getTotalAttribute(attr, pointsSpent, selectedClass)}
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

        <div className="mb-8">
          <h2 className="text-2xl font-semibold mb-4">Final Stats (Level {stats.level})</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3 text-red-400">Core Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Level:</span><span className="font-bold text-yellow-400">{stats.level}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">HP:</span><span className="font-bold text-green-400">{stats.hp}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">MP:</span><span className="font-bold text-blue-400">{stats.mp}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Initiative:</span><span className="font-bold text-cyan-400">{stats.initiative}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Movement:</span><span className="font-bold text-orange-400">{stats.movement}</span></div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3 text-blue-400">Defense Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Armor:</span><span className="font-bold">{stats.armor}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Dodge:</span><span className="font-bold">{stats.dodge}%</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Magic Resistance:</span><span className="font-bold">{stats.magicResistance}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Healing:</span><span className="font-bold text-green-400">{stats.healing}</span></div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3 text-red-400">Melee</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Hit Bonus:</span><span className="font-bold">{stats.melee.hitBonus}%</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Damage:</span><span className="font-bold">{stats.melee.damage}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Crit Chance:</span><span className="font-bold">{stats.melee.crit}%</span></div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3 text-green-400">Ranged</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Hit Bonus:</span><span className="font-bold">{stats.ranged.hitBonus}%</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Damage:</span><span className="font-bold">{stats.ranged.damage}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Crit Chance:</span><span className="font-bold">{stats.ranged.crit}%</span></div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3 text-purple-400">Magic</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-400">Hit Bonus:</span><span className="font-bold">{stats.magic.hitBonus}%</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Damage:</span><span className="font-bold">{stats.magic.damage}</span></div>
                <div className="flex justify-between"><span className="text-gray-400">Crit Chance:</span><span className="font-bold">{stats.magic.crit}%</span></div>
              </div>
            </div>
          </div>
        </div>

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
          <div className="text-center mt-4 text-yellow-500">
            {!characterName.trim() && '• Enter a character name '}
            {!selectedClass && '• Select a class '}
            {remainingPoints > 0 && `• Spend all ${remainingPoints} attribute points`}
          </div>
        )}
      </div>
    </div>
  );
}

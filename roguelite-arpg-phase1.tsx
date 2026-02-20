import React, { useState } from 'react';
import { Swords, Shield, Target, Wand2, Sparkles, Home, Zap } from 'lucide-react';

const CLASSES = {
  barbarian: {
    name: 'Barbarian',
    icon: Swords,
    color: 'bg-red-600',
    description: 'A wielder of 2h weapons whose lack of armor is compensated by raw fortitude and battle lust.',
    attributes: { strength: 2, toughness: 4, finesse: 0, mind: 0, spirit: 0 },
    passives: { dodgeBonus: 5, meleeCritBonus: 5 }
  },
  paladin: {
    name: 'Paladin',
    icon: Shield,
    color: 'bg-yellow-500',
    description: 'A shield-bearing knight that heals companions and strikes enemies with holy power.',
    attributes: { strength: 2, toughness: 1, finesse: 0, mind: 0, spirit: 3 },
    passives: { healingBonus: 3, armorBonus: 10 }
  },
  ranger: {
    name: 'Ranger',
    icon: Target,
    color: 'bg-green-600',
    description: 'A bow-wielding wanderer who focuses on ranged ability and poisons.',
    attributes: { strength: 0, toughness: 1, finesse: 4, mind: 1, spirit: 0 },
    passives: { rangedAttackBonus: 3, rangedDamageBonus: 3 }
  },
  mage: {
    name: 'Mage',
    icon: Wand2,
    color: 'bg-blue-600',
    description: 'An elementalist who casts devastating spells from afar.',
    attributes: { strength: 0, toughness: 0, finesse: 0, mind: 4, spirit: 2 },
    passives: { magicDamageBonus: 3, magicResistanceBonus: 10 }
  },
  shaman: {
    name: 'Shaman',
    icon: Sparkles,
    color: 'bg-purple-600',
    description: 'A wise primalist who can heal themselves and curse enemies.',
    attributes: { strength: 0, toughness: 2, finesse: 0, mind: 2, spirit: 2 },
    passives: { magicResistanceBonus: 10, magicAttackBonus: 3 }
  }
};

const TILE_SIZE = 40;
const MAX_MOVE_DISTANCE = 5;

export default function RogueliteARPG() {
  const [screen, setScreen] = useState('menu');
  const [characterName, setCharacterName] = useState('');
  const [selectedClass, setSelectedClass] = useState(null);
  const [pointsSpent, setPointsSpent] = useState({
    strength: 0,
    toughness: 0,
    finesse: 0,
    mind: 0,
    spirit: 0
  });
  
  // Game state
  const [gameStarted, setGameStarted] = useState(false);
  const [location, setLocation] = useState('sanctum'); // 'sanctum' or 'dungeon'
  const [playerPos, setPlayerPos] = useState({ x: 5, y: 5 });

  const BASE_ATTRIBUTES = 5;
  const TOTAL_POINTS = 6;
  const remainingPoints = TOTAL_POINTS - Object.values(pointsSpent).reduce((a, b) => a + b, 0);

  const canSave = characterName.trim() !== '' && selectedClass !== null && remainingPoints === 0;

  const getTotalAttribute = (attr) => {
    const base = BASE_ATTRIBUTES;
    const spent = pointsSpent[attr];
    const classBonus = selectedClass ? CLASSES[selectedClass].attributes[attr] : 0;
    return base + spent + classBonus;
  };

  const adjustPoints = (attr, delta) => {
    const current = pointsSpent[attr];
    const newValue = current + delta;
    
    if (newValue < 0) return;
    if (delta > 0 && remainingPoints <= 0) return;
    
    setPointsSpent({ ...pointsSpent, [attr]: newValue });
  };

  const calculateStats = () => {
    const level = 1;
    const str = getTotalAttribute('strength');
    const tou = getTotalAttribute('toughness');
    const fin = getTotalAttribute('finesse');
    const mnd = getTotalAttribute('mind');
    const spr = getTotalAttribute('spirit');

    const passives = selectedClass ? CLASSES[selectedClass].passives : {};

    return {
      level,
      hp: Math.floor(30 + (2 * tou) + (str / 4) + (2 * level)),
      mp: Math.floor(20 + (4 * mnd) + (2 * spr) + level),
      initiative: Math.floor(5 + (fin / 3) + (mnd / 4)),
      movement: 3,
      armor: Math.floor((2 * tou) + str) + (passives.armorBonus || 0),
      dodge: Math.floor(5 + (fin / 2)) + (passives.dodgeBonus || 0),
      magicResistance: Math.floor(spr + (mnd / 2)) + (passives.magicResistanceBonus || 0),
      healing: Math.floor(spr / 3) + (passives.healingBonus || 0),
      melee: {
        attack: Math.floor((str / 4) + (fin / 3)),
        damage: Math.floor(str / 3),
        crit: Math.floor(5 + (fin / 4) + (str / 4)) + (passives.meleeCritBonus || 0)
      },
      ranged: {
        attack: Math.floor(fin / 2) + (passives.rangedAttackBonus || 0),
        damage: Math.floor(fin / 3) + (passives.rangedDamageBonus || 0),
        crit: Math.floor(5 + (fin / 2))
      },
      magic: {
        attack: Math.floor(mnd / 2) + (passives.magicAttackBonus || 0),
        damage: Math.floor(mnd / 3) + (passives.magicDamageBonus || 0),
        crit: Math.floor(5 + (mnd / 2))
      }
    };
  };

  const stats = calculateStats();

  const startGame = () => {
    if (canSave) {
      setGameStarted(true);
      setScreen('game');
      setLocation('sanctum');
      setPlayerPos({ x: 5, y: 5 });
    }
  };

  const handleTileClick = (x, y) => {
    // Check if tile is occupied
    const portalPos = location === 'sanctum' ? { x: 5, y: 2 } : { x: 15, y: 5 };
    if (x === portalPos.x && y === portalPos.y) return;
    
    const dx = Math.abs(x - playerPos.x);
    const dy = Math.abs(y - playerPos.y);
    const distance = Math.max(dx, dy);
    
    if (distance <= stats.movement) {
      setPlayerPos({ x, y });
    }
  };

  const handleInteract = (type, x, y) => {
    if (!isAdjacent(x, y)) return;
    
    if (type === 'portal') {
      if (location === 'sanctum') {
        setLocation('dungeon');
        setPlayerPos({ x: 2, y: 5 });
      } else {
        setLocation('sanctum');
        setPlayerPos({ x: 5, y: 5 });
      }
    }
  };

  const isAdjacent = (x, y) => {
    const dx = Math.abs(x - playerPos.x);
    const dy = Math.abs(y - playerPos.y);
    return dx <= 1 && dy <= 1 && (dx + dy) > 0;
  };

  const renderSanctum = () => {
    const portalPos = { x: 5, y: 2 };
    const isAdjacentToPortal = isAdjacent(portalPos.x, portalPos.y);

    return (
      <div className="flex flex-col items-center">
        <h2 className="text-2xl font-bold text-purple-400 mb-4">The Sanctum</h2>
        <div className="bg-gray-800 p-4 rounded-lg inline-block">
          {Array.from({ length: 11 }).map((_, y) => (
            <div key={y} className="flex">
              {Array.from({ length: 11 }).map((_, x) => {
                const isPlayer = playerPos.x === x && playerPos.y === y;
                const isPortal = portalPos.x === x && portalPos.y === y;
                const isWall = x === 0 || x === 10 || y === 0 || y === 10;
                
                return (
                  <div
                    key={`${x}-${y}`}
                    onClick={() => {
                      if (isPortal && isAdjacentToPortal) {
                        handleInteract('portal', x, y);
                      } else if (!isWall) {
                        handleTileClick(x, y);
                      }
                    }}
                    className={`w-10 h-10 border border-gray-700 flex items-center justify-center text-xs ${
                      isWall ? 'bg-gray-950' : 'bg-gray-900 hover:bg-gray-800 cursor-pointer'
                    }`}
                  >
                    {isPlayer && (
                      <div className={`w-8 h-8 ${CLASSES[selectedClass].color} rounded flex items-center justify-center`}>
                        {React.createElement(CLASSES[selectedClass].icon, { className: 'w-5 h-5 text-white' })}
                      </div>
                    )}
                    {isPortal && (
                      <div 
                        className={`transition-all ${
                          isAdjacentToPortal ? 'cursor-pointer animate-pulse' : ''
                        }`}
                        style={{
                          filter: isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(192,132,252,0.8))' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.filter = 'drop-shadow(0 0 12px rgba(192,132,252,1))';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.filter = isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(192,132,252,0.8))' : 'none';
                        }}
                      >
                        <Zap className="w-6 h-6 text-purple-400" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDungeon = () => {
    const portalPos = { x: 15, y: 5 };
    const isAdjacentToPortal = isAdjacent(portalPos.x, portalPos.y);

    return (
      <div className="flex flex-col items-center">
        <h2 className="text-2xl font-bold text-red-400 mb-4">Dungeon - Level 1</h2>
        <div className="bg-gray-800 p-4 rounded-lg inline-block">
          {Array.from({ length: 11 }).map((_, y) => (
            <div key={y} className="flex">
              {Array.from({ length: 18 }).map((_, x) => {
                const isPlayer = playerPos.x === x && playerPos.y === y;
                const isPortal = portalPos.x === x && portalPos.y === y;
                
                const inRoom1 = x >= 1 && x <= 6 && y >= 2 && y <= 8;
                const inHallway = x >= 7 && x <= 9 && y >= 4 && y <= 6;
                const inRoom2 = x >= 10 && x <= 16 && y >= 2 && y <= 8;
                const isFloor = inRoom1 || inHallway || inRoom2;
                
                return (
                  <div
                    key={`${x}-${y}`}
                    onClick={() => {
                      if (isPortal && isAdjacentToPortal) {
                        handleInteract('portal', x, y);
                      } else if (isFloor) {
                        handleTileClick(x, y);
                      }
                    }}
                    className={`w-10 h-10 border border-gray-700 flex items-center justify-center text-xs ${
                      isFloor ? 'bg-gray-900 hover:bg-gray-800 cursor-pointer' : 'bg-gray-950'
                    }`}
                  >
                    {isPlayer && (
                      <div className={`w-8 h-8 ${CLASSES[selectedClass].color} rounded flex items-center justify-center`}>
                        {React.createElement(CLASSES[selectedClass].icon, { className: 'w-5 h-5 text-white' })}
                      </div>
                    )}
                    {isPortal && (
                      <div 
                        className={`transition-all ${
                          isAdjacentToPortal ? 'cursor-pointer animate-pulse' : ''
                        }`}
                        style={{
                          filter: isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(34,211,238,0.8))' : 'none'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.filter = 'drop-shadow(0 0 12px rgba(34,211,238,1))';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.filter = isAdjacentToPortal ? 'drop-shadow(0 0 8px rgba(34,211,238,0.8))' : 'none';
                        }}
                      >
                        <Home className="w-6 h-6 text-cyan-400" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (screen === 'menu') {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="text-center">
          <h1 className="text-6xl font-bold text-red-500 mb-4 tracking-wider">
            DUNGEON
          </h1>
          <h2 className="text-4xl font-bold text-gray-300 mb-12">
            CRAWLER
          </h2>
          <button
            onClick={() => setScreen('builder')}
            className="bg-red-600 hover:bg-red-700 text-white font-bold py-4 px-12 text-2xl rounded transition-colors"
          >
            New Game
          </button>
        </div>
      </div>
    );
  }

  if (screen === 'game') {
    return (
      <div className="min-h-screen bg-gray-900 text-gray-100 p-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold text-red-500">{characterName}</h1>
              <p className="text-gray-400">{CLASSES[selectedClass].name} - Level {stats.level}</p>
            </div>
            <div className="flex gap-4">
              <div className="bg-gray-800 px-4 py-2 rounded">
                <span className="text-green-400 font-bold">HP:</span> {stats.hp}
              </div>
              <div className="bg-gray-800 px-4 py-2 rounded">
                <span className="text-blue-400 font-bold">MP:</span> {stats.mp}
              </div>
            </div>
          </div>

          {location === 'sanctum' && renderSanctum()}
          {location === 'dungeon' && renderDungeon()}
        </div>
      </div>
    );
  }

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
              const Icon = classData.icon;
              const isSelected = selectedClass === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedClass(key)}
                  className={`p-4 rounded-lg border-2 transition-all text-left ${
                    isSelected
                      ? 'border-red-500 bg-gray-800'
                      : 'border-gray-700 bg-gray-850 hover:border-gray-600'
                  }`}
                >
                  <div className="flex items-center gap-3 mb-2">
                    <div className={`${classData.color} p-2 rounded`}>
                      <Icon className="w-6 h-6 text-white" />
                    </div>
                    <h3 className="text-xl font-bold">{classData.name}</h3>
                  </div>
                  <p className="text-sm text-gray-400 mb-3">{classData.description}</p>
                  <div className="text-xs text-gray-500">
                    <div className="mb-1">
                      <strong>Attributes:</strong>{' '}
                      {Object.entries(classData.attributes)
                        .filter(([_, val]) => val > 0)
                        .map(([attr, val]) => `+${val} ${attr.charAt(0).toUpperCase() + attr.slice(1)}`)
                        .join(', ')}
                    </div>
                    <div>
                      <strong>Passives:</strong>{' '}
                      {Object.entries(classData.passives)
                        .map(([key, val]) => {
                          const label = key
                            .replace('Bonus', '')
                            .replace(/([A-Z])/g, ' $1')
                            .trim();
                          return `+${val}${key.includes('Crit') || key.includes('Dodge') ? '%' : ''} ${label}`;
                        })
                        .join(', ')}
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
              Points Remaining: <span className={remainingPoints === 0 ? 'text-green-500' : 'text-yellow-500'}>{remainingPoints}</span>
            </div>
          </div>
          
          <div className="bg-gray-800 rounded-lg p-6">
            {['strength', 'toughness', 'finesse', 'mind', 'spirit'].map((attr) => (
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
                    {getTotalAttribute(attr)}
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
                <div className="flex justify-between">
                  <span className="text-gray-400">Level:</span>
                  <span className="font-bold text-yellow-400">{stats.level}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">HP:</span>
                  <span className="font-bold text-green-400">{stats.hp}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">MP:</span>
                  <span className="font-bold text-blue-400">{stats.mp}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Initiative:</span>
                  <span className="font-bold text-cyan-400">{stats.initiative}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Movement:</span>
                  <span className="font-bold text-orange-400">{stats.movement}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3 text-blue-400">Defense Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Armor:</span>
                  <span className="font-bold">{stats.armor}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Dodge:</span>
                  <span className="font-bold">{stats.dodge}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Magic Resistance:</span>
                  <span className="font-bold">{stats.magicResistance}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Healing:</span>
                  <span className="font-bold text-green-400">{stats.healing}</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3 text-red-400">Melee</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Attack:</span>
                  <span className="font-bold">{stats.melee.attack}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Damage:</span>
                  <span className="font-bold">{stats.melee.damage}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Crit Chance:</span>
                  <span className="font-bold">{stats.melee.crit}%</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3 text-green-400">Ranged</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Attack:</span>
                  <span className="font-bold">{stats.ranged.attack}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Damage:</span>
                  <span className="font-bold">{stats.ranged.damage}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Crit Chance:</span>
                  <span className="font-bold">{stats.ranged.crit}%</span>
                </div>
              </div>
            </div>

            <div className="bg-gray-800 rounded-lg p-4">
              <h3 className="text-lg font-bold mb-3 text-purple-400">Magic</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-400">Attack:</span>
                  <span className="font-bold">{stats.magic.attack}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Damage:</span>
                  <span className="font-bold">{stats.magic.damage}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-400">Crit Chance:</span>
                  <span className="font-bold">{stats.magic.crit}%</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex gap-4 justify-center">
          <button
            onClick={() => setScreen('menu')}
            className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-3 px-8 text-lg rounded transition-colors"
          >
            Back to Menu
          </button>
          <button
            onClick={startGame}
            disabled={!canSave}
            className={`font-bold py-3 px-8 text-lg rounded transition-colors ${
              canSave
                ? 'bg-green-600 hover:bg-green-700 text-white'
                : 'bg-gray-800 text-gray-600 cursor-not-allowed'
            }`}
          >
            Start Adventure
          </button>
        </div>
        
        {!canSave && (
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
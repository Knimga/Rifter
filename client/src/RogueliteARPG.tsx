import { useState } from 'react';
import { TOTAL_POINTS, type AttributeKey, type ClassKey, type ArmorProficiency } from './data/classes';
import { EMPTY_GEAR, generateArmorItem, generateShieldItem, generateWeaponItem, type GearSlots, type WeaponType, type DamageElement } from './data/gear';
import MenuScreen from './screens/MenuScreen';
import BuilderScreen from './screens/BuilderScreen';
import GameScreen from './screens/GameScreen';

type Screen = 'menu' | 'builder' | 'game';

const DEFAULT_POINTS: Record<AttributeKey, number> = {
  strength: 0, toughness: 0, finesse: 0, mind: 0, spirit: 0
};

const STARTING_CHEST: Record<ClassKey, ArmorProficiency> = {
  barbarian: 'Light',
  paladin:   'Heavy',
  ranger:    'Light',
  mage:      'Light',
  shaman:    'Medium',
};

const STARTING_SHIELD: Partial<Record<ClassKey, ArmorProficiency>> = {
  paladin: 'Heavy',
  shaman:  'Medium',
};

const STARTING_WEAPON: Record<ClassKey, WeaponType> = {
  barbarian: '2h Axes',
  paladin:   '1h Swords',
  ranger:    'Bows',
  mage:      'Staves',
  shaman:    'Wands',
};

const STARTING_ELEMENT: Partial<Record<ClassKey, DamageElement>> = {
  mage:   'fire',
  shaman: 'nature',
};

export default function RogueliteARPG() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [characterName, setCharacterName] = useState('');
  const [selectedClass, setSelectedClass] = useState<ClassKey | null>(null);
  const [pointsSpent, setPointsSpent] = useState<Record<AttributeKey, number>>(DEFAULT_POINTS);
  const [gear, setGear] = useState<GearSlots>(EMPTY_GEAR);

  const canStart =
    characterName.trim() !== '' &&
    selectedClass !== null &&
    Object.values(pointsSpent).reduce((a, b) => a + b, 0) === TOTAL_POINTS;

  return (
    <>
      {screen === 'menu' && (
        <MenuScreen onNewGame={() => setScreen('builder')} />
      )}
      {screen === 'builder' && (
        <BuilderScreen
          characterName={characterName}
          setCharacterName={setCharacterName}
          selectedClass={selectedClass}
          setSelectedClass={setSelectedClass}
          pointsSpent={pointsSpent}
          setPointsSpent={setPointsSpent}
          onStart={() => {
            if (canStart && selectedClass) {
              const shieldType = STARTING_SHIELD[selectedClass];
              setGear({
                ...EMPTY_GEAR,
                chest:    generateArmorItem('chest', 1, STARTING_CHEST[selectedClass]),
                mainhand: generateWeaponItem(1, STARTING_WEAPON[selectedClass], STARTING_ELEMENT[selectedClass]),
                ...(shieldType ? { offhand: generateShieldItem(1, shieldType) } : {}),
              });
              setScreen('game');
            }
          }}
          onBack={() => setScreen('menu')}
        />
      )}
      {screen === 'game' && selectedClass && (
        <GameScreen
          characterName={characterName}
          selectedClass={selectedClass}
          pointsSpent={pointsSpent}
          gear={gear}
          setGear={setGear}
        />
      )}
    </>
  );
}

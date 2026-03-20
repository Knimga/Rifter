import { useState } from 'react';
import { STARTING_ATTR_POINTS } from './data/stats';
import { EMPTY_GEAR, generateArmorItem, generateShieldItem, generateWeaponItem } from './data/gear';
import { STARTING_CHEST, STARTING_SHIELD, STARTING_WEAPON, STARTING_ELEMENT } from './data/classes';
import { createDefaultMember, type PartyMemberConfig } from './data/party';
import MenuScreen from './screens/MenuScreen';
import BuilderScreen from './screens/BuilderScreen';
import GameScreen from './screens/GameScreen';

type Screen = 'menu' | 'builder' | 'game';

function isMemberComplete(m: PartyMemberConfig): boolean {
  return (
    m.characterName.trim() !== '' &&
    m.selectedClass !== null &&
    Object.values(m.pointsSpent).reduce((a, b) => a + b, 0) === STARTING_ATTR_POINTS
  );
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [party, setParty] = useState<PartyMemberConfig[]>([
    createDefaultMember(),
    createDefaultMember(),
    createDefaultMember(),
  ]);
  const [activePartyIdx, setActivePartyIdx] = useState(0);

  const canStart = party.every(isMemberComplete);

  const handleUpdateMember = (idx: number, update: Partial<PartyMemberConfig>) => {
    setParty(prev => prev.map((m, i) => i === idx ? { ...m, ...update } : m));
  };

  const handleStart = () => {
    if (!canStart) return;
    setParty(prev => prev.map(m => {
      if (!m.selectedClass) return m;
      const shieldType = STARTING_SHIELD[m.selectedClass];
      return {
        ...m,
        gear: {
          ...EMPTY_GEAR,
          chest:    generateArmorItem('chest', 1, STARTING_CHEST[m.selectedClass]),
          mainhand: generateWeaponItem(1, STARTING_WEAPON[m.selectedClass], STARTING_ELEMENT[m.selectedClass]),
          ...(shieldType ? { offhand: generateShieldItem(1, shieldType) } : {}),
        },
      };
    }));
    setScreen('game');
  };

  return (
    <>
      {screen === 'menu' && (
        <MenuScreen onNewGame={() => setScreen('builder')} />
      )}
      {screen === 'builder' && (
        <BuilderScreen
          party={party}
          activeIdx={activePartyIdx}
          onSelectMember={setActivePartyIdx}
          onUpdateMember={handleUpdateMember}
          onStart={handleStart}
          onBack={() => setScreen('menu')}
        />
      )}
      {screen === 'game' && (
        <GameScreen
          party={party}
          setParty={setParty}
        />
      )}
    </>
  );
}

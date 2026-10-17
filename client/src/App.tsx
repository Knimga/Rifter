import { useState } from 'react';
import { createDefaultMember, isMemberComplete, startingGear, type PartyMemberConfig } from './data/party';
import MenuScreen from './screens/MenuScreen';
import BuilderScreen from './screens/BuilderScreen';
import GameScreen from './screens/GameScreen';

type Screen = 'menu' | 'builder' | 'game';

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
    setParty(prev => prev.map(m => m.selectedClass ? { ...m, gear: startingGear(m.selectedClass) } : m));
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

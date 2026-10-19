import { useState } from 'react';
import { createMember, type PartyMemberConfig } from './data/party';
import MenuScreen from './screens/MenuScreen';
import CharacterSelectScreen, { type PartyPick } from './screens/CharacterSelectScreen';
import GameScreen from './screens/GameScreen';

type Screen = 'menu' | 'select' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [party, setParty] = useState<PartyMemberConfig[]>([]);

  // The party in marching order (slot 1 leads), each member with their class's starting gear
  const handleStart = (picks: PartyPick[]) => {
    setParty(picks.map(p => createMember(p.classKey, p.name)));
    setScreen('game');
  };

  return (
    <>
      {screen === 'menu' && <MenuScreen onNewGame={() => setScreen('select')} />}
      {screen === 'select' && <CharacterSelectScreen onStart={handleStart} onBack={() => setScreen('menu')} />}
      {screen === 'game' && <GameScreen party={party} setParty={setParty} />}
    </>
  );
}

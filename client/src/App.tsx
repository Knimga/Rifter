import { useState } from 'react';
import { createMember, type PartyMemberConfig } from './data/units/party';
import { START_PROGRESS, type PartyProgress } from './data/units/xp';
import MenuScreen from './screens/MenuScreen';
import CharacterSelectScreen, { type PartyPick } from './screens/CharacterSelectScreen';
import OpeningScreen from './screens/OpeningScreen';
import GameScreen from './screens/GameScreen';

type Screen = 'menu' | 'select' | 'opening' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu');
  const [party, setParty] = useState<PartyMemberConfig[]>([]);
  // The party's shared level and XP (one pool for everyone)
  const [progress, setProgress] = useState<PartyProgress>(START_PROGRESS);
  // TEMP (testing only): the party went straight to the Sanctum, the opening skipped
  const [skipOpening, setSkipOpening] = useState(false);

  // The party in marching order (slot 1 leads), each member with their class's starting gear, at level 1; then the
  // opening (its fall told), and the game begins with the party arriving in the Dark Tunnel
  const handleStart = (picks: PartyPick[], skip = false) => {
    setParty(picks.map(p => createMember(p.classKey, p.name)));
    setProgress(START_PROGRESS);
    setSkipOpening(skip);
    setScreen(skip ? 'game' : 'opening');
  };

  return (
    <>
      {screen === 'menu' && <MenuScreen onNewGame={() => setScreen('select')} />}
      {screen === 'select' && <CharacterSelectScreen onStart={handleStart} onSkipToSanctum={(picks) => handleStart(picks, true)} onBack={() => setScreen('menu')} />}
      {screen === 'opening' && <OpeningScreen onDone={() => setScreen('game')} />}
      {screen === 'game' && <GameScreen party={party} setParty={setParty} progress={progress} setProgress={setProgress} skipOpening={skipOpening} />}
    </>
  );
}

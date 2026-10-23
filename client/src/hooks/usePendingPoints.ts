// Level-up points placed in the party window but not yet confirmed, per member. Kept by the game screen (not
// the window), so closing the window doesn't lose them.
import { useState } from 'react';
import { hasPointsToSpend, noPendingPoints, spendPoints, type PartyMemberConfig, type PendingPoints } from '../data/units/party';

export function usePendingPoints(party: PartyMemberConfig[], setParty: (party: PartyMemberConfig[]) => void) {
  const [pendingPoints, setPendingPoints] = useState<PendingPoints[]>(() => party.map(noPendingPoints));

  /** Change one member's placed points (an updater, so quick clicks never lose one). */
  const setMemberPending = (i: number, update: (p: PendingPoints) => PendingPoints) =>
    setPendingPoints(prev => prev.map((q, j) => (j === i ? update(q) : q)));

  /** Spend one member's placed points, and start their placing over. */
  const confirmPoints = (i: number) => {
    setParty(party.map((m, j) => (j === i ? spendPoints(m, pendingPoints[i]) : m)));
    setMemberPending(i, noPendingPoints);
  };

  /** Someone has points to spend (the Party button shows it). */
  const anyoneLeveling = party.some(hasPointsToSpend);

  return { pendingPoints, setMemberPending, confirmPoints, anyoneLeveling };
}

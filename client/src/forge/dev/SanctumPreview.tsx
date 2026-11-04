// DEV ONLY: the forge page's view of the Sanctum (Maps): the hub drawn exactly as the game draws it (sanctumScene: its
// 3D floor and walls, the dormant Rifter, its decorative objects and NPCs), in the map viewer (MapView), to judge where
// things stand and how they look together.
import { useMemo, useState } from 'react';
import { SANCTUM, SANCTUM_FLOORS } from '../../data/world/sanctum';
import { DORMANT_RIFTER, SANCTUM_3D, SANCTUM_DECOR, SANCTUM_FOG, npcObjects, rifterObjects } from '../../components/sanctumScene';
import MapView from './MapView';

export default function SanctumPreview() {
  const [useDrafts, setUseDrafts] = useState(true);
  const objects = useMemo(() => [...rifterObjects(DORMANT_RIFTER), ...SANCTUM_DECOR, ...npcObjects()], []);
  return (
    <MapView
      title="The Sanctum"
      subtitle={<>Its look is <span className="font-mono text-gray-300">SANCTUM_TERRAIN</span>, its layout <span className="font-mono text-gray-300">SANCTUM</span>, in <span className="font-mono text-gray-300">data/world/sanctum.ts</span></>}
      cols={SANCTUM.width} rows={SANCTUM.height} floors={SANCTUM_FLOORS} terrain={SANCTUM_3D} objects={objects}
      center={SANCTUM.playerStart} fog={SANCTUM_FOG} drafts={useDrafts} onDrafts={setUseDrafts} modelKey="sanctum"
    />
  );
}

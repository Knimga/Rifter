import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { FaCoins } from 'react-icons/fa';
import type { TargetType } from '../data/combat/abilities';
import { isAdjacent, posKey, samePos, type Pos } from '../data/world/grid';
import { SANCTUM_FLOOR_COLOR, SANCTUM_WALL_COLOR } from '../data/constants';
import { SANCTUM, SANCTUM_RECEPTACLE, SANCTUM_SHOWN, isSanctumWall, sanctumNpcAt } from '../data/world/sanctum';
import { npc, type NpcData } from '../data/world/npcs';
import { decorObjectModel } from '../data/world/decorObjects';
import { interactiveObjectGlow, interactiveObjectModel } from '../data/world/interactiveObjects';
import { DUNGEONS, type DungeonKey } from '../data/world/dungeons';
import { riftGlowCss } from '../data/world/rifts';
import { yawFromGridMove } from '../forge/core/facing';
import { RIFTER_TINT_PARTS } from '../forge/designs/_rifter';
import { Board, FloorGrid, FloorTile, deepFogTiles, HoverEdgeGlow, MoveLineOverlay, ObjectTag, RIFT_TAG_HEIGHT, TileHighlight, UsableGlow, riftTag, toMapMember, useBoard, useHoveredTile, useStableHandler, type PartyTokenData } from './mapParts';
import type { MapObject, UnitAim } from './ModelLayer';
import type { FogInput } from '../viewEngine/three/fog';

// 3D party models over the tile grid. Lazy: it pulls in three.js (GameScreen preloads it on mount).
const ModelLayer = lazy(() => import('./ModelLayer'));

/**
 * The Sanctum's fog: everything in it always in sight (its floor and the walls around it), so it only darkens the
 * wall mass beyond, as the dungeons' fog does at their edges. Not fog of war: nothing is hidden or explored, and it
 * never changes (`still`: its clouds don't drift as the party moves, so it costs nothing per frame). A constant:
 * the renderer takes it once.
 */
const SANCTUM_FOG: FogInput = { cols: SANCTUM.width, rows: SANCTUM.height, visible: SANCTUM_SHOWN, explored: SANCTUM_SHOWN, still: true };
const SANCTUM_DEEP_FOG = deepFogTiles(SANCTUM_FOG, SANCTUM.width, SANCTUM.height);

/**
 * What the Rifter is doing: the key set in it (shown in its socket), the key whose rift it shows (null: dormant, no
 * rift), and where its rift is: opening (`activate`, waking it, or `reopen`, after a swap) or, swapping keys,
 * closing (`close`: the old key's rift collapsing while the new key is already in the socket).
 */
export interface RifterState {
  key: DungeonKey | null;
  rift: DungeonKey | null;
  phase: 'activate' | 'close' | 'reopen';
}

/** A dormant Rifter: no key set, no rift. */
export const DORMANT_RIFTER: RifterState = { key: null, rift: null, phase: 'activate' };

/** The animations each phase lists: activation stays listed (its lights stay awake) while the rift closes and reopens. */
const PHASE_PLAYED: Record<RifterState['phase'], string[]> = {
  activate: ['activate'], close: ['activate', 'close'], reopen: ['activate', 'reopen'],
};

/**
 * The Sanctum's interactive objects: the Rifter, drawn on its middle tile (its model spans all three). Dormant, or, a rift
 * open, the active model: its keystone in the set key's color, its rift in the rift's key's color (the two differ
 * while a swap's old rift closes), playing its phase's animations (activation plays as it swaps in).
 */
const sanctumObjects = ({ key, rift, phase }: RifterState): MapObject[] => [{
  id: 'rifter', pos: SANCTUM.rifter.pos, facing: yawFromGridMove(...SANCTUM.rifter.facing),
  ...(rift && key
    ? {
        link: interactiveObjectModel('rifter-active'), played: PHASE_PLAYED[phase],
        partTints: [
          { color: DUNGEONS[key].riftColor, parts: RIFTER_TINT_PARTS.keystone },
          { color: DUNGEONS[rift].riftColor, parts: RIFTER_TINT_PARTS.rift },
        ],
      }
    : { link: interactiveObjectModel('rifter') }),
}];

/** The Sanctum's decorative objects: fixed, each on its middle tile facing its own way (its model spans its tiles). */
const DECOR: MapObject[] = SANCTUM.decor.map((d, i) => ({
  id: `decor-${i}-${d.id}`, link: decorObjectModel(d.id), pos: d.pos, facing: yawFromGridMove(...d.facing),
}));

/** How high (world tiles) an NPC's name tag sits: over a standing person's head (CHARACTER_HEIGHT 1.12). */
const NPC_TAG_HEIGHT = 1.35;

/** The icon before an NPC's name in its tag, by the service it offers. */
const SERVICE_ICON: Record<NonNullable<NpcData['service']>, ReactNode> = {
  vendor: <FaCoins aria-hidden="true" className="w-3 h-3 shrink-0" style={{ color: 'var(--rift-gold)' }} />,
};
const npcIcon = (data: NpcData) => (data.service ? SERVICE_ICON[data.service] : undefined);

/**
 * The Sanctum's NPCs as fixed map objects, each facing its own way; one with an aim (npcAims) turns to it: to the
 * leader talking to it, then back to the tile in front of it.
 */
const npcObjects = (npcAims: Record<string, UnitAim>): MapObject[] => SANCTUM.npcs.map((n) => ({
  id: n.id, link: npc(n.id).model, pos: n.pos, facing: yawFromGridMove(...n.facing),
  ...(npcAims[n.id] ? { aim: npcAims[n.id] } : {}),
}));

interface Props {
  playerPos: Pos;
  activeMoverPos: Pos;
  party: PartyTokenData[];
  /** Tiles the active mover can move to this turn (tile key -> steps), from GameScreen (partyMoveTargets). */
  moveTargets: Map<string, number>;
  onMove: (pos: Pos) => void;
  /** The Rifter's state (dormant whenever the party arrives). */
  rifter: RifterState;
  /** The leader used the Rifter (its receptacle, from beside it): open its window. */
  onUseRifter: () => void;
  /** The leader spoke to an NPC (from beside it): open its window. */
  onTalkTo: (npcId: string) => void;
  /** NPC id → the tile it turns to face (the leader talking to it, then back to its own way). */
  npcAims: Record<string, UnitAim>;
  /** The leader stepped into the Rifter's open rift (from beside it): go to its dungeon. */
  onEnterRift: (dungeon: DungeonKey) => void;
  activeTarget: TargetType | null;  // target type of the selected ability (null = none selected)
  onAbilityUse: (pos: Pos) => void;
  onAbilityDeselect: () => void;
  onMemberSelect: (partyIndex: number) => void;
  /** Where each unit last aimed an ability; its model turns to face it. */
  aims?: Record<string, UnitAim>;
  /** The 3D layer has drawn its first frame (ModelLayer onReady): the page stops hiding the map. */
  onReady?: () => void;
}

export default function SanctumMap({ playerPos, activeMoverPos, party, moveTargets, onMove, rifter, onUseRifter, onTalkTo, npcAims, onEnterRift, activeTarget, onAbilityUse, onAbilityDeselect, onMemberSelect, aims, onReady }: Props) {
  const hover = useHoveredTile();
  // The rift open in the Rifter (on its middle tile), if one can be entered: not while a swap's old rift closes
  const openRift = rifter.rift && rifter.phase !== 'close' ? rifter.rift : null;
  const isRiftTile = (p: Pos) => !!openRift && samePos(p, SANCTUM.rifter.pos);
  const board = useBoard(SANCTUM.width, SANCTUM.height);

  const memberByKey = useMemo(() => new Map(party.map(m => [posKey(m.pos), m])), [party]);
  // Party members drawn as their class models (HP/MP bars above their heads)
  const modelParty = useMemo(() => party.map(m => toMapMember(m)), [party]);
  const rifterObjects = useMemo(() => sanctumObjects(rifter), [rifter.key, rifter.rift, rifter.phase]); // eslint-disable-line react-hooks/exhaustive-deps -- rifter tracked by its fields
  const objects = useMemo(() => [...rifterObjects, ...DECOR, ...npcObjects(npcAims)], [rifterObjects, npcAims]);
  const canMoveTo = (p: Pos) => moveTargets.has(posKey(p));

  const handleClick = (p: Pos) => {
    if (isSanctumWall(p)) return;
    const member = memberByKey.get(posKey(p));
    if (activeTarget) {
      if (activeTarget === 'self') onAbilityUse(p);
      else if (activeTarget === 'ally' && member) onAbilityUse(p);
      else onAbilityDeselect();
      return;
    }
    // Clicking a party member selects their action bar
    if (member) { onMemberSelect(member.partyIndex); return; }
    // An NPC, the leader beside it: speak to it
    const standing = sanctumNpcAt(p);
    if (standing) {
      if (isAdjacent(playerPos, p)) onTalkTo(standing.id);
      return;
    }
    // The Rifter's receptacle, the leader beside it, opens its window
    if (samePos(p, SANCTUM_RECEPTACLE)) {
      if (isAdjacent(playerPos, p)) onUseRifter();
      return;
    }
    // Its open rift, the leader beside it, takes the party to the rift's dungeon
    if (openRift && isRiftTile(p)) {
      if (isAdjacent(playerPos, p)) onEnterRift(openRift);
      return;
    }
    if (canMoveTo(p)) onMove(p);
  };

  // Stable for the memoized tiles; always runs the latest handleClick
  const onTileClick = useStableHandler(handleClick);

  const tile = (p: Pos) => {
    const isWall = isSanctumWall(p);
    // The receptacle glows while the leader can use it (beside it), stronger when hovered, like a dungeon door
    const isReceptacle = samePos(p, SANCTUM_RECEPTACLE) && isAdjacent(playerPos, p);
    // An NPC glows while the leader can speak to it (beside it), like the receptacle
    const isNpcNear = !!sanctumNpcAt(p) && isAdjacent(playerPos, p);
    const allyTarget = !isWall && activeTarget === 'ally' && memberByKey.has(posKey(p));
    return (
      <FloorTile key={posKey(p)} p={p} hover={hover} onClick={onTileClick}
        color={SANCTUM_DEEP_FOG.has(posKey(p)) ? 'var(--rift-fog)' : isWall ? SANCTUM_WALL_COLOR : SANCTUM_FLOOR_COLOR}
        brighten={!isWall && !activeTarget && canMoveTo(p) && hover.isHovered(p)}>
        {allyTarget && <TileHighlight kind="ally" />}
        {isNpcNear && <UsableGlow color="var(--glow)" hovered={hover.isHovered(p)} />}
        {isReceptacle && <UsableGlow color={interactiveObjectGlow('rifter')} hovered={hover.isHovered(p)} />}
        {/* The open rift, like a dungeon's exit rift: its tile glows in its color while the leader can step in; hovered
            from farther away, its edges glow faintly */}
        {openRift && isRiftTile(p) && (isAdjacent(playerPos, p)
          ? <UsableGlow color={riftGlowCss(DUNGEONS[openRift].riftColor)} hovered={hover.isHovered(p)} />
          : hover.isHovered(p) && <HoverEdgeGlow color={riftGlowCss(DUNGEONS[openRift].riftColor)} />)}
      </FloorTile>
    );
  };

  const hoveredNpc = hover.hovered ? sanctumNpcAt(hover.hovered) : undefined;

  const floor = (
    <>
      <FloorGrid cols={SANCTUM.width} rows={SANCTUM.height} tile={tile} />
      {!activeTarget && hover.hovered && canMoveTo(hover.hovered) && (
        <MoveLineOverlay from={activeMoverPos} to={hover.hovered} />
      )}
    </>
  );

  // No frame: the board floats on the game screen's background
  return (
    <Board board={board} floor={floor}>
      <Suspense fallback={null}>
        <ModelLayer board={board} party={modelParty} objects={objects} aims={aims} fog={SANCTUM_FOG} onReady={onReady} />
      </Suspense>
      {/* An NPC's name over its head while it is hovered, like an enemy's */}
      {hoveredNpc && (
        <ObjectTag board={board} x={hoveredNpc.pos.x} y={hoveredNpc.pos.y} height={NPC_TAG_HEIGHT} text={npc(hoveredNpc.id).name} icon={npcIcon(npc(hoveredNpc.id))} />
      )}
      {/* Where the open rift leads, at once while it is hovered, wherever the party stands */}
      {openRift && hover.hovered && isRiftTile(hover.hovered) && (
        <ObjectTag board={board} x={SANCTUM.rifter.pos.x} y={SANCTUM.rifter.pos.y} height={RIFT_TAG_HEIGHT} text={riftTag(DUNGEONS[openRift].name)} />
      )}
    </Board>
  );
}

import { lazy, Suspense, useMemo, useState, type ReactNode } from 'react';
import { FaCoins } from 'react-icons/fa';
import { GiMagicPalm } from 'react-icons/gi';
import type { TargetType } from '../data/combat/abilities';
import { isAdjacent, posKey, samePos, type Pos } from '../data/world/grid';
import { approachTile, closestReachable } from '../data/world/movement';
import { SANCTUM, SANCTUM_RECEPTACLE, isSanctumWall, sanctumNpcAt } from '../data/world/sanctum';
import { canTalkTo, npc, type NpcData } from '../data/world/npcs';
import type { Conversation, DialogueTopic, QuestMark } from '../data/world/dialogue';
import type { QuestLog } from '../data/world/quests';
import { interactiveObjectGlow } from '../data/world/interactiveObjects';
import { DUNGEONS, type DungeonKey } from '../data/world/dungeons';
import { riftGlowCss } from '../data/world/rifts';
import { Board, FloorGrid, FloorTile, HoverEdgeGlow, MapFloats, MoveLineOverlay, ObjectTag, RIFT_TAG_HEIGHT, TileHighlight, UprightAt, UsableGlow, riftTag, toMapMember, useBoard, useHoveredTile, useStableHandler, type PartyTokenData } from './mapParts';
import type { UnitAim, UnitFx } from './ModelLayer';
import { SANCTUM_3D, SANCTUM_DECOR, SANCTUM_DOORS, SANCTUM_FOG, npcObjects, rifterObjects, type RifterState } from './sanctumScene';
import type { FloatingText } from './FloatingCombatText';
import NpcDialogue, { DIALOGUE_PORTRAIT } from './NpcDialogue';
import { NpcPortrait } from './hud/Portrait';

// 3D party models over the tile grid. Lazy: it pulls in three.js (GameScreen preloads it on mount).
const ModelLayer = lazy(() => import('./ModelLayer'));

/** How high (world tiles) an NPC's name tag sits: over a standing person's head (CHARACTER_HEIGHT 1.12). */
const NPC_TAG_HEIGHT = 1.35;
/** How high (world tiles) a quest marker (! or ?) floats over an NPC: over the tallest of them (Gorn), clear of its name tag. */
const QUEST_MARK_HEIGHT = 1.75;
/** How high (world tiles) a quest marker floats over the Rifter's receptacle: over the device beside it. */
const RECEPTACLE_MARK_HEIGHT = 1.6;

/** The icon before an NPC's name in its tag, by the service it offers. */
const SERVICE_ICON: Record<NonNullable<NpcData['service']>, ReactNode> = {
  vendor: <FaCoins aria-hidden="true" className="w-3 h-3 shrink-0" style={{ color: 'var(--rift-gold)' }} />,
  enchanting: <GiMagicPalm aria-hidden="true" className="w-3 h-3 shrink-0" style={{ color: 'var(--rift-enchant)' }} />,
};
const npcIcon = (data: NpcData) => (data.service ? SERVICE_ICON[data.service] : undefined);

/** What a click on a tile does (SanctumMap's clickPlan): walk to `walk` if set, then `use` if set. */
interface ClickPlan { walk: Pos | null; use?: () => void }

interface Props {
  playerPos: Pos;
  activeMoverPos: Pos;
  party: PartyTokenData[];
  /** Tiles the active mover can move to this turn (tile key -> steps), from GameScreen (partyMoveTargets). */
  moveTargets: Map<string, number>;
  /** Move the leader to a reachable tile: true if it moved (a click then uses what it walked to). */
  onMove: (pos: Pos) => boolean;
  /** The Rifter's state (dormant whenever the party arrives). */
  rifter: RifterState;
  /** The leader used the Rifter (its receptacle, from beside it): open its window. */
  onUseRifter: () => void;
  /** The leader spoke to an NPC (from beside it, standing at `leaderAt`): open its window. */
  onTalkTo: (npcId: string, leaderAt: Pos) => void;
  /** NPC id → the tile it turns to face (the leader talking to it, then back to its own way). */
  npcAims: Record<string, UnitAim>;
  /**
   * The NPC speaking to the party now, the conversation it speaks (its dialogue over its head: NpcDialogue), and this
   * talk's number (a new talk starts its conversation over); null when none is.
   */
  speaking: { npcId: string; talk: number; conversation: Conversation } | null;
  /** The speaking NPC finished the topic it was asked about (it goes back to its opening). */
  onTopicDone: (topic: DialogueTopic) => void;
  /** The speaking NPC finished its conversation (right-click past its opening's last statement). */
  onEndTalk: () => void;
  /** The party's quests: what a speaking NPC's topics lead to. */
  quests: QuestLog;
  /** NPC id → its quest marker (! a quest to take, ? one to hand in): shown over its head. */
  questMarks: Record<string, QuestMark>;
  /** The Rifter can be used (the party has been told how: RIFTER_UNLOCK); until then its receptacle doesn't respond. */
  rifterUsable: boolean;
  /** A quest marker over the Rifter's receptacle (a quest step waiting on it), if any. */
  rifterMark: QuestMark | null;
  /** The leader stepped into the Rifter's open rift (from beside it): go to its dungeon. */
  onEnterRift: (dungeon: DungeonKey) => void;
  activeTarget: TargetType | null;  // target type of the selected ability (null = none selected)
  onAbilityUse: (pos: Pos) => void;
  onAbilityDeselect: () => void;
  onMemberSelect: (partyIndex: number) => void;
  /** Where each unit last aimed an ability; its model turns to face it. */
  aims?: Record<string, UnitAim>;
  /** The feedback each unit's model last showed (a hit's flash, a heal's or effect's glow): a new one plays. */
  fx?: Record<string, UnitFx>;
  /** Floating text over the map (gold from a sale, a heal). */
  floatingTexts: FloatingText[];
  onFloatingTextComplete: (id: number) => void;
  /** The 3D layer has drawn its first frame (ModelLayer onReady): the page stops hiding the map. */
  onReady?: () => void;
}

export default function SanctumMap({ playerPos, activeMoverPos, party, moveTargets, onMove, rifter, onUseRifter, onTalkTo, npcAims, speaking, onTopicDone, onEndTalk, quests, questMarks, rifterUsable, rifterMark, onEnterRift, activeTarget, onAbilityUse, onAbilityDeselect, onMemberSelect, aims, fx, floatingTexts, onFloatingTextComplete, onReady }: Props) {
  const hover = useHoveredTile();
  // The rift open in the Rifter (on its middle tile), if one can be entered: not while a swap's old rift closes
  const openRift = rifter.rift && rifter.phase !== 'close' ? rifter.rift : null;
  const isRiftTile = (p: Pos) => !!openRift && samePos(p, SANCTUM.rifter.pos);
  const board = useBoard(SANCTUM.width, SANCTUM.height);
  const [terrainHost, setTerrainHost] = useState<HTMLDivElement | null>(null);

  const memberByKey = useMemo(() => new Map(party.map(m => [posKey(m.pos), m])), [party]);
  // Party members drawn as their class models (HP/MP bars above their heads)
  const modelParty = useMemo(() => party.map(m => toMapMember(m)), [party]);
  const rifterNow = useMemo(() => rifterObjects(rifter), [rifter.key, rifter.rift, rifter.phase]); // eslint-disable-line react-hooks/exhaustive-deps -- rifter tracked by its fields
  const objects = useMemo(() => [...rifterNow, ...SANCTUM_DOORS, ...SANCTUM_DECOR, ...npcObjects(npcAims)], [rifterNow, npcAims]);
  const canMoveTo = (p: Pos) => moveTargets.has(posKey(p));

  /**
   * What a click on `p` does: walk to the tile `walk` (if set), then `use` something (if set); null: nothing. The
   * click runs it and the hover shows its walk. An NPC, the Rifter's receptacle or its open rift is used from beside
   * it, or from afar after walking up to it; a tile that can't be reached (a wall, decor, too far) walks as close
   * to it as the leader can get (no ability armed).
   */
  const clickPlan = (p: Pos): ClickPlan | null => {
    const key = posKey(p);
    const nearer = (): ClickPlan | null => {
      const walk = activeTarget ? null : closestReachable(moveTargets, p, activeMoverPos);
      return walk ? { walk } : null;
    };
    // `use` from beside `p` (told where the leader then stands), else after walking up to it, else as near as can be
    const actAt = (use: (leaderAt: Pos) => void, usable: boolean): ClickPlan | null => {
      if (!usable) return nearer();
      if (isAdjacent(playerPos, p)) return { walk: null, use: () => use(playerPos) };
      const walk = activeTarget ? null : approachTile(moveTargets, p, activeMoverPos);
      return walk ? { walk, use: () => use(walk) } : nearer();
    };

    if (isSanctumWall(p)) return nearer();
    const member = memberByKey.get(key);
    if (activeTarget) {
      return { walk: null, use: () => (activeTarget === 'self' || (activeTarget === 'ally' && member) ? onAbilityUse(p) : onAbilityDeselect()) };
    }
    // Clicking a party member selects their action bar
    if (member) return { walk: null, use: () => onMemberSelect(member.partyIndex) };
    // An NPC: speak to it (if it has anything to say: canTalkTo), the leader turning up beside it
    const standing = sanctumNpcAt(p);
    if (standing) return actAt((leaderAt) => onTalkTo(standing.id, leaderAt), canTalkTo(standing.id));
    // The Rifter's receptacle opens its window
    if (samePos(p, SANCTUM_RECEPTACLE)) return actAt(onUseRifter, rifterUsable);
    // Its open rift takes the party to the rift's dungeon
    if (openRift && isRiftTile(p)) return actAt(() => onEnterRift(openRift), true);
    return canMoveTo(p) ? { walk: p } : nearer();
  };

  const handleClick = (p: Pos) => {
    const plan = clickPlan(p);
    if (!plan) return;
    if (!plan.walk || onMove(plan.walk)) plan.use?.();
  };

  // Stable for the memoized tiles; always runs the latest handleClick
  const onTileClick = useStableHandler(handleClick);

  // Where a click on the hovered tile would walk to (its move line shows it, and the tile lights)
  const hoverWalk = hover.hovered ? clickPlan(hover.hovered)?.walk ?? null : null;

  const tile = (p: Pos) => {
    const isWall = isSanctumWall(p);
    // The receptacle glows while the leader can use it (beside it), stronger when hovered, like a dungeon door
    const isReceptacle = rifterUsable && samePos(p, SANCTUM_RECEPTACLE) && isAdjacent(playerPos, p);
    // An NPC glows while the leader can speak to it (beside it), like the receptacle
    const near = sanctumNpcAt(p);
    const isNpcNear = !!near && canTalkTo(near.id) && isAdjacent(playerPos, p);
    const allyTarget = !isWall && activeTarget === 'ally' && memberByKey.has(posKey(p));
    return (
      <FloorTile key={posKey(p)} p={p} hover={hover} onClick={onTileClick}
        brighten={!isWall && !!hoverWalk && samePos(p, hoverWalk)}>
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

  // The hovered NPC's name tag (not while it speaks: its dialogue names it)
  const hoveredNpc = hover.hovered ? sanctumNpcAt(hover.hovered) : undefined;
  const tagged = hoveredNpc && hoveredNpc.id !== speaking?.npcId ? hoveredNpc : undefined;
  const speaker = speaking && SANCTUM.npcs.find((n) => n.id === speaking.npcId);

  const floor = (
    <>
      <FloorGrid cols={SANCTUM.width} rows={SANCTUM.height} tile={tile} />
      {hoverWalk && <MoveLineOverlay from={activeMoverPos} to={hoverWalk} />}
    </>
  );

  // No frame: the board floats on the game screen's background
  return (
    <Board board={board} floor={floor} under={<div ref={setTerrainHost} className="absolute inset-0 pointer-events-none" />}>
      <Suspense fallback={null}>
        <ModelLayer board={board} party={modelParty} objects={objects} aims={aims} fx={fx} fog={SANCTUM_FOG} onReady={onReady} terrain={SANCTUM_3D} terrainHost={terrainHost} />
      </Suspense>
      {/* Quest markers over the NPCs' heads (not the speaking one's: its dialogue covers it) */}
      {SANCTUM.npcs.filter((n) => questMarks[n.id] && n.id !== speaking?.npcId).map((n) => (
        <UprightAt key={n.id} board={board} x={n.pos.x} y={n.pos.y} height={QUEST_MARK_HEIGHT} className="z-30">
          <span role="img" aria-label={questMarks[n.id] === '!' ? 'Quest available' : 'Quest to hand in'} className={`rf-quest-mark ${questMarks[n.id] === '!' ? 'text-[24px]' : 'text-[30px]'}`}>{questMarks[n.id]}</span>
        </UprightAt>
      ))}
      {/* A quest marker over the Rifter's receptacle (a quest step waiting on it) */}
      {rifterMark && (
        <UprightAt board={board} x={SANCTUM_RECEPTACLE.x} y={SANCTUM_RECEPTACLE.y} height={RECEPTACLE_MARK_HEIGHT} className="z-30">
          <span role="img" aria-label="Quest: use the Rifter" className="rf-quest-mark text-[30px]">{rifterMark}</span>
        </UprightAt>
      )}
      {/* The speaking NPC's dialogue, its point just over its head */}
      {speaking && speaker && (
        <UprightAt board={board} x={speaker.pos.x} y={speaker.pos.y} height={NPC_TAG_HEIGHT} className="z-40">
          <div className="absolute bottom-1/2 left-1/2 -translate-x-1/2 mb-2">
            <NpcDialogue key={speaking.talk} portrait={<NpcPortrait npcId={speaker.id} size={DIALOGUE_PORTRAIT} />} name={npc(speaker.id).name} conversation={speaking.conversation} quests={quests}
              onTopicDone={onTopicDone} onEnd={onEndTalk} />
          </div>
        </UprightAt>
      )}
      {/* An NPC's name over its head while it is hovered, like an enemy's */}
      {tagged && (
        <ObjectTag board={board} x={tagged.pos.x} y={tagged.pos.y} height={NPC_TAG_HEIGHT} text={npc(tagged.id).name} icon={npcIcon(npc(tagged.id))} />
      )}
      {/* Where the open rift leads, at once while it is hovered, wherever the party stands */}
      {openRift && hover.hovered && isRiftTile(hover.hovered) && (
        <ObjectTag board={board} x={SANCTUM.rifter.pos.x} y={SANCTUM.rifter.pos.y} height={RIFT_TAG_HEIGHT} text={riftTag(DUNGEONS[openRift].name)} />
      )}
      <MapFloats board={board} floats={floatingTexts} onComplete={onFloatingTextComplete} />
    </Board>
  );
}

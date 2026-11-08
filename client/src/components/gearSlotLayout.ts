// How a member's equipment is laid out, in the party window and the enchanter's window: each slot's icon (empty) and its
// place in the 3×5 grid.
import type { ComponentType } from 'react';
import { Crown, Shirt, Hand, Footprints, Sword, Shield, Gem, CircleDot } from 'lucide-react';
import type { GearSlot } from '../data/gear';

export const SLOT_ICON: Record<GearSlot, ComponentType<{ className?: string }>> = {
  helm: Crown, chest: Shirt, gloves: Hand, boots: Footprints,
  mainhand: Sword, offhand: Shield,
  amulet: Gem, ring1: CircleDot, ring2: CircleDot,
};

// Grid position for each slot (col, row) in the 3×5 equipment grid: the head, the amulet under it, the hands
// beside the chest, the rings beside the gloves, the boots at the bottom
export const SLOT_POS: Record<GearSlot, { col: number; row: number }> = {
  helm:     { col: 2, row: 1 },
  amulet:   { col: 2, row: 2 },
  mainhand: { col: 1, row: 3 },
  chest:    { col: 2, row: 3 },
  offhand:  { col: 3, row: 3 },
  ring1:    { col: 1, row: 4 },
  gloves:   { col: 2, row: 4 },
  ring2:    { col: 3, row: 4 },
  boots:    { col: 2, row: 5 },
};

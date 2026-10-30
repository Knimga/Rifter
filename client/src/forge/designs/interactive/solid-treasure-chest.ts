// Model for Solid Treasure Chest (data/world/interactiveObjects.ts › solid-treasure-chest): the Worn Treasure
// Chest's shape (designs/_chest.ts) in grey planks clasped in iron, its padlock silver. Found in every boss room.
import { treasureChestDesign } from '../_chest';

export default treasureChestDesign('solid-treasure-chest', {
  // Grey, a shade lighter than the iron straps so they still stand out on it
  wood: [98, 98, 104],
  woodDark: [80, 80, 86],
  lock: [196, 200, 210],
});

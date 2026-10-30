// Model for Worn Treasure Chest (data/world/interactiveObjects.ts › worn-treasure-chest): a plain wooden chest, brown
// planks clasped in iron, its padlock iron too. The shape (and its 'open' animation) is every treasure chest's:
// designs/_chest.ts.
import { treasureChestDesign } from '../_chest';

export default treasureChestDesign('worn-treasure-chest', {
  wood: [84, 54, 32],
  woodDark: [68, 44, 26],
  lock: [96, 98, 106],
});

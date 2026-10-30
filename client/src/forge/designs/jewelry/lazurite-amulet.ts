// Model for Lazurite Amulet (data/gear/jewelry.ts › amulet lazurite-amulet): the amulet (_amulet.ts amuletDesign), an
// oval cabochon of deep blue lazurite (lapis) in a silver setting, on a silver chain lying loose behind it.
import { amuletDesign } from '../_amulet';
import { SILVER } from '../_ring';

export default amuletDesign('lazurite-amulet', { stone: [11, 24, 64], metal: SILVER, glint: [90, 140, 255] }); // #0B1840

// Model for Plain Battleaxe (data/gear/weapons.ts › WEAPON_SERIES plain › 2h Axes).
import { axeDesign } from '../_axe';

// Blades shorter along the haft (0.8, then 15% less): the head keeps its top under the spike and its reach
export default axeDesign('plain', '2h Axes', { bladeLength: 0.68 });

// Draft change for Tungsten Band (data/gear/jewelry.ts › ring tungsten-band): the same band, but tiny on the floor
// (fit.size 0.18, was 0.3).
import { bandDesign } from '../_ring';
import type { Design } from '../../core/types';

const band = bandDesign('tungsten-band', [158, 164, 174]);
const design: Design = { ...band, fit: { kind: 'item', size: 0.1 } };

export default design;

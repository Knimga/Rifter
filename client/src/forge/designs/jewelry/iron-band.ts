// Draft change for Iron Band (data/gear/jewelry.ts › ring iron-band): the same band, but tiny on the floor
// (fit.size 0.18, was 0.3).
import { bandDesign } from '../_ring';
import type { Design } from '../../core/types';

const band = bandDesign('iron-band', [104, 106, 112]);
const design: Design = { ...band, fit: { kind: 'item', size: 0.1 } };

export default design;

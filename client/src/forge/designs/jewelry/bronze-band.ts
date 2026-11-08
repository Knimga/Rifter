// Draft change for Bronze Band (data/gear/jewelry.ts › ring bronze-band): the same band, but tiny on the floor
// (fit.size 0.18, was 0.3).
import { BRONZE, bandDesign } from '../_ring';
import type { Design } from '../../core/types';

const band = bandDesign('bronze-band', BRONZE);
const design: Design = { ...band, fit: { kind: 'item', size: 0.1 } };

export default design;

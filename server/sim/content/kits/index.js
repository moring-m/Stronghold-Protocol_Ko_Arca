import { KITS as allKits } from '../index.js';
// Compatibility exports for the upstream operator fidelity tests. Existing tier kits remain unchanged.
import registry from './upstreamRecruits.js';
export const OPERATOR_KITS=Object.freeze(Object.fromEntries(Object.entries(registry).filter(([id])=>id.startsWith('char_'))));
export const KITS=allKits;
export const KITTED_CHARS=Object.freeze([...Object.keys(OPERATOR_KITS),'char_601_cguard','char_602_cdfend','char_603_csnipe','char_604_ccast','char_605_cmedic','char_606_csuppo']);

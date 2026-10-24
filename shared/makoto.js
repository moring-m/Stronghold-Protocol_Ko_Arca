// Persona/all-out area shared by simulation and simplified ground indicators.
export const MAKOTO_RANGE = [[2,0],[1,-1],[1,0],[1,1],[0,-2],[0,-1],[0,0],[0,1],[0,2],[-1,-1],[-1,0],[-1,1],[-2,0]];

/** The persona's backdrop starts with SwitchIn, after the evoker's SwitchOut. */
export function makotoEffectForm(form, elapsed) {
 if (['makoto_s1','makoto_s2','makoto_s3a'].includes(form) && elapsed < 1-1e-9) return 'makoto_entering';
 if (form === 'makoto_change') return elapsed < .5-1e-9 ? 'makoto_entering' : 'makoto_s3b';
 return form;
}

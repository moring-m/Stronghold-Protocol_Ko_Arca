// 선발 후보 / 선발 선택. Before the match a player marks up to RECRUIT_CANDIDATES per tier (5 and 6) as recruit
// candidates (loadout entries `selected: true`, shared/protocol.js checkLoadout). After the strategy draft, in the
// RECRUIT_PICK phase, each player picks up to RECRUIT_PICKS per tier from their own candidates (g.recruitPick); only
// the picked operators appear in that player's recruits and rewards (PlayerState.canRecruit).

export const RECRUIT_TIERS = Object.freeze([5, 6]);
export const RECRUIT_CANDIDATES = 6;
export const RECRUIT_PICKS = 2;

/** The identity two picks (or candidates) may not share: the operator, or operator + tier for a prototype. */
export const recruitIdentity = (c) => (c.recruitPrototype ? `${c.charId}:${c.tier}` : c.charId);

/** A player's candidates: the optional recruits marked `selected` in the loadout, by tier then id. */
export function recruitCandidates(loadout, getChess) {
  const out = [];
  for (const [id, e] of Object.entries(loadout || {})) {
    if (!e || e.selected !== true) continue;
    const c = getChess(id);
    if (c && c.optionalRecruit && RECRUIT_TIERS.includes(c.tier)) out.push(id);
  }
  return out.sort((a, b) => (getChess(a).tier - getChess(b).tier) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * Check a pick list against the candidates: each a candidate, ≤ RECRUIT_PICKS per tier, no identity twice.
 * @returns {{ ok: true, picks: string[] } | { ok: false, detail: string }}
 */
export function checkRecruitPicks(picks, candidates, getChess) {
  if (!Array.isArray(picks) || picks.length > RECRUIT_PICKS * RECRUIT_TIERS.length) return { ok: false, detail: 'bad picks' };
  const allowed = new Set(candidates), seen = new Set(), ids = new Set(), per = { 5: 0, 6: 0 };
  for (const id of picks) {
    if (typeof id !== 'string' || !allowed.has(id) || ids.has(id)) return { ok: false, detail: 'not a candidate' };
    const c = getChess(id);
    if (!c || !RECRUIT_TIERS.includes(c.tier)) return { ok: false, detail: 'not a candidate' };
    if (++per[c.tier] > RECRUIT_PICKS) return { ok: false, detail: `최대 ${RECRUIT_PICKS}명씩` };
    const key = recruitIdentity(c);
    if (seen.has(key)) return { ok: false, detail: '동일 오퍼레이터 중복' };
    seen.add(key); ids.add(id);
  }
  return { ok: true, picks: [...ids] };
}

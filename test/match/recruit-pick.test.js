import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch, DATA } from './harness.js';
import { checkLoadout } from '../../shared/protocol.js';
import { checkRecruitPicks, RECRUIT_CANDIDATES } from '../../shared/recruitPick.js';
import { PHASE } from '../../shared/constants.js';

const getChess = (id) => DATA.chess[id];
const recruits = (tier) => Object.values(DATA.chess).filter((c) => c.optionalRecruit && c.visible !== false && !c.isGolden && !c.isHidden && c.tier === tier && !c.recruitPrototype).map((c) => c.chessId);

test('loadout: up to 6 recruit candidates per tier, a 7th is refused', () => {
  const five = recruits(5);
  const ok = Object.fromEntries(five.slice(0, RECRUIT_CANDIDATES).map((id) => [id, { selected: true }]));
  assert.ok(checkLoadout(ok, getChess).ok);
  const bad = Object.fromEntries(five.slice(0, RECRUIT_CANDIDATES + 1).map((id) => [id, { selected: true }]));
  assert.equal(checkLoadout(bad, getChess).error, 'BAD_TARGET');
});

test('picks: candidates only, at most 2 per tier', () => {
  const c = [...recruits(5).slice(0, 3), ...recruits(6).slice(0, 3)];
  assert.ok(checkRecruitPicks([c[0], c[1], c[3]], c, getChess).ok);
  assert.equal(checkRecruitPicks([c[0], c[1], c[2]], c, getChess).ok, false, 'three tier-5');
  assert.equal(checkRecruitPicks([recruits(5)[5]], c, getChess).ok, false, 'not a candidate');
});

test('RECRUIT_PICK: a pick, the 3rd of a tier refused, ready ends the phase, canRecruit follows the picks', (t) => {
  const h = makeMatch({ mode: 'coop', humans: 1, bots: 1, seed: 5 }).start();
  t.after(() => h.m.dispose());
  const m = h.m;
  // reach the draft without the harness answering RECRUIT_PICK
  h.run(() => m.phase === PHASE.BAND_DRAFT || m.phase === PHASE.INFO_CHECK);
  if (m.phase === PHASE.INFO_CHECK) m.handle('p_0', { t: 'g.infoReady' });
  h.run(() => m.phase === PHASE.BAND_DRAFT);
  const five = recruits(5).filter((id) => !m.bannedChess.includes(id)).slice(0, 3);
  assert.ok(m.setLoadout('p_0', Object.fromEntries(five.map((id) => [id, { selected: true }]))).ok);
  h.run(() => {
    if (m.phase === PHASE.BAND_DRAFT && m.draftTurn() === 'p_0') m.handle('p_0', { t: 'g.band', bandId: 'band_bldsk' });
    return m.phase === PHASE.RECRUIT_PICK || m.phase === PHASE.BATTLE_CHECK;
  });
  assert.equal(m.phase, PHASE.RECRUIT_PICK);
  const p0 = h.ps('p_0');
  assert.deepEqual(new Set(m.recruitCandidatesOf(p0)), new Set(five));
  assert.equal(m.publicView().players.find((p) => p.playerId === 'p_0').status, 'deciding');
  assert.ok(m.handle('p_0', { t: 'g.recruitPick', picks: five, ready: false }).error, 'three of tier 5');
  assert.ok(m.handle('p_0', { t: 'g.recruitPick', picks: [five[0]], ready: true }).ok);
  h.run(() => m.phase !== PHASE.RECRUIT_PICK);
  assert.equal(m.phase, PHASE.BATTLE_CHECK);
  assert.equal(p0.canRecruit(five[0]), true);
  assert.equal(p0.canRecruit(five[1]), false, 'a candidate not picked');
});

test('nobody with candidates: no RECRUIT_PICK phase', (t) => {
  const h = makeMatch({ mode: 'coop', humans: 2, seed: 9 }).start();
  t.after(() => h.m.dispose());
  const seen = new Set();
  h.drive(() => { seen.add(h.m.phase); return h.m.phase === PHASE.BATTLE_CHECK || h.m.phase === 'PREP'; });
  assert.ok(!seen.has(PHASE.RECRUIT_PICK));
});

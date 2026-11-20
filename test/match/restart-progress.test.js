import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMatch } from './harness.js';
import { Match } from '../../server/match/Match.js';
import { VirtualScheduler } from '../../server/match/scheduler.js';
import { getVersionData } from '../../server/data.js';
import { handleRestart, cancelVote, voteFrame } from '../../server/restartVote.js';

function startVote(t, m, now) {
  const room = { match: m, matchCount: 1, seats: m.order, activeHumans: () => m.humans(),
    seatOf: id => m.order.find(p => p.playerId === id) };
  const lobby = { now, roomOf: () => room, memberSessions: () => [], broadcastRoom() {} };
  t.after(() => cancelVote(lobby, room));
  assert.equal(handleRestart(lobby, { playerId: m.humans()[0].playerId }, { t: 'room.requestRestart', matchNo: 1 }).ok, true);
  return { room, lobby };
}

for (const humans of [4, 8]) test(`restart voting permits prep actions and does not shift deadlines (${humans} players)`, t => {
  const h = makeMatch({ mode: humans === 8 ? 'coop8' : 'coop', humans, fake: true }).start();
  t.after(() => h.m.dispose());
  h.toPrep();
  const m = h.m, deadline = m.deadline, now = h.sched.now();
  const { room } = startVote(t, m, () => h.sched.now());
  assert.equal(m.paused, false);
  assert.equal(m.handle('p_0', { t: 'g.refresh' }).ok, true);
  h.sched.advance(1000);
  assert.equal(m.deadline, deadline);
  assert.equal(m._clockNow(), now + 1000);
  assert.ok(voteFrame(room, 'p_0', h.sched.now()).vote);
});

test('restart voting allows augment selection while its original countdown runs', t => {
  const h = makeMatch({ humans: 4, fake: true, customExtensions: { rules: ['augments'] } });
  t.after(() => h.m.dispose());
  const m = h.m;
  m.round = 4;
  assert.equal(m.augments.enter(), true);
  startVote(t, m, () => h.sched.now());
  const deadline = m.deadline, s = m.augments.current, card = s.slots.get('p_0').cards[0];
  assert.equal(m.handle('p_0', { t: 'g.augmentPick', eventId: s.id, side: 'ally', idx: 0, cardId: card.id }).ok, true);
  h.sched.advance(1000);
  assert.equal(m.deadline, deadline);
  assert.equal(m.paused, false);
});

test('regulation restart voting leaves the phase timeout running', t => {
  const version = 'act3autochess@V3_1', scheduler = new VirtualScheduler({ start: 1000 });
  const m = new Match({ version, data: getVersionData(version), scheduler, mode: 'coop', difficulty: 'NORMAL', seed: 7,
    seats: [0, 1].map(seat => ({ seat, playerId: `p_${seat}`, name: `P${seat}`, isBot: false, connected: true })),
    send: () => true, broadcast() {}, onEnd() {}, log: { info() {}, warn() {}, error() {} } });
  t.after(() => m.dispose());
  m.phase = 'PREP';
  let fired = false;
  m.setDeadline(2, () => { fired = true; });
  startVote(t, m, () => scheduler.now());
  scheduler.advance(2000);
  assert.equal(fired, true);
  assert.equal(m.paused, false);
  assert.equal(m.errorCount, 0);
});

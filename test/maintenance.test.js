import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Maintenance, normalizeMaintenance, maintenanceAlertText } from '../server/maintenance.js';
import { isDirectLoopback } from '../server/maintenanceControl.js';
import { maintenanceNotice, countdownText } from '../public/js/ui/maintenanceBanner.js';

const MIN = 60_000;
function make(now0 = 1_000_000_000_000) {
  let now = now0;
  const sent = [], chats = [];
  const m = new Maintenance({ broadcast: (n) => sent.push(n), chat: (t, d) => chats.push([t, d]), now: () => now, setInterval: () => null, clearInterval: () => {} });
  return { m, sent, chats, at: (ms) => { now = ms; m.tick(); }, now: () => now };
}

test('normalize: validates times and trims the message', () => {
  const now = Date.parse('2026-11-07T00:00:00Z');
  assert.equal(normalizeMaintenance({ start: now + MIN, end: now }, now).ok, false);
  assert.equal(normalizeMaintenance({ start: now - 2 * MIN, end: now - MIN }, now).ok, false);
  assert.equal(normalizeMaintenance({ start: 'x', end: now + MIN }, now).ok, false);
  const r = normalizeMaintenance({ start: '2026-11-07T05:00:00Z', end: '2026-11-07T06:00:00Z', message: ' a\nb ' }, now);
  assert.ok(r.ok);
  assert.equal(r.notice.message, 'a b');
  assert.equal(r.notice.end - r.notice.start, 60 * MIN);
});

test('alerts at 30/10/5/1 minutes and at the start, once each; clears at the end', () => {
  const h = make();
  const t0 = h.now();
  h.m.set({ start: t0 + 40 * MIN, end: t0 + 100 * MIN, message: '업데이트' });
  assert.equal(h.sent.length, 1);
  assert.equal(h.chats.length, 0);
  for (const left of [30, 29.5, 10, 5, 1, 0.5]) h.at(t0 + (40 - left) * MIN);
  h.at(t0 + 40 * MIN);
  h.at(t0 + 41 * MIN);
  assert.deepEqual(h.chats.map((c) => c[0]), [30, 10, 5, 1, 0].map(maintenanceAlertText));
  assert.equal(h.chats[0][1], '업데이트');
  h.at(t0 + 100 * MIN);
  assert.equal(h.m.view(), null);
  assert.equal(h.sent.at(-1), null);
});

test('a notice set late skips the alerts already passed; replacing the same notice does not resend', () => {
  const h = make();
  const t0 = h.now();
  h.m.set({ start: t0 + 7 * MIN, end: t0 + 60 * MIN });
  assert.deepEqual(h.chats, []);
  h.at(t0 + 2 * MIN); // 5 minutes left
  assert.deepEqual(h.chats.map((c) => c[0]), [maintenanceAlertText(5)]);
  h.m.set({ start: t0 + 7 * MIN, end: t0 + 60 * MIN, message: 'x' });
  h.at(t0 + 2.5 * MIN);
  assert.equal(h.chats.length, 1);
  h.m.clear();
  assert.equal(h.m.view(), null);
});

test('only a direct loopback request may set it locally', () => {
  assert.equal(isDirectLoopback({ socket: { remoteAddress: '127.0.0.1' }, headers: {} }), true);
  assert.equal(isDirectLoopback({ socket: { remoteAddress: '::1' }, headers: {} }), true);
  assert.equal(isDirectLoopback({ socket: { remoteAddress: '127.0.0.1' }, headers: { 'cf-connecting-ip': '1.2.3.4' } }), false);
  assert.equal(isDirectLoopback({ socket: { remoteAddress: '192.168.0.5' }, headers: {} }), false);
});

test('client: notice parsing and countdown text', () => {
  assert.equal(maintenanceNotice(null), null);
  assert.equal(maintenanceNotice({ start: 2, end: 1 }), null);
  assert.deepEqual(maintenanceNotice({ id: 'a', start: 1, end: 2, message: 'm' }), { id: 'a', start: 1, end: 2, message: 'm' });
  assert.equal(countdownText(61_000), '1:01');
  assert.equal(countdownText(3_661_000), '1:01:01');
});

// 인게임 버그 제보: bug.report is validated, rate-limited and stored with the reporter's room (server/bugReports.js);
// the page keeps its recent console warnings / errors for it (public/js/logCapture.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Lobby } from '../server/lobby.js';
import { SessionRegistry } from '../server/net.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { getData } from '../server/data.js';
import { validateC2S } from '../shared/protocol.js';
import { REPORT_GAP_MS } from '../server/bugReports.js';
import { installLogCapture, capturedLogs, _resetLogCapture } from '../public/js/logCapture.js';

const quiet = { info() {}, warn() {}, error() {}, debug() {} };

test('bug.report: the message shape', () => {
  assert.equal(validateC2S({ t: 'bug.report', text: '상점에 엄선 오퍼레이터', logs: ['WARN x'], ctx: { app: '0.4.0a9' } }), null);
  assert.notEqual(validateC2S({ t: 'bug.report', text: '   ' }), null, 'empty text');
  assert.notEqual(validateC2S({ t: 'bug.report', text: 'x'.repeat(4001) }), null, 'too long');
  assert.notEqual(validateC2S({ t: 'bug.report', text: 'x', logs: new Array(301).fill('a') }), null, 'too many lines');
});

test('bug.report: stored with the room, one per gap', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-reports-'));
  const prev = process.env.SP_REPORT_DIR;
  process.env.SP_REPORT_DIR = dir;
  t.after(() => { if (prev == null) delete process.env.SP_REPORT_DIR; else process.env.SP_REPORT_DIR = prev; fs.rmSync(dir, { recursive: true, force: true }); });
  let clock = 1_000_000;
  const registry = new SessionRegistry();
  const lobby = new Lobby({ registry, getData, MatchClass: StubMatch, log: quiet, now: () => clock });
  t.after(() => lobby.shutdown());
  const s = registry.create('Reporter');
  s.connected = true;
  s.ws = { readyState: 1, bufferedAmount: 0, send() {} };
  assert.deepEqual(lobby.create(s, { mode: 'coop', difficulty: 'FUNNY' }), { ok: true });
  const r = lobby.handleMessage(s, { t: 'bug.report', text: '설산 거인이 움직이지 않음', logs: ['12:00 WARN [diy] no record'], ctx: { app: 'x' } });
  assert.equal(r.ok, true);
  const file = path.join(dir, `${r.id}.json`);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.text, '설산 거인이 움직이지 않음');
  assert.equal(saved.player.name, 'Reporter');
  assert.equal(saved.room.code, lobby.roomOf(s).code);
  assert.deepEqual(saved.logs, ['12:00 WARN [diy] no record']);
  assert.equal(lobby.handleMessage(s, { t: 'bug.report', text: 'again' }).ok, undefined, 'too soon');
  clock += REPORT_GAP_MS;
  assert.equal(lobby.handleMessage(s, { t: 'bug.report', text: 'again' }).ok, true);
});

test('the page keeps its console warnings and errors', () => {
  const target = { console: { warn() {}, error() {}, log() {} }, addEventListener() {} };
  _resetLogCapture();
  installLogCapture(target);
  target.console.warn('[diy] no 自选 record', { slot: 'chess_char_5_diy1_a' });
  target.console.error(new Error('boom'));
  target.console.log('not kept');
  const lines = capturedLogs();
  assert.equal(lines.length, 2);
  assert.match(lines[0], /WARN \[diy\] no 自选 record \{"slot":"chess_char_5_diy1_a"\}/);
  assert.match(lines[1], /ERROR Error: boom/);
});

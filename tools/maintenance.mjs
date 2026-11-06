#!/usr/bin/env node
// 점검 안내 설정 (run on the server machine).
//
//   node tools/maintenance.mjs --start "2026-11-07 14:00" --end "2026-11-07 15:00" --message "밸런스 업데이트"
//   node tools/maintenance.mjs --in 30 --for 60            # 30분 뒤 시작, 60분 동안
//   node tools/maintenance.mjs --status
//   node tools/maintenance.mjs --clear
//
// Times without a zone are read in --tz (default Asia/Seoul). With SP_RELEASE_TOKEN_FILE set (the release gateway's
// private token) it goes to the gateway (--url, default http://127.0.0.1:3000/__roll/admin/maintenance), which passes
// it to every worker; otherwise to a single server's /__maintenance on this machine (--url, default port $PORT or 3000).
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(`--${name}`); return i >= 0 ? (args[i + 1] ?? '') : null; };
const flag = (name) => args.includes(`--${name}`);
const fail = (text) => { console.error(text); process.exit(1); };

/** "2026-11-07 14:00" in a time zone → epoch ms (an ISO string with a zone is used as is). */
function parseTime(text, tz) {
  const t = String(text).trim();
  if (/[zZ]$|[+-]\d\d:?\d\d$/.test(t)) return Date.parse(t);
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})$/.exec(t);
  if (!m) return NaN;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // the zone's offset at that moment (two passes cover a DST edge)
  const offsetAt = (ms) => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
      .formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
    return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute) - ms;
  };
  let ms = guess - offsetAt(guess);
  ms = guess - offsetAt(ms);
  return ms;
}

const tz = opt('tz') || 'Asia/Seoul';
const tokenFile = process.env.SP_RELEASE_TOKEN_FILE;
const token = tokenFile ? fs.readFileSync(tokenFile, 'utf8').trim() : null;
const url = opt('url') || (token ? 'http://127.0.0.1:3000/__roll/admin/maintenance' : `http://127.0.0.1:${process.env.PORT || 3000}/__maintenance`);
const headers = { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) };

let request;
if (flag('status')) request = { method: 'GET' };
else if (flag('clear')) request = { method: 'POST', body: { clear: true } };
else {
  let start, end;
  if (opt('in') != null || opt('for') != null) {
    const inMin = Number(opt('in') ?? 0), forMin = Number(opt('for'));
    if (!Number.isFinite(inMin) || !(forMin > 0)) fail('--in <분> --for <분> 형식으로 입력하세요.');
    start = Date.now() + inMin * 60_000;
    end = start + forMin * 60_000;
  } else {
    if (opt('start') == null || opt('end') == null) fail('사용법: --start "YYYY-MM-DD HH:mm" --end "YYYY-MM-DD HH:mm" [--message 문구] | --in 분 --for 분 | --status | --clear');
    start = parseTime(opt('start'), tz);
    end = parseTime(opt('end'), tz);
    if (!Number.isFinite(start) || !Number.isFinite(end)) fail('시각 형식: "YYYY-MM-DD HH:mm" (시간대는 --tz, 기본 Asia/Seoul)');
  }
  request = { method: 'POST', body: { start, end, message: opt('message') || '' } };
}

const response = await fetch(url, { method: request.method, headers, body: request.body ? JSON.stringify(request.body) : undefined }).catch((e) => fail(`연결 실패: ${e.message}`));
const result = await response.json().catch(() => ({}));
if (!response.ok) fail(`실패 (${response.status}): ${result.error || ''}`);
const n = result.notice;
const fmt = (ms) => new Date(ms).toLocaleString('ko-KR', { timeZone: tz });
console.log(n ? `점검 안내: ${fmt(n.start)} ~ ${fmt(n.end)} (${tz})${n.message ? ` · ${n.message}` : ''}` : '점검 안내 없음');
if (result.workers) for (const [id, w] of Object.entries(result.workers)) console.log(`  워커 ${id}: ${w.error ? `실패 (${w.error})` : '반영됨'}`);

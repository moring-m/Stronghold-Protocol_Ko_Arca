// server/bugReports.js — 인게임 버그 제보 (bug.report): the player's text, the page's recent console lines and a context
// snapshot, written as one JSON file per report and announced in the server log.
//
// Where: SP_REPORT_DIR, else <cwd>/.reports. A production game container is replaced on every release, so its deploy
// mounts a host directory there (deploy/ec2/rolling-update.sh: $root/reports → /reports). Every report is also logged
// (`[bug-report] <id> …`), so `docker logs` of the release still shows it without the mount.
// GitHub: when SP_GITHUB_ISSUES=1 and with a token (SP_GITHUB_TOKEN, or SP_GITHUB_TOKEN_FILE — a file holding it; the deploy mounts
// $root/state/github-token) each report also becomes an issue of SP_GITHUB_REPO (default moring-m/Stronghold-Protocol_Ko_Arca)
// labelled `bug-report`: the text and the version / phase / round context only — never the logs, the nickname or the
// room code (others can read the repository; those stay in the file / log, found by the report id). At most
// ISSUES_PER_HOUR issues an hour per server; a failed call is logged and the report is kept as before.
// Limits: the protocol bounds the sizes (shared/protocol.js 'bug.report'); here one report per REPORT_GAP_MS per session
// and REPORT_SESSION_MAX per session, so a stuck button cannot fill the disk.

import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';

export const REPORT_GAP_MS = 20_000;
export const REPORT_SESSION_MAX = 20;

/** The directory reports are written to. */
export function reportDir(env = process.env) {
  return env.SP_REPORT_DIR && String(env.SP_REPORT_DIR).trim() ? String(env.SP_REPORT_DIR).trim() : path.join(process.cwd(), '.reports');
}

/**
 * Store one report. Returns its id, or null when it could not be written (the log line still carries it).
 * @param {object} record @param {{ dir?: string, log?: { warn?: Function, error?: Function } }} [o]
 */
export function saveBugReport(record, { dir = reportDir(), log = null } = {}) {
  const at = new Date();
  const id = `${at.toISOString().slice(0, 10).replace(/-/g, '')}-${randomBytes(4).toString('hex')}`;
  const full = { id, at: at.toISOString(), ...record };
  log?.warn?.(`[bug-report] ${id} ${record.player?.name ?? '?'} room ${record.room?.code ?? '-'} ${record.room?.version ?? ''}: ${String(record.text || '').replace(/\s+/g, ' ').slice(0, 300)}`);
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${id}.json`), JSON.stringify(full, null, 1));
    fileIssue(id, full, log);
    return id;
  } catch (e) {
    log?.error?.(`[bug-report] ${id} could not be written to ${dir}: ${e?.code || e?.message || e}`);
    // the content goes to the log instead (bounded), so nothing is lost when the directory is not writable
    log?.warn?.(`[bug-report] ${id} body ${JSON.stringify(full).slice(0, 20000)}`);
    fileIssue(id, full, log);
    return id;
  }
}

export const ISSUES_PER_HOUR = 30;
const DEFAULT_REPO = 'moring-m/Stronghold-Protocol_Ko_Arca';
let issueTimes = [];

/** The GitHub token, or null (SP_GITHUB_TOKEN, else the first line of SP_GITHUB_TOKEN_FILE). */
export function githubToken(env = process.env) {
  if (env.SP_GITHUB_TOKEN && String(env.SP_GITHUB_TOKEN).trim()) return String(env.SP_GITHUB_TOKEN).trim();
  if (env.SP_GITHUB_TOKEN_FILE) {
    try { const t = fs.readFileSync(env.SP_GITHUB_TOKEN_FILE, 'utf8').split('\n')[0].trim(); return t || null; } catch { return null; }
  }
  return null;
}

/** No mention or broken fence from player text: `@x` → `@​x`, ``` → '''. */
const tame = (s) => String(s ?? '').replace(/@/g, '@​').replace(/```/g, "'''");
const FENCE = '```';

/** The issue of a report (exported for tests): no logs, no nickname, no room code. */
export function issueOf(id, r) {
  const ctx = r.ctx && typeof r.ctx === 'object' ? r.ctx : {};
  const room = r.room || {};
  const firstLine = String(r.text || '').split('\n').map((x) => x.trim()).find(Boolean) || '(내용 없음)';
  const row = (k, v) => (v == null || v === '' ? null : `| ${k} | ${tame(String(v)).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 200)} |`);
  const rows = [
    row('제보 ID', id), row('앱 버전', ctx.app), row('릴리즈', r.release || ctx.release), row('시즌', room.version || ctx.room?.version),
    row('모드', [room.mode, room.difficulty, room.gameplayMode].filter(Boolean).join(' / ')), row('단계', room.phase || ctx.match?.phase),
    row('라운드', room.round ?? ctx.match?.round), row('전장', ctx.match?.stageId), row('관전 중', ctx.match?.spectator ? '예' : null),
    row('콘텐츠', ctx.content ? [ctx.content.kind, ctx.content.status, ctx.content.error].filter(Boolean).join(' / ') : null),
    row('화면', ctx.screen), row('브라우저', ctx.ua), row('로그', Array.isArray(r.logs) && r.logs.length ? `${r.logs.length}줄 (서버에 보관)` : null),
  ].filter(Boolean);
  return {
    title: `[제보] ${tame(firstLine).slice(0, 80)}`,
    body: `${FENCE}text\n${tame(r.text).slice(0, 4000)}\n${FENCE}\n\n| 항목 | 값 |\n|---|---|\n${rows.join('\n')}\n\n_인게임 버그 제보로 자동 등록되었습니다. 로그는 서버의 제보 ${id}에 있습니다._`,
    labels: ['bug-report'],
  };
}

function fileIssue(id, record, log, { env = process.env, fetchFn = globalThis.fetch, now = Date.now } = {}) {
  // switched on explicitly (SP_GITHUB_ISSUES=1): the token alone files nothing — the owner's decision of 2026-11-18,
  // GitHub issues from the next hotfix on (the deploy sets the switch then)
  if (String(env.SP_GITHUB_ISSUES ?? '') !== '1') return null;
  const token = githubToken(env);
  if (!token || typeof fetchFn !== 'function') return null;
  const t = now();
  issueTimes = issueTimes.filter((x) => t - x < 3_600_000);
  if (issueTimes.length >= ISSUES_PER_HOUR) { log?.warn?.(`[bug-report] ${id} not filed on GitHub: ${ISSUES_PER_HOUR} issues this hour`); return null; }
  issueTimes.push(t);
  const repo = env.SP_GITHUB_REPO && /^[\w.-]+\/[\w.-]+$/.test(env.SP_GITHUB_REPO) ? env.SP_GITHUB_REPO : DEFAULT_REPO;
  const issue = issueOf(id, record);
  const post = (body) => fetchFn(`https://api.github.com/repos/${repo}/issues`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'stronghold-bug-report', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return post(issue)
    // a token that may not set labels: file it without the label
    .then((res) => (res.status === 422 || res.status === 403 ? post({ title: issue.title, body: issue.body }) : res))
    .then(async (res) => {
      if (!res.ok) { log?.error?.(`[bug-report] ${id} GitHub issue failed: HTTP ${res.status}`); return null; }
      const j = await res.json().catch(() => null);
      log?.info?.(`[bug-report] ${id} filed as ${j?.html_url ?? '?'}`);
      return j?.html_url ?? null;
    })
    .catch((e) => { log?.error?.(`[bug-report] ${id} GitHub issue failed: ${e?.message || e}`); return null; });
}

/** Tests only: file with injected env / fetch / clock. */
export const _fileIssue = fileIssue;
export function _resetIssueLimit() { issueTimes = []; }

// server/bugReports.js — 인게임 버그 제보 (bug.report): the player's text, the page's recent console lines and a context
// snapshot, written as one JSON file per report and announced in the server log.
//
// Where: SP_REPORT_DIR, else <cwd>/.reports. A production game container is replaced on every release, so its deploy
// mounts a host directory there (deploy/ec2/rolling-update.sh: $root/reports → /reports). Every report is also logged
// (`[bug-report] <id> …`), so `docker logs` of the release still shows it without the mount.
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
    return id;
  } catch (e) {
    log?.error?.(`[bug-report] ${id} could not be written to ${dir}: ${e?.code || e?.message || e}`);
    // the content goes to the log instead (bounded), so nothing is lost when the directory is not writable
    log?.warn?.(`[bug-report] ${id} body ${JSON.stringify(full).slice(0, 20000)}`);
    return id;
  }
}

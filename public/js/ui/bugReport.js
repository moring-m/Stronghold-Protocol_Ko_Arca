// ui/bugReport.js — 인게임 버그 제보: the in-match button (screens/game.js, next to 设置) opens a dialog where the player
// describes the problem; it is sent as `bug.report` with the page's recent console warnings / errors (installLogCapture,
// public/js/logCapture.js, installed first thing by main.js) and a small context (version, phase, round, room, content set, screen), and stored by the
// server (server/bugReports.js). Nothing is sent without the player pressing 제보.

import { useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, Icon } from './components.js';
import { toast } from './toasts.js';
import { net } from '../net.js';
import { store } from '../store.js';
import { APP_VERSION } from '../../../shared/constants.js';

import { capturedLogs } from '../logCapture.js';

/** What the report says about the page besides the text (bounded: the server refuses more than 8000 characters). */
export function reportContext(s = store.get(), g = globalThis) {
  const pub = s?.match?.public || null;
  const content = (() => { try { return g.__SP_CONTENT__?.state?.() || null; } catch { return null; } })();
  return {
    app: APP_VERSION,
    release: g.__SP_RELEASE || null,
    path: g.location ? g.location.pathname + g.location.search : null,
    ua: g.navigator?.userAgent?.slice(0, 300) || null,
    screen: g.innerWidth ? `${g.innerWidth}x${g.innerHeight}@${g.devicePixelRatio || 1}` : null,
    lang: g.document?.documentElement?.lang || null,
    me: s?.me?.playerId ?? null,
    room: s?.room ? { code: s.room.code ?? null, version: s.room.version ?? null, mode: s.room.mode ?? null } : null,
    match: pub ? { phase: pub.phase ?? null, round: pub.round ?? null, stageId: pub.stageId ?? null, spectator: !!s?.match?.spectator } : null,
    content: content ? { cs: content.cs ? String(content.cs).slice(0, 16) : null, kind: content.kind ?? null, version: content.version ?? null, status: content.status ?? null, error: content.error ?? null } : null,
  };
}

/** The dialog. `onClose` closes it. */
export function BugReportModal({ open, onClose }) {
  const [text, setText] = useState('');
  const [withLogs, setWithLogs] = useState(true);
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    try {
      const res = await net.request('bug.report', { text: body.slice(0, 4000), ...(withLogs ? { logs: capturedLogs() } : {}), ctx: reportContext() });
      toast(`제보가 접수되었습니다${res?.id ? ` (${res.id})` : ''}. 감사합니다.`, 'success');
      setText('');
      onClose?.();
    } catch (e) {
      toast(e?.code === 'RATE' ? '잠시 후 다시 제보해 주세요.' : '제보를 보내지 못했습니다. 연결을 확인해 주세요.', 'error');
    } finally { setBusy(false); }
  };
  const count = capturedLogs().length;
  return html`<${Modal} open=${open} title="버그 제보" micro="BUG REPORT" onClose=${onClose} width="34rem"
    actions=${html`<${Button} variant="secondary" onClick=${onClose}>취소<//><${Button} variant="primary" icon="warn" loading=${busy} disabled=${!text.trim()} onClick=${send}>제보<//>`}>
    <div class="bugreport">
      <p class="bugreport__hint">무슨 일이 있었는지, 어떤 오퍼레이터·적·상황이었는지 적어 주세요. 현재 버전·단계·라운드·방 정보가 함께 전송됩니다.</p>
      <textarea class="bugreport__text" data-autofocus maxlength="4000" rows="7" placeholder="예) 3라운드 전투 중 아이린 주변 적이 쓰러져도 SP가 오르지 않음"
        value=${text} onInput=${(e) => setText(e.currentTarget.value)}></textarea>
      <label class="bugreport__logs"><input type="checkbox" checked=${withLogs} onChange=${(e) => setWithLogs(e.currentTarget.checked)} />
        브라우저 로그 함께 보내기 <small>(경고·오류 ${count}줄)</small></label>
    </div>
  <//>`;
}

/** The in-match button (screens/game.js). */
export function BugReportButton({ class: cls = 'gm__gear' }) {
  const [open, setOpen] = useState(false);
  return [
    html`<button type="button" class=${`${cls} gm__bug`} aria-label="버그 제보" title="버그 제보" onClick=${() => setOpen(true)}><${Icon} name="warn" /></button>`,
    open ? html`<${BugReportModal} open=${true} onClose=${() => setOpen(false)} />` : null,
  ];
}

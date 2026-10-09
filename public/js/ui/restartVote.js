import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, confirmDialog } from './components.js';
import { store, useStore, emptyMatch } from '../store.js';
import { net } from '../net.js';
import { audio } from '../audio.js';
import { toastError } from './toasts.js';

const heard = new Set();
net.on('room.restartVote', msg => {
  const key = `${store.get().room?.code}:${msg.matchNo}:${msg.vote?.id}`;
  let remembered = false;
  try { remembered = sessionStorage.getItem('sp.restart.heard') === key; } catch {}
  if (msg.vote && !heard.has(key) && !remembered) {
    try { sessionStorage.setItem('sp.restart.heard', key); } catch {}
    heard.add(key);
    if (heard.size > 100) heard.delete(heard.values().next().value);
    // Existing game broadcast cue; use the normal SFX mute and volume channel.
    audio.restartNotification();
  }
  store.set({ restartVote: { ...msg, receivedAt: Date.now() } });
});
net.on('room.state', msg => { if (!msg.inMatch && msg.restartMatchNo === msg.matchNo) store.set({ match: emptyMatch(), restartVote: null }); });
net.on('room.restartLobby', () => store.set({ match: emptyMatch(), restartVote: null }));
net.on('room.restartOutcome', msg => store.set({ restartOutcome: msg.outcome }));
store.subscribe((s, prev) => {
  if ((!s.room && prev.room) || (s.room?.code !== prev.room?.code) || (s.room?.matchNo !== prev.room?.matchNo))
    store.set({ restartVote: null, restartOutcome: null });
});

export function RestartVoteControls({ requestVisible = true, voteVisible = true, onRequested, label = '리방 투표 요청' }) {
  const frame = useStore(s => s.restartVote), room = useStore(s => s.room);
  const outcome = useStore(s => s.restartOutcome);
  const online = useStore(s => s.connection.status === 'online');
  const phase = useStore(s => s.match.public?.phase);
  const playerId = useStore(s => s.me.playerId);
  const [now, setNow] = useState(Date.now()), [busy, setBusy] = useState(false);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 500); return () => clearInterval(t); }, []);
  const eligible = room?.seats?.some(s => s && s.playerId === playerId && !s.left && !s.isBot);
  if (!room?.inMatch || !eligible || ['INFO_CHECK','LOBBY'].includes(phase)) return null;
  const vote = frame?.vote;
  const offset = (frame?.serverNow || now) - (frame?.receivedAt || now);
  const serverNow = now + offset;
  const wait = Math.max(0, Math.ceil(((frame?.nextRequestAt || 0) - serverNow) / 1000));
  const request = async () => {
    if (!await confirmDialog({ title: '리방 투표 요청', text: '전원 동의하면 현재 시뮬레이션을 중단하고 같은 방 대기실로 이동합니다. 방 전체 120초, 개인 180초 간격이며 개인당 시뮬레이션당 2회 요청할 수 있습니다.', okText: '투표 요청', cancelText: '취소' })) return;
    setBusy(true);
    try { await net.request('room.requestRestart', { matchNo: room.matchNo }); onRequested?.(); }
    catch (e) { toastError(e); } finally { setBusy(false); }
  };
  const answer = async agree => {
    setBusy(true);
    try { await net.request('room.answerRestart', { matchNo: room.matchNo, voteId: vote.id, agree }); }
    catch (e) { toastError(e); } finally { setBusy(false); }
  };
  return html`<div class="restart-controls">
    ${requestVisible ? html`<${Button} variant="secondary" disabled=${busy || !online || !!vote || wait > 0 || frame?.remaining === 0} onClick=${request}>
      ${vote ? '리방 투표 진행 중' : wait ? `리방 요청 · ${wait}초 후` : frame?.remaining === 0 ? '리방 요청 횟수 소진' : label}
    <//>` : null}
    ${voteVisible && vote ? html`<section class="restart-vote" aria-label="익명 리방 투표" aria-live="polite">
      <strong>익명 리방 투표</strong><span>${Math.max(0,Math.ceil((vote.deadline-serverNow)/1000))}초</span>
      <div class="restart-vote__slots" aria-label=${`동의 ${vote.yes}명, 반대 ${vote.no}명, 대기 ${vote.total-vote.yes-vote.no}명`}>
        ${Array.from({length:vote.total},(_,i)=>html`<span class=${i<vote.yes?'yes':i<vote.yes+vote.no?'no':'pending'}>${i<vote.yes?'동의':i<vote.yes+vote.no?'반대':'대기'}</span>`)}
      </div><p>전원 동의 시 대기실로 이동 · 현재 시뮬레이션 초기화</p>
      ${vote.answered ? html`<small>투표 완료 · 결과 대기 중</small>` : html`<button disabled=${busy||!online} onClick=${()=>answer(false)}>반대</button><button disabled=${busy||!online} onClick=${()=>answer(true)}>동의</button>`}
    </section>` : voteVisible && outcome ? html`<small role="status">${outcome==='failed'?'전원 동의가 성립하지 않았습니다.':outcome==='cancelled'?'리방 투표가 취소되었습니다.':'대기실로 이동합니다.'}</small>` : null}
  </div>`;
}

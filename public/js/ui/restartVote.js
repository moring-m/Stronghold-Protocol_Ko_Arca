import { t, tc } from '../../../shared/i18n.js';
import { useEffect, useLayoutEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, confirmDialog, Icon } from './components.js';
import { store, useStore, emptyMatch } from '../store.js';
import { net } from '../net.js';
import { audio } from '../audio.js';
import { toast, toastError } from './toasts.js';

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
net.on('room.restartOutcome', msg => {
  store.set({ restartOutcome: msg.outcome });
  toast(msg.outcome==='passed'?t('重新开局投票通过 · 返回房间'):msg.outcome==='failed'?t('重新开局投票未通过。'):t('重新开局投票已取消。'));
});
store.subscribe((s, prev) => {
  if ((!s.room && prev.room) || (s.room?.code !== prev.room?.code) || (s.room?.matchNo !== prev.room?.matchNo))
    store.set({ restartVote: null, restartOutcome: null });
});

export function RestartVoteControls({requestVisible=true,onRequested,label=t('请求重新开局投票')}) {
  const frame=useStore(s=>s.restartVote),room=useStore(s=>s.room),online=useStore(s=>s.connection.status==='online');
  const phase=useStore(s=>s.match.public?.phase),playerId=useStore(s=>s.me.playerId),now=useRestartClock();
  const [busy,setBusy]=useState(false);
  if(!requestVisible||!room?.inMatch||!room.seats?.some(s=>s?.playerId===playerId&&!s.left&&!s.isBot)||['INFO_CHECK','LOBBY'].includes(phase))return null;
  const config=frame?.config||{voteMs:45000,roomCooldownMs:120000,playerCooldownMs:180000,maxRequestsPerMatch:2};
  const wait=Math.max(0,Math.ceil(((frame?.nextRequestAt||0)-now-(frame?.serverNow||now)+(frame?.receivedAt||now))/1000));
  const request=async()=>{
    if(!await confirmDialog({title:t('请求重新开局投票'),text:html`<p class="modal__text" data-i18n-native>${t('投票期间游戏继续进行。{agreement}时结束当前游戏并返回房间。投票 {vote} 秒 · 房间冷却 {room} 秒 · 个人冷却 {player} 秒 · 每局限 {limit} 次',{agreement:t(config.majority?'过半数同意':'全员同意'),vote:config.voteMs/1000,room:config.roomCooldownMs/1000,player:config.playerCooldownMs/1000,limit:config.maxRequestsPerMatch})}</p>`,okText:t('发起投票'),cancelText:t('取消')}))return;
    setBusy(true);try{await net.request('room.requestRestart',{matchNo:room.matchNo});onRequested?.();}catch(e){toastError(e);}finally{setBusy(false);}
  };
  return html`<div class="restart-controls" data-i18n-native><${Button} variant="secondary" disabled=${busy||!online||!!frame?.vote||wait>0||frame?.remaining===0} onClick=${request}>${frame?.vote?t('重新开局投票进行中'):wait?t('重新开局请求 · {seconds} 秒后可用',{seconds:wait}):frame?.remaining===0?t('重新开局请求次数已用完'):label}<//></div>`;
}
function useRestartClock(){const [now,setNow]=useState(Date.now());useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),250);return()=>clearInterval(t);},[]);return now;}
export function RestartVoteOverlay() {
  const frame = useStore(s => s.restartVote), room = useStore(s => s.room);
  const online = useStore(s => s.connection.status === 'online');
  const now = useRestartClock();
  const [selection, setSelection] = useState(null), [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const choice = useRef({ value: null, at: -Infinity, submitting: false });
  const vote = room?.inMatch && frame?.matchNo === room.matchNo ? frame?.vote : null;
  useLayoutEffect(() => {
    choice.current = { value: null, at: -Infinity, submitting: false };
    setSelection(null); setBusy(false); setCollapsed(false);
  }, [vote?.id, room?.code, room?.matchNo]);
  const serverNow = now + (frame?.serverNow ?? now) - (frame?.receivedAt ?? now);
  const seconds = vote ? Math.max(0, Math.ceil((vote.deadline - serverNow) / 1000)) : 0;
  const answer = async agree => {
    const input = choice.current;
    if (!vote || input.submitting || !online || seconds <= 0) return;
    input.submitting = true; setBusy(true);
    try { await net.request('room.answerRestart', { matchNo: room.matchNo, voteId: vote.id, agree }); }
    catch (e) { toastError(e); } finally { input.submitting = false; setBusy(false); }
  };
  const selectOrConfirm = agree => {
    if (disabled) return;
    const input = choice.current, at = performance.now();
    if (input.value === agree) { if (at - input.at >= 150) void answer(agree); }
    else { input.value = agree; input.at = at; setSelection(agree); }
  };
  const blockRepeat = e => { if (e.repeat && (e.key === 'Enter' || e.key === ' ')) e.preventDefault(); };
  const disabled = busy || !online || !vote?.eligible || vote?.answered || seconds <= 0;
  if (!vote) return null;
  const policy = frame.config?.majority ? t('过半数同意') : t('全员同意');
  const ownStatus = !vote.eligible ? t('正在等待投票参与者') : vote.answered ?
    t('{choice}投票已确认 · 等待结果', { choice: vote.myAnswer === false ? tc('restart-choice', '反对') : tc('restart-choice', '同意') }) : t('尚未投票');
  return html`<aside class=${`restart-overlay-host ${collapsed ? 'is-collapsed' : ''}`} data-i18n-native aria-label=${t('匿名重新开局投票')}
      onKeyDown=${e => e.stopPropagation()} onPointerDown=${e => e.stopPropagation()}>
    <section class=${`modal__box brackets modal__box--gold restart-decision ${collapsed ? 'is-collapsed' : ''}`} aria-labelledby="restart-title">
      <div class="modal__stripe" aria-hidden="true"></div>
      <header class="modal__head">
        <small>TEAM DECISION // ${t('匿名重新开局投票')}</small>
        <div class="restart-decision__heading"><h2 class="modal__title" id="restart-title">${t('重新开局投票')}</h2>
          <span class=${`restart-decision__timer ${seconds <= 5 ? 'is-urgent' : ''}`} role="timer" aria-label=${t('距离投票截止还有 {seconds} 秒', { seconds })}>${t('{seconds} 秒', { seconds })}</span>
          <${Button} variant="ghost" size="sm" icon=${collapsed ? 'plus' : 'minus'} class="restart-decision__toggle"
            aria-expanded=${!collapsed} aria-controls="restart-vote-details" onClick=${() => setCollapsed(v => !v)}>${collapsed ? t('展开投票') : t('收起投票')}<//>
        </div>
        <div class="restart-decision__summary"><span>${t('同意 {yes} / {total} 人 · 未投票 {pending} 人', { yes: vote.yes, total: vote.total, pending: vote.total - vote.yes - vote.no })}</span><span class="restart-decision__own" role="status">${ownStatus}</span></div>
      </header>
      <div class="modal__body" id="restart-vote-details" hidden=${collapsed}>
        <p class="restart-decision__running">${t('游戏继续进行 · 投票不会暂停游戏')}</p>
        <p class="restart-decision__sub">${t('结束当前游戏并返回房间吗？')}</p>
        <p class="restart-decision__counts">${t('{agreement}时重新开局 · 还需 {remaining} 人同意', { agreement: policy, remaining: Math.max(0, (vote.required ?? vote.total) - vote.yes) })}</p>
        ${vote.eligible && !vote.answered ? html`<div class="restart-decision__choices" aria-label=${t('投票选项')}>
          <button type="button" class=${`restart-decision__card ${selection === false ? 'is-selected' : ''}`} aria-pressed=${selection === false} disabled=${disabled} onKeyDown=${blockRepeat} aria-label=${selection === false ? t('反对确认 · 请再点一次') : t('选择反对')} onClick=${() => selectOrConfirm(false)}>
            <${Icon} name="close" /><strong>${tc('restart-choice', '反对')}</strong><span>${t('继续当前游戏。')}</span><small>${busy && selection === false ? t('正在提交投票…') : selection === false ? t('再点一次以确认反对') : t('点击选择')}</small></button>
          <button type="button" class=${`restart-decision__card restart-decision__card--restart ${selection === true ? 'is-selected' : ''}`} aria-pressed=${selection === true} disabled=${disabled} onKeyDown=${blockRepeat} aria-label=${selection === true ? t('同意确认 · 请再点一次') : t('选择同意')} onClick=${() => selectOrConfirm(true)}>
            <${Icon} name="check" /><strong>${tc('restart-choice', '同意')}</strong><span>${t('返回房间。')}</span><small>${busy && selection === true ? t('正在提交投票…') : selection === true ? t('再点一次以确认同意') : t('点击选择')}</small></button>
        </div>` : html`<div class="restart-decision__waiting"><${Icon} name="hourglass" /><strong>${ownStatus}</strong></div>`}
        <footer class="restart-decision__footer">${vote.eligible && !vote.answered ? html`<p>${t('选择后再次点击同一卡片以确认。')}</p>` : null}<p role="status">${!online ? t('连接已断开。重新连接后可查看剩余投票。') : seconds <= 0 ? t('正在等待服务器确认投票结果。') : t('超时视为未通过 · 确认后无法更改')}</p></footer>
      </div>
    </section>
  </aside>`;
}

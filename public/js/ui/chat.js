import {applyFavoriteFaction} from './favorites.js';
import {applyRecruitFaction} from './recruitPresets.js';
import {toast} from './toasts.js';
import { useEffect, useLayoutEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { data, useData } from '../data.js';
import { bondIconUrl } from './assetUrls.js';
import { RestartVoteControls } from './restartVote.js';
import { html } from './components.js';
import { store, useStore, loadPref, savePref } from '../store.js';
import { net } from '../net.js';
import { audio } from '../audio.js';
import { settingsStore, SettingsModal } from './settings.js';
import { toastError } from './toasts.js';
import { CHAT_MAX_LENGTH, CHAT_FACTIONS, chatFaction, normalizeChatText } from '../../../shared/chat.js';

export function ChatPanel({room = false}) {
  useData('assets');
  const m = data.get('assets');
  const messages = useStore((s) => s.chat);
  const online = useStore((s) => s.connection.status === 'online');
  const customFactions = useStore(s => !!(s.room?.inMatch ? s.match.public?.customFactions : s.room?.customFactions));
  const faction = useStore((s) => s.chatFaction);
  const [expanded, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(() => loadPref('chatPreview', true) !== false);
  const open = room || expanded;
  useEffect(() => {
    let lastLiveId = 0;
    const removeHistory = net.on('m.chatHistory', msg => { lastLiveId = msg.messages?.at(-1)?.id || 0; });
    const removeLive = net.on('m.chat', msg => {
      if (!Number.isFinite(msg.id) || msg.id <= lastLiveId) return;
      lastLiveId = msg.id;
      const settings = settingsStore.get();
      if ((msg.kind === 'faction' && !settings.chatFactionNotifications) || msg.playerId === store.get().me.playerId) return;
      audio.chatNotification(settingsStore.get().chatSound);
    });
    return () => { removeHistory(); removeLive(); audio.stopChatNotification(); };
  }, []);
  useLayoutEffect(() => { setOpen(false); setChoosingFaction(false); }, [room]);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [choosingFaction, setChoosingFaction] = useState(false);
  const [readId, setReadId] = useState(0);
  const input = useRef(null);
  const focusOnOpen = useRef(false);
  const list = useRef(null);
  const composing = useRef(false);
  const followLatest = useRef(true);
  const lastId = messages.at(-1)?.id || 0;
  const unread = messages.filter((m) => m.id > readId).length;

  useLayoutEffect(() => {
    if (!messages.length || open) setReadId(lastId);
    if (open && followLatest.current && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [open, messages]);
  useLayoutEffect(() => { if (open) { followLatest.current = true; if (list.current) list.current.scrollTop = list.current.scrollHeight; if (focusOnOpen.current) { input.current?.focus(); focusOnOpen.current = false; } } }, [open]);
  useEffect(() => {
    const onKey = (event) => {
      if (event.key !== 'Enter' || event.defaultPrevented || event.repeat || event.isComposing || event.keyCode === 229 || event.ctrlKey || event.altKey || event.metaKey || event.shiftKey) return;
      const target = event.target;
      if (target?.closest?.('input, textarea, select, button, [contenteditable], [role="dialog"], [role="button"]')) return;
      if (document.querySelector('[role="dialog"], [aria-modal="true"]')) return;
      event.preventDefault();
      focusOnOpen.current = true;
      setOpen(true);
      if (input.current) { input.current.focus(); focusOnOpen.current = false; }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  useEffect(() => {
    document.documentElement.classList.add('has-game-chat');
    return () => document.documentElement.classList.remove('has-game-chat');
  }, []);

  const selectFaction = async (value) => {
    if (sending || !online) return;
    setSending(true);
    try {
      await net.request('g.chatFaction', { faction: value });
      const favorite=applyFavoriteFaction(value);
      const recruit=await applyRecruitFaction(value);
      if(favorite||recruit)toast([favorite&&`선호: ${favorite}`,recruit&&`선발: ${recruit}`].filter(Boolean).join(' · ')+' 적용');
      setChoosingFaction(false);
      input.current?.focus();
    } catch (error) { toastError(error); }
    finally { setSending(false); }
  };

  const send = async (event) => {
    event.preventDefault();
    const value = normalizeChatText(text);
    if (!value || composing.current || sending || !online) return;
    setSending(true);
    try {
      await net.request('g.chat', { text: value });
      setText('');
    } catch (error) { toastError(error); }
    finally { setSending(false); input.current?.focus(); }
  };
  useEffect(() => {
    if (room || !open || settingsOpen) return;
    const dismissOutside = event => {
      if (event.target?.closest?.('.game-chat, .ewheel')) return;
      setOpen(false); setChoosingFaction(false);
    };
    document.addEventListener('pointerdown', dismissOutside, true);
    document.addEventListener('wheel', dismissOutside, { capture: true, passive: true });
    return () => {
      document.removeEventListener('pointerdown', dismissOutside, true);
      document.removeEventListener('wheel', dismissOutside, true);
    };
  }, [open,room,settingsOpen]);

  const keyboard = (event) => {
    event.stopPropagation();
    if (event.key === 'Escape' && !event.isComposing && !event.repeat) {
      if (choosingFaction) setChoosingFaction(false);
      else setOpen(false);
    }
    if (event.key === 'Enter' && (event.repeat || event.isComposing || composing.current || event.keyCode === 229)) event.preventDefault();
  };

  const toggle = html`<button class="game-chat__toggle" type="button" aria-label=${open ? '채팅 닫기' : '채팅 열기'} title=${open ? '채팅 닫기' : '채팅 열기'} aria-expanded=${open} aria-controls="game-chat-panel" onClick=${() => { focusOnOpen.current = false; setOpen(!open); }}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11.5a8 8 0 0 1-8 8H8l-5 3v-6a8 8 0 0 1-1-5 9 9 0 0 1 18 0Z" /><path d="M7 10h8M7 14h5" /></svg>
      ${!open && unread ? html`<span class="game-chat__badge" aria-label=${`읽지 않은 메시지 ${unread}개`}>${unread > 99 ? '99+' : unread}</span>` : null}
    </button>`;
  return [html`<aside class=${room ? 'game-chat game-chat--room' : 'game-chat'} aria-label="게임 채팅" onKeyDown=${keyboard} onPointerDown=${(e) => e.stopPropagation()}>
    <${RestartVoteControls} requestVisible=${false} />
    ${room ? html`<header class="game-chat__room-header"><strong>대기실 채팅</strong></header>` : null}
    ${open ? html`<section class="game-chat__panel" id="game-chat-panel" aria-label="게임 채팅창">
      <header><strong hidden=${room}>게임 채팅</strong><button type="button" class="game-chat__faction-toggle"
        aria-expanded=${choosingFaction} aria-controls="game-chat-factions" disabled=${!online || sending}
        style=${faction ? { color: chatFaction(faction)?.color } : null} onClick=${() => setChoosingFaction(!choosingFaction)}>${faction ? html`<img src=${bondIconUrl(m,chatFaction(faction)?.bondId)} class="game-chat__faction-icon" />${faction}` : '진영 선택'}</button>
        ${!room ? html`<button type="button" class="game-chat__visibility" aria-label=${previewVisible ? '채팅 완전히 숨기기' : '최근 채팅 표시'} title=${previewVisible ? '채팅 완전히 숨기기' : '최근 채팅 표시'} aria-pressed=${!previewVisible} onClick=${() => { const next = !previewVisible; setPreviewVisible(next); savePref('chatPreview', next); if (!next) setOpen(false); }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${previewVisible ? html`<path d="M3 3l18 18"/>` : null}</svg></button>` : null}
        <button type="button" class="game-chat__settings" aria-label="채팅 설정 열기" title="채팅 설정" onClick=${() => setSettingsOpen(true)}>⚙</button>
        <button type="button" class="game-chat__close" aria-label="채팅 닫기" onClick=${() => setOpen(false)}>×</button></header>
      ${choosingFaction ? html`<div id="game-chat-factions" class="game-chat__factions" role="group" aria-label="채팅 진영 선택">
        ${CHAT_FACTIONS.filter(f => f.name !== '우르수스' || customFactions).map((f) => html`<button key=${f.name} type="button" style=${{ '--faction-color': f.color }}
          aria-pressed=${faction === f.name} disabled=${sending} onClick=${() => selectFaction(f.name)}><img src=${bondIconUrl(m,f.bondId)} class="game-chat__faction-icon" />${f.name}</button>`)}
        ${faction ? html`<button type="button" class="game-chat__faction-clear" disabled=${sending || !online} onClick=${() => selectFaction(null)}>진영 선택 취소</button>` : null}
      </div>` : null}
      <div class="game-chat__messages" ref=${list} onScroll=${e => { const el=e.currentTarget; followLatest.current=el.scrollHeight-el.clientHeight-el.scrollTop <= 24; }} role="log" aria-live="polite" aria-relevant="additions" data-i18n-skip>
        ${!messages.length ? html`<p class="game-chat__empty">같은 방의 참가자에게 메시지를 보내세요.</p>` : messages.map((m) => html`<p key=${m.id} class=${m.playerId === store.get().me.playerId ? 'is-own' : ''}><strong>${m.name}${m.spectator ? html`<span class="game-chat__spectator">(관전자)</span>` : null}${chatFaction(m.faction) ? html`<span class="game-chat__faction" style=${{ color: chatFaction(m.faction).color }}>(${m.faction})</span>` : null}</strong><span>${m.text}</span></p>`)}
      </div>
      <form onSubmit=${send}>
        <input ref=${input} type="text" aria-label="채팅 메시지" placeholder=${!online ? '연결이 끊겼습니다' : '메시지 입력…'}
          value=${text} maxLength=${CHAT_MAX_LENGTH} disabled=${!online} autoComplete="off"
          onInput=${(e) => setText(e.currentTarget.value)} onCompositionStart=${() => { composing.current = true; }} onCompositionEnd=${() => { composing.current = false; }} />
        <button type="submit" disabled=${sending || !online || !normalizeChatText(text)}>전송</button>
      </form>
    </section>` : previewVisible && messages.length ? html`<div class="game-chat__preview" aria-label="최근 채팅" data-i18n-skip>
      ${messages.slice(-3).map((m, i, recent) => html`<p key=${m.id} style=${{opacity: [1, .6, .25][recent.length - 1 - i]}}>
        <strong>${m.name}${m.spectator ? html`<span class="game-chat__spectator">(관전자)</span>` : null}${chatFaction(m.faction) ? html`<span class="game-chat__faction" style=${{color:chatFaction(m.faction).color}}>(${m.faction})</span>` : null}</strong><span>${m.text}</span>
      </p>`)}
    </div>` : null}
    ${!room ? toggle : null}
  </aside>`, html`<${SettingsModal} open=${settingsOpen} onClose=${() => setSettingsOpen(false)} />`];
}

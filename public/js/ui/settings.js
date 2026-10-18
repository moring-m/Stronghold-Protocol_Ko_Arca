const cx = (...parts) => parts.flat().filter(Boolean).join(' ');
import { confirmDialog } from "./components.js";
import { isPersonalCosmetic } from "../content.js";
import { resolveThemeVars } from "../../../shared/plugins/theme.js";
import { themeVarsOf } from "../../../shared/plugins/theme.js";
import { hasAnySkinChoices } from "./skins.js";
import { askPersistStorage } from "../assetCache.js";
import { importSupport } from "../assetCache.js";
import { storagePersisted } from "../assetCache.js";
import { assetImport } from "../assetPack.js";
import { pruneImportedAssets } from "../assetPack.js";
import { ResourceRedownloadButton } from './resourceRedownload.js';
import {officialFxDownloaded,voiceDownloaded} from '../../../shared/resourceSelection.js';
import {useEffect} from "../../vendor/hooks.module.js";
import {store} from "../store.js";
import {tc} from "../../../shared/i18n.js";
import {catalog} from "../content.js";
import {loadCatalog} from "../content.js";
import {cosmeticPlugins} from "../content.js";
import {installedCount} from "../content.js";
import {personal} from "../content.js";
import {personalSet} from "../content.js";
import {pluginName} from "../content.js";
import {setPersonalPlugin} from "../content.js";
import {setUiPlugin} from "./uiPlugins.js";
import {uiPluginEntries} from "./uiPlugins.js";
import {uiPlugins} from "./uiPlugins.js";
import {UI_LIMITS} from "../../../shared/plugins/ui.js";
import {toast} from "./toasts.js";
import {describeError} from "./toasts.js";
import {pluginMicro} from "./pluginTag.js";
import { HOTKEY_ACTIONS, hotkeyLabel, captureHotkey, rebindHotkey, DEFAULT_HOTKEYS } from './gameLogic/shortcuts.js';
import { RestartVoteControls } from './restartVote.js';


import { t, N_ } from '../../../shared/i18n.js';
// Player settings (BGM/SFX/voice volume, mute, damage numbers, render quality): a tiny observable store
// persisted in localStorage (`sp.pref.settings`), applied to the audio manager on every change, plus
// the settings modal.

import { GIcon } from './gameComponents.js';
import { useLayoutEffect, useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, Icon, MicroLabel } from './components.js';
import { createStore, useStore, loadPref, savePref } from '../store.js';
import { sanitizeSettings, migrateSavedSettings, TEXT_SIZES } from './gameLogic.js';
import { audio } from '../audio.js';
import { CHAT_NOTIFICATION_SOUNDS, defaultChatCooldown } from '../chatNotificationSounds.js';
import { openGuide } from './guide.js';
import { detectFeatures } from './device.js';

/** Settings store: { bgm, sfx, voice, muted, damageNumbers, quality }. */
export const settingsStore = createStore(migrateSavedSettings(loadPref('settings', null)));

/**
 * 设置 →「文字大小」: put the step on <html data-text> — css/theme.css turns it into the text root `--t`
 * (`:root[data-text="md"] { --t: … }`), which every readable font-size reads; no layout value does. The attribute
 * (not an inline style) keeps the default in the stylesheet: without it — no JavaScript, an old saved profile, a
 * value a future version dropped — the page is the design's own sizes. Values outside TEXT_SIZES fall back to 小.
 * @param {'sm'|'md'|'lg'|'xl'} v
 */
export function applyTextSize(v) {
  const el = globalThis.document?.documentElement;
  if (el) el.dataset.text = TEXT_SIZES.includes(v) ? v : 'sm';
}

settingsStore.subscribe((s) => {
  savePref('settings', sanitizeSettings(s));
  audio.setVolumes(s);
  audio.setVoiceLang(s.voiceLanguage, s.voiceOverrides);
  applyTextSize(s.textSize);
});
savePref('settings', settingsStore.get());
audio.setVolumes(settingsStore.get());
audio.setVoiceLang(settingsStore.get().voiceLanguage, settingsStore.get().voiceOverrides);
// before the first render (main.js boot renders after its imports ran): the stored step is on screen without a flash
applyTextSize(settingsStore.get().textSize);

/** @param {Partial<ReturnType<typeof sanitizeSettings>>} patch */
export function updateSettings(patch,{skipDownloadPrompt=false}={}) {
  if(patch.officialFx==='full'&&!officialFxDownloaded()){window.dispatchEvent(new CustomEvent('sp-request-official-fx-download'));return;}
  const current = settingsStore.get();
  if(!skipDownloadPrompt){
    const languages=new Set([patch.voiceLanguage,...Object.entries(patch.voiceOverrides||{}).filter(([id,lang])=>lang!==current.voiceOverrides[id]).map(([,lang])=>lang)]);
    for(const language of languages)if(['kr','jp'].includes(language)&&!voiceDownloaded(language))window.dispatchEvent(new CustomEvent('sp-request-voice-download',{detail:{language}}));
  }
  if (patch.chatSound !== undefined) patch = {...patch, chatSoundCustomized: true};
  if (typeof patch.damageNumbers === 'boolean' && patch.damageNumberMode === undefined) patch = {...patch,damageNumberMode:patch.damageNumbers?'sum':'none'};
  const soundChanged = patch.chatSound !== undefined && patch.chatSound !== current.chatSound && patch.chatSound !== 'off';
  settingsStore.set(sanitizeSettings({ ...current, ...patch,
    ...(soundChanged ? {chatCooldown: defaultChatCooldown(patch.chatSound)} : {}) }));
}

/** Preact hook: current settings. */
export const useSettings = () => useStore((s) => s, Object.is, settingsStore);

/**
 * The label of the key a rebindable shortcut has right now ('R', 'Space' …) — the HUD's key hints (shop bar, ready /
 * pause, underframe). Read at render: the game screen re-renders when the settings dialog closes.
 * @param {'buy'|'refresh'|'freeze'|'levelUp'|'retreat'|'sell'|'ready'} action
 */
export const hotkeyLabelOf = (action) => hotkeyLabel(settingsStore.get().keys?.[action]);

function Slider({ label, micro, value, onInput, icon }) {
  const pct = Math.round(value * 100);
  return html`<label class="set-row">
    <span class="set-row__label"><${Icon} name=${icon} />${label}<${MicroLabel}>${micro}<//></span>
    <input class="set-range" type="range" min="0" max="100" step="5" value=${pct} style=${`--pct:${pct}%`}
      onInput=${(e) => onInput(Number(e.currentTarget.value) / 100)} />
    <span class="set-row__val num">${pct}</span>
  </label>`;
}

function Toggle({ label, micro, value, onChange, id }) {
  return html`<div class="set-row">
    <span class="set-row__label">${label}<${MicroLabel}>${micro}<//></span>
    <button id=${id} type="button" aria-label=${label} class=${`set-toggle${value ? ' is-on' : ''}`} role="switch" aria-checked=${value ? 'true' : 'false'}
      onClick=${() => onChange(!value)}><i></i><span data-i18n-ctx="toggle">${value ? '开启' : '关闭'}</span></button>
  </div>`;
}

function Choice({label,value,options,onChange,testId}) {
  return html`<div class="set-row" data-i18n-skip><label class="set-row__label">${label}</label><select aria-label=${label} data-testid=${testId} value=${value} onChange=${e=>onChange(e.currentTarget.value)}>${options.map(([id,text])=>html`<option value=${id}>${text}</option>`)}</select></div>`;
}

/**
 * 外观插件 (see the header): the server's cosmetic plugins of scope `personal`, each with its switch; nothing when there
 * is none. The catalogue is fetched again when the section opens (a plugin dropped in meanwhile shows) — on a server that
 * has plugins only (content.js installedCount: a server without any is never asked for it).
 */
function CosmeticSection() {
  const cat = useStore((s) => s, Object.is, catalog);
  const ids = useStore((s) => s.ids, Object.is, personal);
  const installed = useStore(installedCount);
  const s = useSettings();
  useEffect(() => { if (installed) loadCatalog({ force: true }); }, [installed]);
  const entries = installed ? cosmeticPlugins(cat.plugins, 'personal') : [];
  const list = entries.filter(isPersonalCosmetic);
  // The 显示其他玩家的皮肤 switch is on screen with or without a PERSONAL plugin — an appearance can also come from a
  // set the player is not in (a watched match's cosmetics are the watcher's own layers), and a switch that appears only
  // when the catalogue happens to have loaded would look like a bug. It follows the same GLOBAL rule the 皮肤 section
  // does (ui/skins.js hasAnySkinChoices: at least one operator of the composed manifest has a wear-able skin), so a
  // session with no such appearance draws nothing here — an installation without a cosmetic layer keeps exactly the
  // settings it had before this feature, the switch included (test/ui/plugins.e2e.test.js asserts the section is absent
  // on a server without plugins). The list below is NOT gated: it is where a switched-off plugin is switched back on.
  if (!list.length) {
    if (!hasAnySkinChoices()) return null;
    return html`<section class="set-plugins" aria-labelledby="set-skins-title" data-testid="personal-plugins">
      <div class="set-keys__head"><span class="set-row__label" id="set-skins-title">${t('外观插件')}<${MicroLabel}>COSMETIC PLUGINS<//></span></div>
      <${OtherSkinsRow} value=${s.otherSkins !== false} onSet=${(v) => updateSettings({ otherSkins: v })} />
    </section>`;
  }
  const set = personalSet(ids, entries);
  const applied = new Set(set.order);
  const auto = new Set(set.auto);
  const winners = resolveThemeVars(set.order.map((id) => {
    const p = entries.find((x) => x.id === id);
    return { id, vars: themeVarsOf(p) };
  }));
  const flip = (id, on) => { const r = setPersonalPlugin(id, on); if ('error' in r) toast(describeError(r.error), 'warn'); };
  return html`<section class="set-plugins" aria-labelledby="set-plugins-title" data-testid="personal-plugins">
    <div class="set-keys__head">
      <span class="set-row__label" id="set-plugins-title">${t('外观插件')}<${MicroLabel}>COSMETIC PLUGINS<//></span>
    </div>
    <p class="set-hint">${t('只改变你自己看到的画面和声音，不影响其他博士，也不影响战斗；插件为非官方制作。')}</p>
    <${OtherSkinsRow} value=${s.otherSkins !== false} onSet=${(v) => updateSettings({ otherSkins: v })} />
    ${winners.map((w) => html`<p key=${w.name} class="set-hint set-theme-win">${t('{token} 由「{name}」生效', { token: w.name, name: pluginName(list.find((p) => p.id === w.pluginId) || { id: w.pluginId }) })}</p>`)}
    ${list.map((p) => {
      // on: applied (chosen, or 「自动」: another one needs it) — or chosen but left out now (a conflict): switch it off
      const skipped = set.skipped.includes(p.id);
      const on = applied.has(p.id) || skipped;
      const isAuto = auto.has(p.id);
      return html`<div key=${p.id} class="set-row" data-plugin=${p.id}>
        <span class="set-row__label">${pluginName(p)}${isAuto ? html` <span class="plugrow__badge">${t('自动')}</span>` : null}<${MicroLabel}>${pluginMicro(p)}<//>
          ${skipped ? html`<span class="set-hint is-warn">${t('与其他已开启的插件冲突或缺少所需插件，没有生效')}</span>` : null}</span>
        <button type="button" class=${`set-toggle${on ? ' is-on' : ''}`} role="switch" aria-checked=${on ? 'true' : 'false'} aria-label=${pluginName(p)}
          disabled=${isAuto && !ids.includes(p.id)} onClick=${() => flip(p.id, !on)}><i></i><span>${on ? tc('toggle', '开启') : tc('toggle', '关闭')}</span></button>
      </div>`;
    })}
  </section>`;
}

/**
 * 设置「显示其他玩家的皮肤」 (docs/SKINS.md): whether this browser draws the appearance another player chose
 * (`UnitInfo.skin`, published by the match — `Match.publicView().players[].skins`).
 *
 * Pure client preference, never sent: turning it off makes every OTHER seat's piece draw the operator's own model,
 * 干员调配 its own choice alone. The asymmetry is deliberate and documented — their screen keeps showing their skin, so
 * a co-op's players may see different models for the same piece. On by default: the appearance is what its owner chose
 * it for, and this is the switch for a player who prefers the official model of everyone else.
 * @param {{ value: boolean, onSet: (v: boolean) => void }} props
 */
function OtherSkinsRow({ value, onSet }) {
  return html`<${Toggle} label=${t('显示其他玩家的皮肤')} micro="OTHER SKINS"
    value=${value} onChange=${(v) => onSet(v)} />`;
}

/**
 * 界面插件 (DESIGN §32.8): each loaded ui plugin of scope `personal`, switched on in this browser only
 * (`sp.pref.ui-plugins`). It cannot play the match and it does not change what anyone else sees.
 */
function UiPluginSection() {
  const cat = useStore((s) => s, Object.is, catalog);
  const ids = useStore((s) => s.ids, Object.is, uiPlugins);
  const installed = useStore(installedCount);
  useEffect(() => { if (installed) loadCatalog({ force: true }); }, [installed]);
  const list = installed ? uiPluginEntries(cat.plugins) : [];
  if (!installed || (cat.status !== 'ready' && !list.length && !ids.length)) return null;
  if (!list.length && !ids.length) return null;
  const onIds = new Set(ids);
  const flip = (id, on) => {
    const r = setUiPlugin(id, on);
    if (!r.error) return;
    toast(r.error === 'PLUGIN_LIMIT' ? t('最多同时开启 {n} 个界面插件', { n: UI_LIMITS.maxPlugins }) : describeError(r.error), 'warn');
  };
  return html`<section class="set-plugins" aria-labelledby="set-ui-plugins-title" data-testid="ui-plugins">
    <div class="set-keys__head">
      <span class="set-row__label" id="set-ui-plugins-title">${t('界面插件')}<${MicroLabel}>UI PLUGINS<//></span>
    </div>
    <p class="set-hint">${t('只改变这个浏览器里的界面，不能替你操作对局，也不影响其他博士；插件为非官方制作。')}</p>
    ${!list.length ? html`<p class="set-hint">${t('本服务器没有可开启的界面插件')}</p>` : list.map((p) => {
      const on = onIds.has(p.id);
      return html`<div key=${p.id} class="set-row" data-plugin=${p.id}>
        <span class="set-row__label">${pluginName(p)}<${MicroLabel}>${pluginMicro(p)}<//></span>
        <button type="button" class=${`set-toggle${on ? ' is-on' : ''}`} role="switch" aria-checked=${on ? 'true' : 'false'} aria-label=${pluginName(p)}
          onClick=${() => flip(p.id, !on)}><i></i><span>${on ? tc('toggle', '开启') : tc('toggle', '关闭')}</span></button>
      </div>`;
    })}
  </section>`;
}

/**
 * Settings modal.
 * @param {{ open: boolean, onClose: Function }} props
 */
/**
 * 素材存储: the 导入素材包 dialog asks for persistent storage once, as an import ends (ui/assetImport.js); this button asks
 * again whenever the player wants, and the line under it says what the browser answers now (navigator.storage.persisted).
 * Chrome and Edge decide silently from their own signals, Firefox asks the player; neither answer outlives a manual clear
 * of the site's data. StorageManager exists only in a secure context: on plain http to a LAN IP the line says so and
 * there is no button. Laid out like 问题反馈 below it.
 */
const PERSIST_NOTES = {
  on: N_('已持久保存：存储空间不足时，浏览器不会自动清掉导入的素材。'),
  off: N_('未持久保存：存储空间不足时，浏览器可能清掉导入的素材。'),
  refused: N_('浏览器没有同意。Chrome 和 Edge 会根据本站的使用情况自行决定，常用或安装为应用后更容易同意，可以之后再试。'),
  insecure: N_('需要通过 https 或 localhost 打开本站，才能申请持久保存。'),
  unsupported: N_('这个浏览器不支持持久保存。'),
};
/** The result line of 清理旧版本素材 (msgids: translated when shown). */
const PRUNE_NOTES = {
  done: N_('已清理 {n} 个旧版本文件。'),
  none: N_('没有需要清理的旧版本文件。'),
  failed: N_('读不到服务器的素材清单，没有删除任何文件。'),
};

function StorageSection() {
  const [state, setState] = useState(null);  // a PERSIST_NOTES key, null while the browser is asked
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    const unknown = () => (globalThis.isSecureContext ? 'unsupported' : 'insecure');
    storagePersisted().then((kept) => { if (live) setState(kept === null ? unknown() : kept ? 'on' : 'off'); });
    return () => { live = false; };
  }, []);
  const ask = async () => {
    setBusy(true);
    const kept = await askPersistStorage();
    setBusy(false);
    setState(kept === null ? 'unsupported' : kept ? 'on' : 'refused');
  };
  const askable = state === 'on' || state === 'off' || state === 'refused';
  // 清理旧版本素材: only where an import can exist (a secure context with Cache Storage), never while one runs
  const [importing, setImporting] = useState(() => ['reading', 'importing'].includes(assetImport.get().phase));
  useEffect(() => assetImport.subscribe((s) => setImporting(['reading', 'importing'].includes(s.phase))), []);
  const [pruning, setPruning] = useState(false);
  const [pruned, setPruned] = useState(null); // { kind: 'done' | 'none' | 'failed', n }
  const prune = async () => {
    const ok = await confirmDialog({ title: t('清理旧版本素材'), text: t('删除这台浏览器里、当前服务器版本已经用不到的导入素材；仍在使用的会保留。'), okText: t('清理') });
    if (!ok) return;
    setPruning(true);
    try {
      const r = await pruneImportedAssets();
      setPruned(r.removedFiles > 0 ? { kind: 'done', n: r.removedFiles } : { kind: 'none' });
    } catch {
      setPruned({ kind: 'failed' });
    } finally { setPruning(false); }
  };
  return html`<section class="set-storage" aria-labelledby="set-storage-title" data-testid="storage-section">
    <div class="set-keys__head">
      <span class="set-row__label" id="set-storage-title">${t('素材存储')}<${MicroLabel}>STORAGE<//></span>
      <span class="set-storage__actions">
        ${importSupport().ok ? html`<${Button} variant="ghost" size="sm" icon="refresh" data-testid="storage-prune" disabled=${pruning || importing}
          loading=${pruning} onClick=${prune}>${t('清理旧版本素材')}<//>` : null}
        ${askable ? html`<${Button} variant="ghost" size="sm" icon="shield" data-testid="storage-persist" disabled=${state === 'on' || busy}
          loading=${busy} onClick=${ask}>${state === 'on' ? t('已持久保存') : t('申请持久保存')}<//>` : null}
      </span>
    </div>
    <p class="set-hint">${t('导入的素材包保存在这个浏览器里。手动清除网站数据会删除它们；Safari 约 7 天没打开本站也可能清除。')}</p>
    ${state ? html`<p class=${cx('set-keys__note', state !== 'on' && state !== 'off' && 'is-warn')} role="status" aria-live="polite"
      data-testid="storage-note">${t(PERSIST_NOTES[state])}</p>` : null}
    ${pruned ? html`<p class=${cx('set-keys__note', pruned.kind === 'failed' && 'is-warn')} role="status" aria-live="polite"
      data-testid="storage-prune-note">${t(PRUNE_NOTES[pruned.kind], { n: pruned.n })}</p>` : null}
  </section>`;
}

export function SettingsModal({ open, onClose }) {
  const s = useSettings();
  const [binding,setBinding] = useState(null);
  useLayoutEffect(() => {
    if (!open || !binding) return;
    const onKey = e => {
      const result = captureHotkey(e);
      if (result.kind === 'leave') { setBinding(null); return; }
      e.preventDefault(); e.stopImmediatePropagation();
      if (result.kind === 'cancel') setBinding(null);
      if (result.kind === 'key') {
        updateSettings({keys: rebindHotkey(settingsStore.get().keys, binding, result.code).keys});
        setBinding(null);
      }
    };
    const onPointer = e => { if (!e.target.closest?.('[data-hotkey-binding]')) setBinding(null); };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('pointerdown', onPointer, true);
    return () => { window.removeEventListener('keydown', onKey, true); window.removeEventListener('pointerdown', onPointer, true); };
  }, [open, binding]);
  useLayoutEffect(() => { if (!open) setBinding(null); }, [open]);
  const [category,setCategory] = useState('graphics');
  const [candidateSound, setCandidateSound] = useState(s.chatSound);
  useLayoutEffect(() => { setCandidateSound(s.chatSound); if (!open) audio.stopChatNotification(); }, [open, s.chatSound]);
  const [tested, setTested] = useState(false);
  const [touchUi] = useState(() => detectFeatures().coarse && !detectFeatures().fine);
  return html`<${Modal} open=${open} onClose=${onClose} title="设置" micro="SETTINGS" class="settings-modal" width="7.4rem"
    actions=${html`<${ResourceRedownloadButton} /><${RestartVoteControls} voteVisible=${false} onRequested=${onClose} label="리방 투표" /><${Button} variant="secondary" icon="book" class="set-guide" onClick=${() => openGuide(0)}>玩法说明<//>
      <${Button} variant="primary" icon="check" onClick=${onClose}>完成<//>`}>
    <nav class="set-categories" aria-label="설정 종류" data-i18n-skip>
      ${[['graphics','그래픽'],['audio','소리'],['chat','채팅'],['controls','조작·단축키'],['plugins','플러그인']].map(([id,label])=>html`<button type="button" class=${category===id?'is-on':''} aria-pressed=${category===id} onClick=${()=>setCategory(id)}>${label}</button>`)}
    </nav>
    <div class="set-list">
    <section hidden=${category!=='audio'} class="set-category" data-category="audio">
      <${Slider} label="背景音乐" micro="BGM" icon="play" value=${s.bgm} onInput=${(v) => updateSettings({ bgm: v })} />
      <${Slider} label="오퍼레이터 음성" micro="VOICE" icon="signal" value=${s.voice} onInput=${v=>updateSettings({voice:v})} />
      <div class="set-row" data-i18n-skip><span class="set-row__label">음성 언어<${MicroLabel}>VOICE LANGUAGE<//></span><div class="set-seg" role="radiogroup">${[['kr','한국어'],['jp','日本語']].map(([id,label])=>html`<button type="button" role="radio" aria-checked=${s.voiceLanguage===id} class=${s.voiceLanguage===id?'is-on':''} onClick=${()=>updateSettings({voiceLanguage:id})}>${label}</button>`)}</div></div>
      <${Slider} label="音效" micro="SFX" icon="signal" value=${s.sfx}
        onInput=${(v) => { updateSettings({ sfx: v }); if (!tested) { setTested(true); setTimeout(() => setTested(false), 400); audio.sfx('click'); } }} />
      <${Toggle} label="静音" micro="MUTE" value=${s.muted} onChange=${(v) => updateSettings({ muted: v })} />
    </section><section hidden=${category!=='chat'} class="set-category" data-category="chat">
      <div class="set-row set-row--chat-sound" data-i18n-skip>
        <label class="set-row__label" for="chat-notification-sound">채팅 알림음<${MicroLabel}>CHAT SOUND<//></label>
        <select id="chat-notification-sound" value=${candidateSound} onChange=${e => { audio.stopChatNotification(); setCandidateSound(e.currentTarget.value); }}>
          <option value="off">끄기</option>
          ${CHAT_NOTIFICATION_SOUNDS.map(sound => html`<option key=${sound.id} value=${sound.id}>${sound.label}</option>`)}
        </select>
        <div class="set-chat-actions">
          <${Button} variant="secondary" size="sm" class="set-chat-preview" disabled=${candidateSound === 'off' || s.muted || s.chatVolume === 0}
            onClick=${() => { audio._unlock(); audio.chatNotification(candidateSound, {preview: true}); }}>미리 듣기<//>
          <${Button} variant="primary" size="sm" class="set-chat-apply" disabled=${candidateSound === s.chatSound}
            onClick=${() => { audio.stopChatNotification(); updateSettings({chatSound: candidateSound}); }}>적용<//>
        </div>
      </div>
      <div class="set-row" data-i18n-skip>
        <label class="set-row__label" for="chat-notification-cooldown">알림 대기시간<${MicroLabel}>COOLDOWN<//></label>
        <input id="chat-notification-cooldown" class="set-range" type="range" min="1" max="5" step="1" value=${s.chatCooldown}
          style=${`--pct:${(s.chatCooldown-1)/4*100}%`} onInput=${e => updateSettings({chatCooldown: Number(e.currentTarget.value)})} />
        <span class="set-row__val num">${s.chatCooldown}초</span>
      </div>
      <${Slider} label="채팅 알림음 크기" micro="CHAT VOLUME" icon="signal" value=${s.chatVolume} onInput=${v => updateSettings({chatVolume: v})} />
      <${Toggle} id="chat-faction-notifications" label="진영 선택·취소 알림" micro="FACTION NOTIFICATIONS" value=${s.chatFactionNotifications} onChange=${v => updateSettings({chatFactionNotifications: v})} />
      <p class="set-hint" data-i18n-skip>대기실과 게임에서 다른 참가자의 새 메시지를 알립니다. 후보를 미리 듣고 적용하세요. 알림음을 변경하면 대기시간이 권장값으로 초기화됩니다. 재생 중에는 알림이 겹치지 않습니다.</p>
    </section><section hidden=${category!=='graphics'} class="set-category" data-category="graphics">
      <${Choice} label="맵 품질" value=${s.mapQuality} options=${[['high','높음 · 원본'],['medium','중간 · 원본'],['low','낮음 · 단순 3D'],['minimal','최하 · 경량 2D']]} onChange=${v=>updateSettings({mapQuality:v})} />
      <p class="set-hint" data-i18n-skip>높음·중간은 원본 맵을 사용합니다. 낮음은 장식을 생략한 단순 3D 맵, 최하는 가장 가벼운 기본 2D 맵을 사용합니다. 전투 타일과 배치 규칙은 동일합니다.</p>
      <${Choice} label="렌더링 해상도" value=${s.renderScale} options=${[[.5,'50%'],[.75,'75%'],[1,'100%'],[1.25,'125%'],[1.5,'150%'],[2,'200%']]} onChange=${v=>updateSettings({renderScale:Number(v)})} />
      <${Choice} label="최대 프레임" value=${s.frameLimit} options=${[[30,'30 FPS'],[60,'60 FPS'],[120,'120 FPS']]} onChange=${v=>updateSettings({frameLimit:Number(v)})} />
      <${Choice} label="애니메이션 품질" value=${s.animationQuality} options=${[['high','높음'],['medium','중간'],['low','낮음']]} onChange=${v=>updateSettings({animationQuality:v})} />
      <${Choice} label="공식 전투 이펙트" value=${s.officialFx} options=${[['auto','자동'],['off','끄기'],['lite','간소'],['full','전체']]} onChange=${v=>updateSettings({officialFx:v})} />
      <${Toggle} label="배치 시 카메라 확대" value=${s.deployCameraZoom} onChange=${v=>updateSettings({deployCameraZoom:v})} />
      <${Toggle} label="전투 통계" value=${s.combatMetrics} onChange=${v=>updateSettings({combatMetrics:v})} />
      <${Toggle} label="차지 캐스터 에너지" value=${s.mysticEnergy} onChange=${v=>updateSettings({mysticEnergy:v})} />
      <${Choice} label="이펙트 품질" value=${s.effectsQuality} options=${[['high','높음'],['medium','중간'],['low','낮음']]} onChange=${v=>updateSettings({effectsQuality:v})} />
      <${Toggle} label="그림자" value=${s.shadows} onChange=${v=>updateSettings({shadows:v})} />
      <${Toggle} label="스킬 범위 표시" value=${s.skillRanges} onChange=${v=>updateSettings({skillRanges:v})} />
      <${Toggle} label="유닛 공격 범위 표시" value=${s.unitRanges} onChange=${v=>updateSettings({unitRanges:v})} />
      <${Toggle} label="자동 성능 조절" value=${s.adaptiveQuality} onChange=${v=>updateSettings({adaptiveQuality:v})} />
      <div class="set-row" data-i18n-skip>
        <span class="set-row__label">대미지 표시<${MicroLabel}>DAMAGE NUMBERS<//></span>
        <div id="damage-number-mode" class="set-seg" role="radiogroup" aria-label="대미지 표시">
          ${[['none','표시 안함'],['sum','합산'],['all','모두'],['basic','기본']].map(([id,label])=>html`<button type="button" role="radio" aria-checked=${s.damageNumberMode===id?'true':'false'} class=${s.damageNumberMode===id?'is-on':''} onClick=${()=>updateSettings({damageNumberMode:id})}>${label}</button>`)}
        </div>
      </div>
      <${Toggle} label=${t('官方伤害数字')} micro="OFFICIAL NUMBERS" value=${s.officialDamageNumbers} onChange=${v=>updateSettings({officialDamageNumbers:v})}/>
      <${Toggle} label=${t('弹药数量')} micro="AMMO COUNT" value=${s.ammoCount} onChange=${(v) => updateSettings({ ammoCount: v })} />
      <p class="set-hint">${t('弹药类技能开启时，在弹药条下方显示剩余弹药 / 总弹药数（如 13/14）。官方界面没有这个数字。')}</p>
      <p class="set-hint" data-i18n-skip>합산: 연속 피해를 묶어 표시 · 모두: 타격마다 표시 · 기본: 명일방주의 붉은 대미지 표시 판정(예상 피해의 1.5배 이상)을 적용합니다.</p>
      <${Choice} testId="text-size" label="글자 크기" value=${s.textSize} options=${[['sm','작게'],['md','보통'],['lg','크게'],['xl','아주 크게']]} onChange=${v=>updateSettings({textSize:v})} />
    </section><section hidden=${category!=='controls'} class="set-category" data-category="controls">
      <${Toggle} label="장비 칸 왼쪽 배치" micro="SHOP LAYOUT" value=${s.shopItemLeft} onChange=${v=>updateSettings({shopItemLeft:v})} />
      <p class="set-hint">단축키 버튼을 누른 뒤 사용할 키를 입력하세요. 중복된 키는 서로 교환됩니다. Esc로 취소할 수 있습니다.</p>
      ${HOTKEY_ACTIONS.map(action=>html`<div class="set-row" data-i18n-skip>
        <span class="set-row__label">${({refresh:'상점 새로고침',freeze:'상점 동결',levelUp:'상점 레벨업',buy:'마우스 위치 상품 구매',retreat:'마우스 위치 오퍼레이터 퇴각',sell:'마우스 위치 오퍼레이터 판매',ready:'준비 완료 / 일시정지',collapseShop:'상점 접기 / 펼치기',enemyPreview:'적 미리보기 / 전장으로 돌아가기'})[action]}</span>
        <button type="button" class="btn btn--secondary" data-hotkey-binding=${action} aria-label=${'단축키 변경: '+action} onClick=${()=>setBinding(action)}>
          ${binding===action?'키 입력 대기…':hotkeyLabel(s.keys[action])}</button>
      </div>`)}
      <${Button} variant="secondary" size="sm" onClick=${()=>{updateSettings({keys:DEFAULT_HOTKEYS});setBinding(null);}}>단축키 기본값 복원<//>

    </section><section hidden=${category!=='plugins'} class="set-category" data-category="plugins">
      <${CosmeticSection} /><${UiPluginSection} />
      <p class="set-hint">설치된 외형·UI 플러그인은 이곳에서 개인별로 설정할 수 있습니다.</p>
    </section></div>
  <//>`;
}

/** The same settings entry for title, lobby and waiting room. */
export function SettingsButton({class: cls = ''}) {
  const [open, setOpen] = useState(false);
  return html`<span class=${`settings-entry ${cls}`}><${Button} variant="secondary" size="sm" square=${true} data-testid="settings-btn" aria-label="设置" title="设置" onClick=${() => setOpen(true)}><${GIcon} name="gear" /><//><${SettingsModal} open=${open} onClose=${() => setOpen(false)} /></span>`;
}

if(typeof window!=='undefined'){
 window.addEventListener('sp-resource-selection',e=>updateSettings({voiceLanguage:e.detail.voice,...(e.detail.effects==='simple'?{officialFx:'lite'}:{})},{skipDownloadPrompt:true}));
 window.addEventListener('sp-official-fx-ready',()=>updateSettings({officialFx:'full'}));
}

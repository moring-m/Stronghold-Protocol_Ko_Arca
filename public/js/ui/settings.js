import { RestartVoteControls } from './restartVote.js';


import { t } from '../../../shared/i18n.js';
// Player settings (BGM/SFX/voice volume, mute, damage numbers, render quality): a tiny observable store
// persisted in localStorage (`sp.pref.settings`), applied to the audio manager on every change, plus
// the settings modal.

import { GIcon } from './gameComponents.js';
import { useLayoutEffect, useState } from '../../vendor/hooks.module.js';
import { html, Modal, Button, Icon, MicroLabel } from './components.js';
import { createStore, useStore, loadPref, savePref } from '../store.js';
import { sanitizeSettings, migrateSavedSettings } from './gameLogic.js';
import { audio } from '../audio.js';
import { CHAT_NOTIFICATION_SOUNDS, defaultChatCooldown } from '../chatNotificationSounds.js';
import { openGuide } from './guide.js';
import { detectFeatures } from './device.js';

/** Settings store: { bgm, sfx, voice, muted, damageNumbers, quality }. */
export const settingsStore = createStore(migrateSavedSettings(loadPref('settings', null)));

settingsStore.subscribe((s) => {
  savePref('settings', sanitizeSettings(s));
  audio.setVolumes(s);
  audio.setVoiceLang(s.voiceLang);
});
savePref('settings', settingsStore.get());
audio.setVolumes(settingsStore.get());
audio.setVoiceLang(settingsStore.get().voiceLang);

/** @param {Partial<ReturnType<typeof sanitizeSettings>>} patch */
export function updateSettings(patch) {
  const current = settingsStore.get();
  if (patch.chatSound !== undefined) patch = {...patch, chatSoundCustomized: true};
  if (typeof patch.damageNumbers === 'boolean' && patch.damageNumberMode === undefined) patch = {...patch,damageNumberMode:patch.damageNumbers?'sum':'none'};
  const soundChanged = patch.chatSound !== undefined && patch.chatSound !== current.chatSound && patch.chatSound !== 'off';
  settingsStore.set(sanitizeSettings({ ...current, ...patch,
    ...(soundChanged ? {chatCooldown: defaultChatCooldown(patch.chatSound)} : {}) }));
}

/** Preact hook: current settings. */
export const useSettings = () => useStore((s) => s, Object.is, settingsStore);

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

function Choice({label,value,options,onChange}) {
  return html`<div class="set-row" data-i18n-skip><label class="set-row__label">${label}</label><select aria-label=${label} value=${value} onChange=${e=>onChange(e.currentTarget.value)}>${options.map(([id,text])=>html`<option value=${id}>${text}</option>`)}</select></div>`;
}

/**
 * Settings modal.
 * @param {{ open: boolean, onClose: Function }} props
 */
export function SettingsModal({ open, onClose }) {
  const s = useSettings();
  const [category,setCategory] = useState('graphics');
  const [candidateSound, setCandidateSound] = useState(s.chatSound);
  useLayoutEffect(() => { setCandidateSound(s.chatSound); if (!open) audio.stopChatNotification(); }, [open, s.chatSound]);
  const [tested, setTested] = useState(false);
  const [touchUi] = useState(() => detectFeatures().coarse && !detectFeatures().fine);
  return html`<${Modal} open=${open} onClose=${onClose} title="设置" micro="SETTINGS" width="7.4rem"
    actions=${html`<${RestartVoteControls} voteVisible=${false} onRequested=${onClose} label="리방 투표" /><${Button} variant="secondary" icon="book" class="set-guide" onClick=${() => openGuide(0)}>玩法说明<//>
      <${Button} variant="primary" icon="check" onClick=${onClose}>完成<//>`}>
    <nav class="set-categories" aria-label="설정 종류" data-i18n-skip>
      ${[['graphics','그래픽'],['audio','소리'],['chat','채팅'],['controls','조작·언어']].map(([id,label])=>html`<button type="button" class=${category===id?'is-on':''} aria-pressed=${category===id} onClick=${()=>setCategory(id)}>${label}</button>`)}
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
      <p class="set-hint" data-i18n-skip>합산: 연속 피해를 묶어 표시 · 모두: 타격마다 표시 · 기본: 명일방주의 붉은 대미지 표시 판정(예상 피해의 1.5배 이상)을 적용합니다.</p>
    </section><section hidden=${category!=='controls'} class="set-category" data-category="controls">
      ${touchUi
        ? html`<p class="set-hint">触屏操作：点击单位选中（撤退 / 出售）· 长按单位或卡牌查看详情 · 拖动部署后滑动选择朝向</p>`
        : html`<p class="set-hint">快捷键：<kbd>R</kbd> 刷新 · <kbd>F</kbd> 冻结 · <kbd>D</kbd> 升级 · <kbd>Q</kbd> 撤退选中干员 · <kbd>X</kbd> 出售选中干员 · <kbd>Space</kbd> 准备就绪 · <kbd>Esc</kbd> 关闭弹窗 · 右键查看详情</p>`}

    </section></div>
  <//>`;
}

/** The same settings entry for title, lobby and waiting room. */
export function SettingsButton({class: cls = ''}) {
  const [open, setOpen] = useState(false);
  return html`<span class=${`settings-entry ${cls}`}><${Button} variant="secondary" size="sm" square=${true} aria-label="设置" title="设置" onClick=${() => setOpen(true)}><${GIcon} name="gear" /><//><${SettingsModal} open=${open} onClose=${() => setOpen(false)} /></span>`;
}

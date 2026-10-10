// Local listening preference, shared by roster and DIY details; deliberately absent from room.loadout.
import { html } from './components.js';
import { useSettings, updateSettings } from './settings.js';
import { t } from '../../../shared/i18n.js';

const VOICE_LANG_NAMES = { kr: '한국어', cn: '중국어', jp: '일본어' }; // i18n-ignore

export function OperatorVoice({ charId }) {
  const settings = useSettings();
  if (!charId) return null;
  const value = settings.voiceOverrides?.[charId] || '';
  const change = (lang) => {
    const voiceOverrides = { ...settings.voiceOverrides };
    if (lang) voiceOverrides[charId] = lang;
    else delete voiceOverrides[charId];
    updateSettings({ voiceOverrides });
  };
  return html`<label class="lo-voice" data-voice-char=${charId}>
    <span>${'개별 음성'}</span>
    <span class="lo-select"><select aria-label=${'개별 음성'} value=${value} onChange=${(e) => change(e.currentTarget.value)}>
      <option value="">${'전체 설정 따르기'}</option><option value="kr">${VOICE_LANG_NAMES.kr}</option><option value="cn">${VOICE_LANG_NAMES.cn}</option><option value="jp">${VOICE_LANG_NAMES.jp}</option>
    </select></span>
    <small>${'이 브라우저에 저장됩니다. 없는 음성은 기본 음성으로 재생합니다.'}</small>
  </label>`;
}

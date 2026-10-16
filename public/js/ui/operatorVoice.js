// Local listening preference, shared by roster and DIY details; deliberately absent from room.loadout.
// Korean/Japanese choices remain available while the manifest loads. Missing Korean lines fall back to Japanese.
import { html } from './components.js';
import { useSettings, updateSettings } from './settings.js';
import { t } from '../../../shared/i18n.js';
import { audio } from '../audio.js';
import { data } from '../data.js';
import { VOICE_LANGS } from '../voicePrefs.js';

const VOICE_LANG_NAMES = {jp:'일본어',kr:'한국어'}; // i18n-ignore

/**
 * Korean/Japanese preferences stay selectable even before resources arrive. `saved` is the stored override (`''` / absent = follow the global dub).
 * @param {any} audioManifest manifest `audio` (null when assets have not loaded)
 * @param {string} charId
 * @param {string} [saved]
 * @returns {{ value: string, label: string, unavailable: boolean }[]}
 */
export function operatorVoiceOptions(audioManifest, charId, saved) {
  const options = [{ value: '', label: t('跟随全局'), unavailable: false }];
  for (const lang of VOICE_LANGS) {
    options.push({ value: lang, label: VOICE_LANG_NAMES[lang], unavailable: false });
  }
  return options;
}

export function OperatorVoice({ charId }) {
  const settings = useSettings();
  if (!charId) return null;
  const value = settings.voiceOverrides[charId] || '';
  const options = operatorVoiceOptions(null, charId, value);
  const change = (lang) => {
    const voiceOverrides = { ...settings.voiceOverrides };
    if (lang) voiceOverrides[charId] = lang;
    else delete voiceOverrides[charId];
    updateSettings({ voiceOverrides });
  };
  const preview = async () => {
    // Unlock in the click gesture, before waiting for a cold manifest request.
    audio._unlock();
    await data.load('assets').catch(()=>{});
    audio.previewVoice(charId, value || undefined);
  };
  return html`<label class="lo-voice" data-voice-char=${charId}>
    <span>${t('此干员语音')}</span>
    <span class="lo-select"><select aria-label=${t('此干员语音')} value=${value} onChange=${(e) => change(e.currentTarget.value)}>
      ${options.map((o) => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
    </select></span>
    <button type="button" class="lo-voice__preview" onClick=${preview}>${t('试听')}</button>
    <small>${'이 브라우저에 저장됩니다. 없는 한국어 음성은 일본어로 재생합니다.'}</small>
  </label>`;
}

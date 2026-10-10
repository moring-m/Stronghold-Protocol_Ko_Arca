import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeSettings } from '../../public/js/ui/gameLogic/settings.js';
import { sanitizeVoiceOverrides, voiceLangFor } from '../../public/js/voicePrefs.js';
import { AudioManager, voiceLine } from '../../public/js/audio.js';
const a = 'char_263_skadi', b = 'char_103_angel';
test('old settings migrate to inherit, malformed or prototype entries are discarded', () => {
  assert.deepEqual(sanitizeSettings({ voiceLanguage: 'jp' }).voiceOverrides, {});
  assert.deepEqual(sanitizeVoiceOverrides(Object.assign(Object.create({ [b]: 'jp' }), { [a]: 'jp', bad: 'cn', char_1_no: 'en' })), { [a]: 'jp' });
  for (const raw of [null, [], 1, 'jp']) assert.deepEqual(sanitizeVoiceOverrides(raw), {});
});
test('per-character override survives persistence; deletion restores the current global setting', () => {
  const settings = sanitizeSettings(JSON.parse(JSON.stringify({ voiceLanguage: 'cn', voiceOverrides: { [a]: 'jp', [b]: 'cn' } })));
  const manager = new AudioManager();
  manager.setVoiceLang(settings.voiceLanguage, settings.voiceOverrides);
  assert.equal(voiceLangFor(a, manager.voiceLang, manager.voiceOverrides), 'jp');
  manager.setVoiceLang('jp');
  assert.equal(voiceLangFor(b, manager.voiceLang, manager.voiceOverrides), 'jp');
  delete settings.voiceOverrides[b];
  manager.setVoiceLang('jp', settings.voiceOverrides);
  assert.equal(voiceLangFor(b, manager.voiceLang, manager.voiceOverrides), 'jp');
  assert.equal(voiceLangFor('unknown', 'cn', manager.voiceOverrides), 'kr');
});
test('Chinese preferences migrate away and Korean missing slots fall back only to Japanese', () => {
  const tree = {voice:{cn:{[a]:{select:'/assets/audio/voice/cn/char_263_skadi/cn_001.mp3'}},kr:{[a]:{skill1:'/assets/audio/voice/voice_kr/char_263_skadi/cn_023.mp3'}},jp:{[a]:{select:'/assets/audio/voice/voice/char_263_skadi/cn_001.mp3',skill1:'/assets/audio/voice/voice/char_263_skadi/cn_023.mp3'}}}};
  assert.equal(voiceLine(tree,a,'select','kr').url,'/assets/audio/voice/voice/char_263_skadi/cn_001.mp3');
  assert.equal(voiceLine(tree,a,'skill1','kr').fallback,'/assets/audio/voice/voice/char_263_skadi/cn_023.mp3');
  assert.equal(voiceLine({voice:{cn:tree.voice.cn}},a,'select','kr'),null);
  assert.equal(sanitizeSettings({voiceLanguage:'cn',voiceOverrides:{[a]:'cn'}}).voiceLanguage,'kr');
  assert.deepEqual(sanitizeVoiceOverrides({[a]:'cn'}),{});
});

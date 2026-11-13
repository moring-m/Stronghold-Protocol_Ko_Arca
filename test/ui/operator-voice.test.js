// The Korean fork deliberately exposes only Korean/Japanese voices. Never restore upstream CN/EN/native fallback.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {operatorVoiceOptions} from '../../public/js/ui/operatorVoice.js';
const id='char_102_texas';
const tree={ [id]: {select:'/voice.mp3'} };
test('operator choices remain available before the voice manifest is loaded',()=>{
 const rows=operatorVoiceOptions({voice:tree,voiceJp:tree,voiceKr:tree,voiceEn:tree,voiceNative:tree},id,'');
 assert.deepEqual(rows.map(r=>r.value),['','kr','jp']);
 assert.ok(rows.every(r=>!r.unavailable));
 assert.deepEqual(operatorVoiceOptions({voice:tree,voiceEn:tree,voiceNative:tree},id,'').map(r=>r.value),['','kr','jp']);
 assert.deepEqual(operatorVoiceOptions(null,id,'').map(r=>r.value),['','kr','jp']);
});
test('a saved Korean preference remains selectable with Japanese fallback',()=>{
 const saved=operatorVoiceOptions({voiceJp:tree},id,'kr').find(r=>r.value==='kr');
 assert.equal(saved.unavailable,false);assert.match(saved.label,/한국어/);
});
test('unsupported legacy language overrides never add forbidden dubs',()=>{
 for(const saved of ['cn','en','native'])assert.deepEqual(operatorVoiceOptions({voiceJp:tree,voice:tree,voiceEn:tree,voiceNative:tree},id,saved).map(r=>r.value),['','kr','jp']);
});

// The compact homepage picker covers every voiced charId exactly once, including operators absent from this season.
test('voice roster deduplicates forms and preserves names for the search list', async () => {
  const { voiceRoster } = await import('../../public/js/ui/voiceLibrary.js');
  const roster = voiceRoster(audio, [{ charId: id, name: '德克萨斯' }, { charId: id, name: '德克萨斯' }]);
  assert.deepEqual(roster, [{ charId: id, name: '德克萨斯' }]);
  assert.deepEqual(voiceRoster({}, []), []);
});

test('unselected Chinese is never used as a missing dub or missing slot fallback', async () => {
  const { voiceLine } = await import('../../public/js/audio.js');
  assert.deepEqual(voiceLine(audio, id, 'select', 'en', () => 0, false), { url: '/en.mp3', fallback: null });
  assert.equal(voiceLine(audio, id, 'select', 'kr', () => 0, false), null);
  assert.equal(voiceLine(audio, id, 'select', 'en', () => 0, true).fallback, '/cn.mp3');
});

test('battle playback applies the download preference guard without changing explicit Chinese playback', async t => {
  const { AudioManager } = await import('../../public/js/audio.js');
  const { voiceDownloadStore } = await import('../../public/js/voiceDownloads.js');
  const previous = voiceDownloadStore.get();
  t.after(() => voiceDownloadStore.set(previous));
  voiceDownloadStore.set({ languages: ['en'], operators: {} });
  const manager = Object.create(AudioManager.prototype);
  manager.getManifest = () => ({ audio });
  assert.equal(manager._selectedVoiceLine(id, 'select', 'en').fallback, null);
  assert.equal(manager._selectedVoiceLine(id, 'select', 'kr'), null);
  assert.equal(manager._selectedVoiceLine(id, 'select', 'cn').url, '/cn.mp3');
});

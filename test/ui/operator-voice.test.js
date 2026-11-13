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

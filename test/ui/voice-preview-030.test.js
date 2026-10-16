import {test} from 'node:test';
import assert from 'node:assert/strict';
import {AudioManager} from '../../public/js/audio.js';
for(const lang of ['kr','jp'])test(`preview plays the selected ${lang} nested-bank voice and unlocks on the click`,()=>{
 const a=new AudioManager({getManifest:()=>({audio:{voice:{kr:{char_test:{select:'/kr.mp3'}},jp:{char_test:{select:'/jp.mp3'}}}}})});
 let unlocked=0;const played=[];
 a._unlock=()=>{unlocked++;a.ctx={};a.voiceGain={};};a._stopVoice=()=>{};a._playVoice=(...args)=>played.push(args);
 assert.equal(a.previewVoice('char_test',lang),true);assert.equal(unlocked,1);assert.equal(played[0][0],`/${lang}.mp3`);
});
test('preview falls back to Japanese when an operator has no Korean recording',()=>{
 const a=new AudioManager({getManifest:()=>({audio:{voice:{jp:{char_test:{select:'/jp.mp3'}}}}})});
 a._unlock=()=>{a.ctx={};a.voiceGain={};};a._stopVoice=()=>{};
 let url;a._playVoice=u=>url=u;
 assert.equal(a.previewVoice('char_test','kr'),true);assert.equal(url,'/jp.mp3');
});

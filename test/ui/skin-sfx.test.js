import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {AudioManager} from '../../public/js/audio.js';import {mergeSkinSfx} from '../../tools/build-skin-sfx.mjs';
const assets=JSON.parse(readFileSync('content/production/data/assets.json'));
test('skin SFX resolve via official skin id or model alias, while voice identity remains the base operator',()=>{
 const a=new AudioManager({getManifest:()=>assets});a.ctx={};const played=[];a._play=url=>{played.push(url);};
 a._track({id:1,charId:'char_180_amgoat',skinId:'skin_char_180_amgoat_sanrio_2',kind:'op',side:'ally',skillIndex:1});
 assert.equal(a.units.get(1).def,'char_180_amgoat@sanrio#2');assert.equal(a.units.get(1).voice,'char_180_amgoat');
 assert.equal(a.unit(a.units.get(1).def,'attack',1,1,true),true);assert.ok(played.some(p=>p.includes('firemag_h_sanrio_2.mp3')));
 a._track({id:1,charId:'char_180_amgoat',kind:'op',side:'ally'});assert.equal(a.units.get(1).def,'char_180_amgoat');
});
test('unsupported costumes keep base SFX, and skin overrides inherit unspecified roles/skills',()=>{
 const a=new AudioManager({getManifest:()=>assets});a._track({id:1,charId:'char_180_amgoat',skinId:'not-a-mapped-costume'});assert.equal(a.units.get(1).def,'char_180_amgoat');
 const m=mergeSkinSfx({die:'base-die',skills:{0:'base-0',1:'base-1'},hits:{2:'base-hit'}},{attack:'skin-atk',skills:{1:'skin-1'}});
 assert.equal(m.die,'base-die');assert.deepEqual(m.skills,{0:'base-0',1:'skin-1'});assert.equal(m.hits[2],'base-hit');
});
test('new skin audio URLs have no fragment and are included in the downloadable resource catalog',()=>{
 const supplement=JSON.parse(readFileSync('content/custom/audio/skin-sfx.json'));
 const catalog=JSON.parse(readFileSync('content/production/resources.json'));const files=new Map(catalog.files.map(f=>[f.path,f]));
 for(const f of supplement.files){assert.ok(!f.path.includes('#'));assert.equal(files.get(f.path)?.bytes,f.bytes);assert.match(f.sha256,/^[a-f0-9]{64}$/);}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {skillStartPaths} from '../tools/assets/audio.mjs';
import {readFileSync} from 'node:fs';

test('cast sound prefers the official skill bank and uses only an exact ability bank fallback',()=>{
 const calls=[],audio={bank:key=>{calls.push(key);return key.includes('ON_ABILITY_START')?['ability.mp3']:[];}};
 assert.deepEqual(skillStartPaths(audio,'skchr_test_2',{skillType:'MANUAL',duration:0}),['ability.mp3']);
 assert.deepEqual(calls,['battle.ON_SKILL_START.skchr_test_2','battle.ON_ABILITY_START.skchr_test_2']);
 assert.deepEqual(skillStartPaths({bank:()=>['canonical.mp3']},'s',{skillType:'MANUAL'}),['canonical.mp3']);
});
test('next-attack and passive ability banks do not add a duplicate cast cue',()=>{
 const audio={bank:key=>key.includes('ON_ABILITY_START')?['attack.mp3']:[]};
 for(const skillType of ['AUTO','PASSIVE'])assert.deepEqual(skillStartPaths(audio,'s',{skillType,duration:0}),[]);
 assert.deepEqual(skillStartPaths(audio,'s',{skillType:'AUTO',duration:10}),['attack.mp3']);
});
test('Grain Buds S2 is indexed to the official one-shot cast sound',()=>{
 const a=JSON.parse(readFileSync('data/assets.json'));
 assert.equal(a.audio.sfx.units.char_4122_grabds.skills[1],'/assets/audio/sfx/player/p_skill/p_skill_ctefltpn.mp3');
});
test('regenerating a missing cast repairs null slots, preserves explicit mappings and is idempotent',async()=>{
 const {mkdtemp,mkdir,writeFile,readFile,rm}=await import('node:fs/promises');
 const {tmpdir}=await import('node:os');const {join}=await import('node:path');
 const {buildMissingSfx}=await import('../tools/build-missing-sfx.mjs');
 const root=await mkdtemp(join(tmpdir(),'cast-sfx-'));
 try{
  const dir=join(root,'data');await mkdir(dir);await mkdir(join(root,'.cache/gamedata/excel'),{recursive:true});
  await writeFile(join(root,'.cache/gamedata/excel/audio_data.json'),JSON.stringify({soundFXBanks:[{name:'battle.ON_ABILITY_START.skchr_test_2',sounds:[{asset:'Audio/Sound_Beta_2/Player/cast',weight:1}]}]}));
  await writeFile(join(dir,'chess.json'),JSON.stringify({a:{charId:'char_test',name:'test',skills:[{index:1,skillId:'skchr_test_2',skillType:'MANUAL',duration:0}]}}));
  await writeFile(join(dir,'assets.json'),JSON.stringify({audio:{sfx:{units:{char_test:{skills:{0:'existing.mp3',1:null}}}}}}));
  const result=await buildMissingSfx(root,dir),a=JSON.parse(await readFile(join(dir,'assets.json')));
  assert.equal(a.audio.sfx.units.char_test.skills[0],'existing.mp3');assert.equal(a.audio.sfx.units.char_test.skills[1],'/assets/audio/sfx/player/cast.mp3');assert.equal(result.files.length,1);
  assert.deepEqual((await buildMissingSfx(root,dir)).audit,[]);
 }finally{await rm(root,{recursive:true,force:true});}
});
test('Grain Buds S2 activation event reaches the indexed cast sound once',async()=>{
 const {AudioManager}=await import('../public/js/audio.js');
 const manifest=JSON.parse(readFileSync('data/assets.json'));
 const audio=new AudioManager({getManifest:()=>manifest});audio.ctx={};const played=[];audio._play=url=>played.push(url);
 audio._track({id:1,kind:'op',side:'ally',charId:'char_4122_grabds',skillIndex:1});audio.handleBattleEvents([['skill',1,8]]);
 assert.equal(played.filter(p=>p==='/assets/audio/sfx/player/p_skill/p_skill_ctefltpn.mp3').length,1);
});

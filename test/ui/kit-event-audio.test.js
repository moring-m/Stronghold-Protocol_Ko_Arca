import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';import{AudioManager}from'../../public/js/audio.js';import{bindingKeys}from'../../public/js/render/vfx/skills.js';
const assets=JSON.parse(readFileSync('content/production/data/assets.json'));
test('Santalla impact sound plays once on ground contact, including an empty target tile',()=>{const a=new AudioManager({getManifest:()=>assets});a.ctx={};const played=[];a._play=(url)=>played.push(url);a._track({id:1,charId:'char_341_sntlla',kind:'op',side:'ally'});a.handleBattleEvents([['fx','iceSpike',5,10,{id:1}]]);assert.equal(played.length,0);a.handleBattleEvents([['fx','iceSpikeImpact',5,10,{id:1}]]);assert.deepEqual(played,[assets.audio.sfx.units.char_341_sntlla.fx.iceSpike]);});
test('Santalla controller-projectile fallback preloads its actual falling icicle prefab',()=>{const key='sntlla_skill_02_start_01';assert.deepEqual(bindingKeys({prefabs:{[key]:{}}},'skchr_sntlla_2'),[key]);});
test('Santalla impact effects are placed once on each actually hit target',async()=>{
 const {FxWiring}=await import('../../public/js/render/vfx/wiring.js'),owner={info:{}},target={id:2},played=[];
 const w={idx:{projectiles:{projectile_chr_sntlla_s2:{onHit:['sntlla_attack_hit_02']}}},view:id=>id===1?owner:id===2?target:null,hasOfficialUnit:()=>true,projectileOf:p=>p,playOn:(...args)=>played.push(args)};
 assert.equal(FxWiring.prototype.simFx.call(w,'iceSpikeImpact',6,10,{id:1,targets:[2]}),true);assert.equal(played.length,1);assert.equal(played[0][0],'sntlla_attack_hit_02');assert.equal(played[0][1],target);
});
test('Makoto persona attack and heal sounds follow the form after the instant skill has ended',()=>{
 const a=new AudioManager({getManifest:()=>assets});a.ctx={};const played=[];a._play=url=>played.push(url);a._track({id:1,charId:'char_4217_makoto',kind:'op',side:'ally',skillIndex:0});a._track({id:2,charId:'char_4217_makoto',kind:'op',side:'ally'});a._track({id:3,kind:'enemy',side:'enemy'});
 a.handleBattleEvents([['fx','substitute',5,10,{id:1,form:'makoto_s1'}],['skill',1,0],['atk',1,3,'arts']]);assert.ok(played.includes(assets.audio.sfx.units.char_4217_makoto.forms.makoto_s1.attack));
 played.length=0;a.handleBattleEvents([['atk',1,2,'heal'],['heal',2,100]]);assert.deepEqual(played,[assets.audio.sfx.units.char_4217_makoto.forms.makoto_s1_heal.attack,assets.audio.sfx.units.char_4217_makoto.forms.makoto_s1_heal.hit]);
 a.handleBattleEvents([['fx','swap',5,10,{id:1,form:null}]]);assert.equal(a.units.get(1).form,null);
});
test('Makoto execution and heal events bind existing official prefabs to the actual affected unit',async()=>{
 const{FxWiring}=await import('../../public/js/render/vfx/wiring.js');const owner={info:{charId:'char_4217_makoto'}},target={id:2},played=[];const w={idx:{},view:id=>id===1?owner:id===2?target:null,hasOfficialUnit:()=>true,playOn:(...v)=>played.push(v)};
 for(const[kind,key,extra]of[['makotoExecute','makoto_skill_02_hit_01_finish',{target:2}],['makotoHeal','makoto_skill_03_p2_heal_01',{targets:[2]}],['makotoAllOut','makoto_talent_chance_01',{members:[2]}]]){assert.equal(FxWiring.prototype.simFx.call(w,kind,0,0,{id:1,...extra}),true);assert.equal(played.at(-1)[0],key);assert.equal(played.at(-1)[1],target);}
});

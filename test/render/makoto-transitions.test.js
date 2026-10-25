import{test,before,after}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{FORMS}from'../../shared/animationForms.js';import{installFakePixi,fakeViewCtx}from'./fakepixi.js';import{presetCamera}from'../../public/js/render/projection.js';
const assets=JSON.parse(readFileSync('content/production/data/assets.json'));let fake,SpineActor,UnitView;
before(async()=>{fake=installFakePixi();({SpineActor}=await import('../../public/js/render/spine.js'));({UnitView}=await import('../../public/js/render/units.js'));});after(()=>fake.restore());
const forms=FORMS.char_4217_makoto;
function actor(id='char_4217_makoto'){const e=assets.chars[id].spine.front;return new SpineActor({animations:Object.keys(e.animations).map(name=>({name}))},e);}
for(const id of ['char_4217_makoto','skin_char_4217_makoto_p3r_1'])test(`${id}: all-out End is a one-shot and returns without another SwitchOut`,()=>{
 const a=actor(id),f=forms.makoto_total,played=[],play=a._play.bind(a);a._play=(name,...rest)=>{played.push(name);return play(name,...rest);};
 a.setForm(f.roles,f.change,null,{sequence:f.sequence});assert.equal(a.current,'Skill_AllOutAttack_Loop');a.update(.168);
 assert.equal(a.current,'Skill_AllOutAttack_End');assert.equal(a.spine.state.tracks[0].loop,false);
 a.update(1.42);assert.equal(a.current,'Skill_AllOutAttack_End');a.setForm(null);assert.equal(a.current,'Skill_AllOutAttack_End');
 a.update(.02);assert.equal(a.current,'Idle');assert.equal(a.mode,'base');assert.deepEqual(played,['Skill_AllOutAttack_Loop','Skill_AllOutAttack_End','Idle']);
});
test('S3 persona change has no interim P1 idle and later state events do not restart its end',()=>{
 const a=actor(),f=forms.makoto_change;a.setForm(f.roles,f.change,null,{sequence:f.sequence});a.update(.51);assert.equal(a.current,'Doll_Skill_3_P1toP2_ChangeEnd');a.update(.9);
 a.setForm(forms.makoto_s3b.roles);assert.equal(a.current,'Doll_Skill_3_P1toP2_ChangeEnd');a.update(.1);assert.equal(a.current,'Doll_Skill_3_P2_Loop');
});
test('late or rebuilt form resumes the current authored segment; an expired transition stays idle',()=>{
 const a=actor(),f=forms.makoto_total;a.setForm(f.roles,null,null,{sequence:f.sequence,elapsed:.8});assert.equal(a.current,'Skill_AllOutAttack_End');assert.ok(Math.abs(a.spine.state.tracks[0].trackTime-.633)<1e-8);a.update(.801);assert.equal(a.current,'Idle');
 a.setForm(f.roles,null,null,{sequence:f.sequence,elapsed:2});assert.equal(a.mode,'base');assert.equal(a.current,'Idle');
});
test('UP-facing base/skin swaps to the Front transition and resumes elapsed time after the model load',async()=>{
 for(const id of ['char_4217_makoto','skin_char_4217_makoto_p3r_1']){
  const spine=assets.chars[id].spine,cam=()=>presetCamera('normal',{width:1280,height:720});
  const store={picture:()=>null,image:async()=>null,hasBack:()=>true,spineEntry:(_id,o)=>o?.back?spine.back:spine.front,spine:{acquire:async e=>({animations:Object.keys(e.animations).map(name=>({name}))}),release(){}}};
  const v=new UnitView(fakeViewCtx(fake.P,{assets:store,cam,animRate:()=>1}),{id:1,kind:'op',side:'ally',defId:'chess_custom_recruit_makoto_6_b',charId:'char_4217_makoto',spine:id,dir:'UP',x:5,y:10,maxHp:1000});
  await new Promise(setImmediate);await new Promise(setImmediate);assert.equal(v.entryBack,true);
  v.setForm('makoto_total',{dur:1.6});v._formElapsed=.7;v._syncModel();await new Promise(setImmediate);await new Promise(setImmediate);
  assert.equal(v.entryBack,false);assert.equal(v.actor.current,'Skill_AllOutAttack_End');assert.ok(Math.abs(v.actor.spine.state.tracks[0].trackTime-.533)<1e-8);
  v.setForm(null);assert.equal(v._wantsBack(),false,'do not replace the skeleton in the middle of End');v.actor.update(.91);assert.equal(v._wantsBack(),true);v.destroy();
 }
});

test('all persona entries resume late progress rather than replaying SwitchIn from zero',()=>{
 for(const id of ['char_4217_makoto','skin_char_4217_makoto_p3r_1'])for(const form of ['makoto_s1','makoto_s2','makoto_s3a']){
  const a=actor(id),f=forms[form];a.setForm(f.roles,f.change,null,{sequence:f.sequence,elapsed:.65});
  assert.equal(a.current,f.change);assert.ok(Math.abs(a.spine.state.tracks[0].trackTime-.65)<1e-9);
  a.update(.36);assert.equal(a.current,f.sequence[1]);assert.ok(a.spine.state.tracks[0].trackTime<.02);a.update(1);assert.equal(a.mode,'base');assert.equal(a.current,f.roles.idle);
 }
});
test('Makoto body follows the same A/B sequence as the official attack emitter; cancel preserves the pending variant',async()=>{
 for(const id of ['char_4217_makoto','skin_char_4217_makoto_p3r_1']){
  const spine=assets.chars[id].spine,cam=()=>presetCamera('normal',{width:1280,height:720});
  const store={picture:()=>null,image:async()=>null,hasBack:()=>false,spineEntry:()=>spine.front,spine:{acquire:async e=>({animations:Object.keys(e.animations).map(name=>({name}))}),release(){}}};
  const v=new UnitView(fakeViewCtx(fake.P,{assets:store,cam,animRate:()=>1}),{id:1,kind:'op',side:'ally',defId:'chess_custom_recruit_makoto_6_b',charId:'char_4217_makoto',spine:id,dir:'RIGHT',x:5,y:10,maxHp:1000});
  await new Promise(setImmediate);await new Promise(setImmediate);v.actor.revive();
  for(let n=0;n<4;n++){
   const clip=n%2?'Attack_B':'Attack_A';v.onAttackStart(null,.533,1.2);assert.equal(v.actor.current,clip);
   v.onAttackCancel();v.onAttackStart(null,.533,1.2);assert.equal(v.actor.current,clip);
   v.onAttack(null,n+1,'none');assert.equal(v.actor.current,clip);v.actor.update(1.3);
  }
  assert.ok(v._clipNames().has('Attack_B'));assert.ok(v._clipNames().has('Doll_Skill_3_P1_Attack_B'));
  v.setForm('makoto_s3a',{late:2});v.actor.update(1.1);v.onAttackStart(null,.8,1.8);assert.equal(v.actor.current,'Doll_Skill_3_P1_Attack_A');v.destroy();
 }
});

test('official Makoto emitter follows the visible variant even when enabled after earlier simplified attacks',async()=>{
 const {FxWiring}=await import('../../public/js/render/vfx/wiring.js');
 const em={class:'UberAnimationEffectEmitter',replaceAnims:['Attack_A','Attack_B'],loopType:0};
 const src={id:1,info:{charId:'char_4217_makoto'},actor:{current:'Attack_B'}};
 assert.equal(FxWiring.prototype._rowOk.call({}, {anim:'Attack_B'},em,src,0,0),true);
 assert.equal(FxWiring.prototype._rowOk.call({}, {anim:'Attack_A'},em,src,0,0),false);
});

test('live embedded effects outside sampled impostor bounds bypass the rectangle, including mixed poses',()=>{
 const v={_box:{x0:-50,y0:-100,w:100,h:120,over:new Set()},actor:{spine:{state:{tracks:[]},getLocalBounds:()=>({x:-40,y:-90,width:80,height:100})}}};
 assert.equal(UnitView.prototype._impOver.call(v),false);
 v.actor.spine.getLocalBounds=()=>({x:-120,y:-90,width:200,height:100});assert.equal(UnitView.prototype._impOver.call(v),true);
 v.actor.spine.getLocalBounds=()=>({x:-40,y:-190,width:80,height:200});assert.equal(UnitView.prototype._impOver.call(v),true);
});

test('each persona returns through its authored SwitchOut from frame zero before the all-out animation',()=>{
 for(const id of ['char_4217_makoto','skin_char_4217_makoto_p3r_1'])for(const [phase,clip]of [['s1','Doll_Skill_1_SwitchOut'],['s2','Doll_Skill_2_SwitchOut'],['s3a','Doll_Skill_3_P1_SwitchOut'],['s3b','Doll_Skill_3_P2_SwitchOut']]){
  const a=actor(id),f=forms['makoto_exit_'+phase];a.setForm(f.roles,f.change,null,{sequence:f.sequence});
  assert.equal(a.current,clip);assert.equal(a.spine.state.tracks[0].trackTime,0);a.update(.9);assert.equal(a.current,clip);
  a.update(.1);const total=forms.makoto_total;a.setForm(total.roles,total.change,null,{sequence:total.sequence});assert.equal(a.current,'Skill_AllOutAttack_Loop');
 }
});

for(const id of ['char_4217_makoto','skin_char_4217_makoto_p3r_1'])test(`${id} authoritative body return accepts its first attack before the next render update`,()=>{
 const a=actor(id),f=forms.makoto_total;a.setForm(f.roles,f.change,null,{sequence:f.sequence});a.update(1.57);
 assert.equal(a.mode,'change');a.setForm(null,null,null,{complete:true});
 assert.equal(a.beginAttack(1.2,.533),true);assert.equal(a.mode,'attack');assert.ok(a.current.startsWith('Attack'));
 a.update(.1);assert.equal(a.mode,'attack');
});

test('Makoto background waits for SwitchIn and the S3 second persona follows ChangeEnd',async()=>{
 const {makotoEffectForm}=await import('../../shared/makoto.js');
 for(const form of ['makoto_s1','makoto_s2','makoto_s3a']){
  assert.equal(makotoEffectForm(form,0),'makoto_entering');assert.equal(makotoEffectForm(form,.999),'makoto_entering');assert.equal(makotoEffectForm(form,1),form);
 }
 assert.equal(makotoEffectForm('makoto_change',.49),'makoto_entering');assert.equal(makotoEffectForm('makoto_change',.5),'makoto_s3b');
});

test('Makoto looping background reselects the authored left/right variant after loading and turning',async()=>{
 const {TalentFx}=await import('../../public/js/render/vfx/talentfx.js');const {FxWiring}=await import('../../public/js/render/vfx/wiring.js');
 let def=null;const w={effectKey:k=>k,ofx:{lib:{def:()=>def}},_variant:FxWiring.prototype._variant,_facing:v=>v.dir,pose:v=>({left:v.dir==='LEFT'})};
 const t=new TalentFx(w),e={key:'backdrop_l',at:'owner'},v={info:{charId:'char_4217_makoto'},dir:'RIGHT'};
 const unloaded=t._loopKey(e,v);def={switchable:{right:'backdrop_r',reverse:false}};assert.notEqual(t._loopKey(e,v),unloaded);
 assert.ok(t._loopKey(e,v).endsWith('backdrop_r'));v.dir='LEFT';assert.equal(t._loopKey(e,v),unloaded);
});

test('UP-facing Makoto retains a started body attack across the Front to Back model replacement',async()=>{
 for(const id of ['char_4217_makoto','skin_char_4217_makoto_p3r_1']){
  const spine=assets.chars[id].spine,cam=()=>presetCamera('normal',{width:1280,height:720});
  const store={picture:()=>null,image:async()=>null,hasBack:()=>true,spineEntry:(_id,o)=>o?.back?spine.back:spine.front,spine:{acquire:async e=>({animations:Object.keys(e.animations).map(name=>({name}))}),release(){}}};
  const v=new UnitView(fakeViewCtx(fake.P,{assets:store,cam,animRate:()=>1}),{id:1,kind:'op',side:'ally',charId:'char_4217_makoto',spine:id,dir:'UP',x:5,y:10,maxHp:1000});
  await new Promise(setImmediate);await new Promise(setImmediate);v.setForm('makoto_total',{dur:1.6});v._syncModel();await new Promise(setImmediate);await new Promise(setImmediate);assert.equal(v.entryBack,false);
  v.actor.update(1.6);v.setForm(null,{form:null});v.gameT=5;v.onAttackStart({x:5,y:11},.533,1.2,false,undefined,5);assert.equal(v.actor.mode,'attack');
  const clip=v.actor.current;v._syncModel();v.gameT=5.1;await new Promise(setImmediate);await new Promise(setImmediate);
  assert.equal(v.entryBack,true);assert.equal(v.actor.mode,'attack');assert.equal(v.actor.current,clip);assert.ok(Math.abs(v.actor.spine.state.tracks[0].trackTime-.1)<1e-8);v.destroy();
 }
});

test('default-speed persona attack starts at the protected transition boundary without delaying the body behind its trail',async()=>{
 for(const id of ['char_4217_makoto','skin_char_4217_makoto_p3r_1']){
  const spine=assets.chars[id].spine;
  const store={picture:()=>null,image:async()=>null,hasBack:()=>false,spineEntry:()=>spine.front,spine:{acquire:async e=>({animations:Object.keys(e.animations).map(name=>({name}))}),release(){}}};
  const v=new UnitView(fakeViewCtx(fake.P,{assets:store,cam:()=>presetCamera('normal',{width:1280,height:720}),animRate:()=>1}),{id:1,kind:'op',side:'ally',charId:'char_4217_makoto',spine:id,dir:'UP',x:5,y:10,maxHp:1000});
  await new Promise(setImmediate);await new Promise(setImmediate);v.actor.revive();
  v.setForm('makoto_s3a',{late:1.99});assert.equal(v.actor.mode,'change');
  const lead=.4904214559386973,interval=1.103448275862069;
  v.onAttackStart(null,lead,interval);assert.equal(v.actor.mode,'attack');assert.equal(v.actor.current,'Doll_Skill_3_P1_Attack_A');assert.equal(v.actor.spine.state.tracks[0].trackTime,0);
  v.actor.update(lead);const track=v.actor.spine.state.tracks[0],time=track.trackTime;
  v.onAttack(null,1,'none');assert.equal(v.actor.spine.state.tracks[0],track);assert.equal(track.trackTime,time,'strike must not restart a delayed whole clip');
  v.actor.update(interval);v.onAttackStart(null,lead,interval);assert.equal(v.actor.current,'Doll_Skill_3_P1_Attack_B');v.destroy();
 }
});

test('a delayed Makoto model resumes past its strike, but cancelled or expired swings stay finished',()=>{
 const a=actor('skin_char_4217_makoto_p3r_1');a.revive();
 const v={info:{charId:'char_4217_makoto'},actor:a,form:null,flags:0,gameT:5.7,_prepareMakotoAttackActor:()=>{},_makotoAttackPlayback:{at:5,lead:.533,interval:1.2,clip:'Attack_A',form:null,struck:true}};
 assert.equal(UnitView.prototype._resumeMakotoAttack.call(v),true);assert.ok(Math.abs(a.spine.state.tracks[0].trackTime-.7)<1e-8);assert.equal(a.wound,false);
 a.update(2);v.gameT=7;assert.equal(UnitView.prototype._resumeMakotoAttack.call(v),false);assert.equal(a.mode,'base');
 v.gameT=5.1;v._makotoAttackPlayback=null;assert.equal(UnitView.prototype._resumeMakotoAttack.call(v),false);assert.equal(a.mode,'base');
});
test('Makoto base and skin stun enter once, hold the pose and recover in every persona',async()=>{
 for(const id of ['char_4217_makoto','skin_char_4217_makoto_p3r_1']){
  const spine=assets.chars[id].spine,store={picture:()=>null,image:async()=>null,hasBack:()=>false,spineEntry:()=>spine.front,spine:{acquire:async e=>({animations:Object.keys(e.animations).map(name=>({name}))}),release(){}}};
  const v=new UnitView(fakeViewCtx(fake.P,{assets:store}),{id:1,kind:'op',side:'ally',charId:'char_4217_makoto',spine:id,x:5,y:10,maxHp:1000});
  await new Promise(setImmediate);await new Promise(setImmediate);
  const a=v.actor;assert.equal(a.holdStunPose,true);
  for(const name of [null,'makoto_s1','makoto_s2','makoto_s3a','makoto_s3b']){
   a.setBase('idle');a.setForm(name?forms[name].roles:null);a.setBase('stun');
   const track=a.spine.state.tracks[0];assert.match(a.current,/Stun/);assert.equal(track.loop,false);
   for(let i=0;i<120;i++){a.setBase('stun');a.update(1/30);}
   assert.equal(a.spine.state.tracks[0],track);assert.equal(a.mode,'stun');
   a.setBase('idle');assert.equal(a.mode,'base');assert.doesNotMatch(a.current,/Stun/);
  }
  v.destroy();
 }
});

test('UP-facing personas use their authored Back attack after Front-only entry finishes',async()=>{
 for(const id of ['char_4217_makoto','skin_char_4217_makoto_p3r_1'])for(const form of ['makoto_s1','makoto_s2','makoto_s3a']){
  const spine=assets.chars[id].spine,store={picture:()=>null,image:async()=>null,hasBack:()=>true,spineEntry:(_id,o)=>o?.back?spine.back:spine.front,spine:{acquire:async e=>({animations:Object.keys(e.animations).map(name=>({name}))}),release(){}}};
  const v=new UnitView(fakeViewCtx(fake.P,{assets:store,animRate:()=>1}),{id:1,kind:'op',side:'ally',charId:'char_4217_makoto',spine:id,dir:'UP',x:5,y:10,maxHp:1000});
  await new Promise(setImmediate);await new Promise(setImmediate);assert.equal(v.entryBack,true);
  v.setForm(form);v._syncModel();await new Promise(setImmediate);await new Promise(setImmediate);
  assert.equal(v.entryBack,false,'entry clips exist only on Front');
  v.actor.update(2.01);v._formElapsed=2.01;v.gameT=5;
  if(form!=='makoto_s2')v.onAttackStart({x:5,y:11},.5,1.8,false,undefined,5);
  v._syncModel();v.gameT=5.1;await new Promise(setImmediate);await new Promise(setImmediate);
  assert.equal(v.entryBack,true,`${id} ${form} must stop requiring Front-only entry clips after entry`);
  if(form!=='makoto_s2'){assert.match(v.actor.current,/Doll_Skill_(?:1|3_P1)_Attack/);assert.equal(v.actor.mode,'attack');assert.ok(v.actor.spine.state.tracks[0].trackTime>0);}
  else assert.equal(v.actor.current,'Doll_Skill_2_Loop');
  v.destroy();
 }
});

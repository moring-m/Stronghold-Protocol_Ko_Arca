import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {installFakePixi,fakeViewCtx} from './fakepixi.js';
import {UF} from '../../shared/constants.js';
let fake,UnitView;
before(async()=>{fake=installFakePixi();({UnitView}=await import('../../public/js/render/units.js'));});after(()=>fake.restore());
test('skin model resolves substitute roles through operator identity',()=>{
 const ctx=fakeViewCtx(fake.P);const v=new UnitView(ctx,{id:1,kind:'op',side:'ally',spine:'skin_char_1023_ghost2_test',charId:'char_1023_ghost2',maxHp:100});
 const calls=[];v.imp={dirty:false};v.actor={setForm(...args){calls.push(args);},dur(){return 1;}};
 v.setForm('doll',{dur:21});assert.equal(v.form,'doll');assert.equal(v.imp.dirty,true,'a cached idle portrait must redraw as the substitute');assert.equal(calls[0][0].idle,'Idle_B');assert.equal(calls[0][1],'Start_B');v.setForm(null);assert.equal(calls[1][1],'Start_2');
});
test('skill event is retained for a model loaded before the next snapshot',()=>{
 const v=new UnitView(fakeViewCtx(fake.P),{id:1,kind:'op',side:'ally',maxHp:100});v.imp={dirty:false};v.setSkill(true);assert.equal(v.imp.dirty,true,'the activation cannot stay on a cached idle frame');assert.ok(v.flags&UF.SKILL);v.setSkill(false);assert.ok(!(v.flags&UF.SKILL));
});
test('levitated unit uses reduced status height and returns to ground; native flyer retains altitude',()=>{
 const v=new UnitView(fakeViewCtx(fake.P),{id:1,kind:'op',side:'ally',maxHp:100});v.sync({x:5,y:10,hp:100,maxHp:100,flags:UF.FLYING,airHeight:.35},0);assert.equal(v.hover,.35);assert.equal(v.airHeight,.35);
 v.sync({x:5,y:10,hp:100,maxHp:100,flags:0},1);assert.equal(v.flying,false);assert.equal(v.airHeight,null);
 const raised=new UnitView({...fakeViewCtx(fake.P),heightAt:()=>2},{id:3,kind:'op',side:'ally',maxHp:100});raised.sync({x:5,y:10,hp:100,maxHp:100,flags:UF.FLYING,airHeight:.35},0);assert.equal(raised.z,2,'a watched levitated operator remains above its raised tile');
 const f=new UnitView(fakeViewCtx(fake.P),{id:2,kind:'enemy',side:'enemy',motion:'FLY',maxHp:100});f.sync({x:5,y:10,hp:100,maxHp:100,flags:UF.FLYING},0);assert.equal(f.hover,1.3);
});
test('Zima S3 activation survives model loading and starts before the first strike',async()=>{
 const {readFileSync}=await import('node:fs');const entry=JSON.parse(readFileSync(new URL('../../.cache/ursus-data/assets.json',import.meta.url))).chars.char_1051_headb2.spine.front;
 let load;const assets={spineEntry:()=>entry,spine:{acquire:()=>new Promise(r=>{load=r;}),release(){}}};
 const v=new UnitView(fakeViewCtx(fake.P,{assets}),{id:1,kind:'op',side:'ally',charId:'char_1051_headb2',spine:'char_1051_headb2',skillIndex:2,maxHp:100});
 v.setSkill(true);assert.ok(load);load({animations:Object.keys(entry.animations).map(name=>({name}))});await new Promise(r=>setImmediate(r));
 assert.ok(v.actor);assert.equal(v.actor.current,'Skill_3');assert.equal(v.actor.spine.state.tracks[0].trackTime,0,'the initial windup is retained');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
import {getDefaultSource} from '../../server/sim/simdata.js';
import {attachAttackTimings,skillImpactTiming,attackClipTiming,IMPACT_CAST_SKILLS} from '../../shared/attackTiming.js';
const ds=getDefaultSource(),assets=JSON.parse(readFileSync(new URL('../../data/assets.json',import.meta.url)));
function battle(id,index){const rec=structuredClone(ds.rawChess(id));rec.garrisonIds=[];const data={chess:{[id]:rec},enemies:{},tokens:{}};attachAttackTimings(data,assets);
 const h=makeBattle({defs:{chess:data.chess,enemies:{dummy:enemyRec({key:'dummy',hp:1e8,speed:0,def:0,res:0})}},units:[{chessId:id,uid:1,row:10,col:4,skillIndex:index}],enemies:[{key:'dummy',pos:[10,5]}],hooks:['damaged','attack'],captureNoisy:true,autoFinish:false,timeLimit:30});h.run(2);const u=h.unit(id);u.def={...u.def,attackTiming:data.chess[id].attackTiming};u.skill.rule='NEVER';u.skill.opReadyAt=-Infinity;u.skill.gainSp(1000,'test');delete u.mem.attackWindup;u.atkCd=2;return {h,u};}
test('Pinecone S1 spends one charge, waits for Skill_1 OnAttack, and holds its full cast even during normal recovery',()=>{
 for(const id of ['chess_char_3_10_a','chess_char_3_10_b']){
 const {h,u}=battle(id,0),timing=skillImpactTiming(u);assert.equal(timing.hit,.467);assert.equal(timing.dur,1.3);
 assert.equal(attackClipTiming({...u,def:u.def,skill:{...u.skill,active:true}}).hit,.467,'selected skill index is read from the definition');
 const count=()=>h.hooksOf('attack').filter(c=>c.attacker===u).length;const before=count(),charges=u.skill.charges,t=h.b.time;
 assert.ok(u.skill.activate());assert.equal(u.skill.charges,charges-1);assert.equal(count(),before);
 h.run(.4);assert.equal(count(),before);assert.ok(u.skill.sp>0,'multi-charge recovery continues during an instant cast');h.run(.12);assert.equal(count(),before+1);
 assert.equal(h.hooksOf('attack').at(-1).isSkill,true);assert.ok(h.b.time>=t+timing.hit);
 h.run(.7);assert.equal(count(),before+1,'no normal attack interrupts the tail');assert.ok(u.skill.sp>0,'multi-charge recovery continues during cast recovery');
 assert.deepEqual(h.b.errors,[]);
 }
});
test('death/redeploy cannot execute an abandoned cast',()=>{
 const {h,u}=battle('chess_char_3_10_a',0);u.skill.activate();h.b.retreat(u);const before=u.stats.attacks;h.run(1);assert.equal(u.stats.attacks,before);assert.ok(!u.mem.skillCastUntil);assert.deepEqual(h.b.errors,[]);
});
test('reviewed independent casts have authored hit metadata; other skill classes get no automatic cast delay',()=>{
 let found=0;
 const rows=JSON.parse(readFileSync(new URL('../../data/chess.json',import.meta.url)));
 for(const [id,rec] of Object.entries(rows)){
 if(rec.isGolden)continue;
 for(const sk of rec.skills||[]){if(!IMPACT_CAST_SKILLS.has(sk.skillId))continue;
 const data={chess:{[id]:structuredClone(rec)},enemies:{},tokens:{}};attachAttackTimings(data,assets);
 const timing=skillImpactTiming({dir:'RIGHT',skill:{id:sk.skillId},def:{skill:{index:sk.index},attackTiming:data.chess[id].attackTiming}});
 assert.ok(timing?.hit>0,`${id}/${sk.skillId}`);found++;
 }
 }
 assert.ok(found>=11);assert.equal(skillImpactTiming({skill:{id:'skchr_blemsh_3'}}),null);assert.equal(skillImpactTiming({skill:{id:'skchr_texas_2'}}),null);
});

test('each reviewed independent cast defers its effect once until its own hit, while cast-start effects remain immediate',()=>{
 const rows=JSON.parse(readFileSync(new URL('../../data/chess.json',import.meta.url)));
 let count=0;
 for(const [id,rec]of Object.entries(rows)){if(rec.isGolden)continue;
  for(const sk of rec.skills||[]){if(!IMPACT_CAST_SKILLS.has(sk.skillId))continue;
   const {h,u}=battle(id,sk.index);u.skill.end('test');delete u.mem.skillCastUntil;
   u.skill.gainSp(1000,'test');const timing=skillImpactTiming(u),start=h.b.time;
   const calls=[];const call=u.skill._call.bind(u.skill);
   u.skill._call=(name,ctx)=>{if(name==='onStart'||name==='onCastStart')calls.push({name,time:h.b.time});return call(name,ctx);};
   assert.ok(u.skill.activate(),`${id}/${sk.skillId}`);
   assert.equal(calls.filter(x=>x.name==='onStart').length,0);
   assert.equal(calls.find(x=>x.name==='onCastStart').time,start);
   h.run(Math.max(0,timing.hit-.04));assert.equal(calls.filter(x=>x.name==='onStart').length,0,sk.skillId);
   h.run(.08);const impacts=calls.filter(x=>x.name==='onStart');
   assert.equal(impacts.length,1,sk.skillId);assert.ok(impacts[0].time+1e-9>=start+timing.hit,sk.skillId);
   assert.deepEqual(h.b.errors,[],sk.skillId);count++;
  }
 }
 console.log(`Timed effect audit: ${count} operator/skill configurations`);
});

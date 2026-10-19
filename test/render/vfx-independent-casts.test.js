// Actual extracted metadata, not invented skill names: the sim's deferred impact must reach the official plan.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {FxWiring} from '../../public/js/render/vfx/wiring.js';
import {castPhase} from '../../public/js/render/vfx/skillfx.js';
import {planFor} from '../../public/js/render/vfx/skills.js';
import {attachAttackTimings,skillImpactTiming,IMPACT_CAST_SKILLS} from '../../shared/attackTiming.js';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
import {getDefaultSource} from '../../server/sim/simdata.js';

const read=p=>JSON.parse(readFileSync(new URL(p,import.meta.url),'utf8'));
const index=process.env.SP_OFFICIAL_FX_INDEX ? JSON.parse(readFileSync(process.env.SP_OFFICIAL_FX_INDEX,'utf8')) : read('../fixtures/fx-independent-casts.json');
const rows=read('../../data/chess.json');
const assets=read('../../data/assets.json');

async function wire(rec,skill,indexOverride=index){
 const spawned=[],views=new Map();
 const ofx={active:true,time:0,tier:'full',timers:[],lib:{index:async()=>indexOverride,has:k=>!!indexOverride.prefabs[k],
  def:k=>indexOverride.prefabs[k]?{isLoop:!!indexOverride.prefabs[k].looping,spawn:indexOverride.prefabs[k].spawn}:null,defs:new Map()},
  spawn(key,place){const h={alive:true,stop(){this.alive=false;},kill(){this.alive=false;}};spawned.push({key,time:ofx.time,place});return h;}};
 const w=new FxWiring(ofx,{record:info=>info.side==='ally'?{...rec,skill}:null,view:id=>views.get(id)});await w.ready();
 const u={id:1,x:4,y:10,z:0,dir:'RIGHT',visFacing:1,alive:true,flags:0,info:{id:1,spine:rec.charId,defId:rec.chessId,side:'ally',kind:'op',skillIndex:skill.index}};
 const t={id:2,x:5,y:10,z:0,alive:true,isEnemy:true,info:{id:2,defId:'dummy',side:'enemy',kind:'enemy'}};
 views.set(1,u);views.set(2,t);
 const frame=(dt=.1)=>{w.sync([...views.values()]);w.tick();ofx.time+=dt;};
 return{w,ofx,u,t,spawned,frame};
}

test('extracted independent cast emitters play at their own phases, once per activation',async()=>{
 let checked=0;
 for(const c of Object.values(rows)){if(c.isGolden||c.optionalRecruit||!index.units[c.charId])continue;
  for(const skill of c.skills||[]){if(!IMPACT_CAST_SKILLS.has(skill.skillId)||!index.skills[skill.skillId])continue;
   const {w,u,spawned,frame}=await wire(c,skill);
   const plan=planFor(index,{info:u.info,rec:{...c,skill}}).plan;
   // Distinct owner keys (a buff may reference the same emitter as the attack).
   const entries=[...new Map([...plan.start,...plan.range,...plan.loop,...plan.attacks.flatMap(a=>[...a.cast,...a.range])].map(e=>{const key=e.slots?.[1]||e.key;return [key,{...e,key}]})).values()];
   w.skill(u,true,{cast:true});
   for(const e of entries)assert.equal(spawned.filter(x=>x.key===e.key).length,castPhase(e)==='start'?1:0,`${skill.skillId}/${e.key} at start`);
   frame();frame();w.skillImpact(u);w.skill(u,false);frame();
   for(const e of entries)assert.equal(spawned.filter(x=>x.key===e.key).length,1,`${skill.skillId}/${e.key} after impact`);
   w.skill(u,true,{cast:true});frame();w.skillImpact(u);w.skill(u,false);frame();
   for(const e of entries)assert.equal(spawned.filter(x=>x.key===e.key).length,2,`${skill.skillId}/${e.key} on recast`);
   checked++;
  }
 }
 assert.ok(checked>=5);
 console.log(`Independent official FX configurations checked: ${checked}`);
});

test('real Leonhardt S2 battle events show the start immediately and the range at the authored impact',async()=>{
 const id='chess_char_4_14_a',rec=structuredClone(getDefaultSource().rawChess(id));rec.garrisonIds=[];
 const defs={chess:{[id]:rec},enemies:{dummy:enemyRec({key:'dummy',hp:1e8,speed:0,def:0,res:0})},tokens:{}};
 attachAttackTimings(defs,assets);
 const h=makeBattle({defs,units:[{chessId:id,uid:1,row:10,col:4,skillIndex:1}],enemies:[{key:'dummy',pos:[10,5]}],autoFinish:false,timeLimit:30,captureNoisy:true});
 h.run(2);const sim=h.unit(id);sim.def={...sim.def,attackTiming:rec.attackTiming};sim.skill.rule='NEVER';sim.skill.opReadyAt=-Infinity;sim.skill.gainSp(1000,'test');sim.atkCd=2;
 const {w,u,t,ofx,spawned}=await wire(rec,rec.skills.find(s=>s.index===1));u.id=u.info.id=sim.id;t.id=t.info.id=h.enemies()[0].id;
 const timing=skillImpactTiming(sim);assert.ok(timing?.hit>0);
 let cursor=h.events.length;const started=h.b.time;
 const flush=()=>{h.eventsOf('skill');ofx.time=h.b.time;for(const e of h.events.slice(cursor)){
  if(e[0]==='skill'&&e[1]===sim.id)w.skill(u,!!e[2],e[3]);
  if(e[0]==='skillImpact'&&e[1]===sim.id)w.skillImpact(u);
  if(e[0]==='dmg'&&e[1]===t.id)w.damage(t,'arts',null,1);
 }cursor=h.events.length;w.sync([u,t]);w.tick();};
 assert.ok(sim.skill.activate());flush();
 assert.equal(spawned.filter(x=>x.key==='lionhd_skill_02_start').length,1);
 assert.equal(spawned.filter(x=>x.key==='lionhd_skill_02_range').length,0);
 for(let i=0;i<40;i++){h.step();flush();}
 const range=spawned.filter(x=>x.key==='lionhd_skill_02_range');assert.equal(range.length,1);
 assert.ok(range[0].time>=started+timing.hit-1e-9);
 assert.ok(range[0].time<=started+timing.hit+1/30+1e-9);
 assert.ok(h.eventsOf('dmg').length>0);assert.deepEqual(h.b.errors,[]);
});

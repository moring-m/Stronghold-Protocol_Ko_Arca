import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeBattle,enemyRec,flatStage} from '../helpers/battleHarness.js';
import {buildBattleSpec,createBattleFromSpec} from '../../server/sim/spec.js';
import {kitOf,KITS} from '../../server/sim/content/index.js';
const data=loadData('content/production/data');
const raw={...data,enemies:{...data.enemies,enemy_note_target:enemyRec({key:'enemy_note_target',hp:1e8,atk:0,def:0,res:0,speed:0})}};
const id=(tier,elite)=>`chess_custom_recruit_oblvns_${tier}_${elite?'b':'a'}`;
let verified=0;
for(const kind of ['normal','unite','boss','hidden'])for(const index of [0,1,2]){
 test(`Sakiko ${kind} S${index+1}: both tiers, promotions, modules, skins and fever deal arts damage`,()=>{
  for(const tier of [5,6])for(const elite of [false,true])for(const moduleId of elite?['none','uniequip_002_oblvns']:['none'])for(const skinId of [null,'skin_char_4182_oblvns_avemujica_1'])for(const fever of [false,true]){
   const label=JSON.stringify({kind,index,tier,elite,moduleId,skinId,fever});
   const h=makeBattle({kind,data:raw,autoFinish:false,captureNoisy:true,units:[{chessId:id(tier,elite),row:10,col:3,skillIndex:index,moduleId,...(skinId?{skinId}:{})}]});
   h.step();const u=h.unit(id(tier,elite));h.run(u.deployRemaining+.05);
   assert.equal(typeof kitOf(u.def,KITS),'function',label);assert.ok(Array.isArray(u.mem.sakikoNotes),label);
   u.skill.rule='NEVER';u.skill.spType='none';u.mem.sakikoNotes=[];
   const target=h.spawn('enemy_note_target',{pos:[u.y,u.x+1.7]});
   const cast=()=>{u.skill.gainSp(1000);assert.equal(u.skill.activate('test'),true,label);};
   if(index===1){cast();assert.equal(u.mem.sakikoOrgan,true,label);}
   if(fever){h.b._recruitFever.value=450;cast();assert.ok(h.b._recruitFever.until>h.b.time,label);}
   else if(index!==1)cast();
   assert.ok(h.runUntil(()=>h.hooksOf('damaged').some(c=>c.source===u&&c.target===target&&c.dmg.type==='arts'&&c.amount>0),8),label);
   const arts=h.hooksOf('damaged').filter(c=>c.source===u&&c.dmg.type==='arts'&&c.amount>0);
   assert.ok(arts.every(c=>c.dmg.tags?.includes('sakiko-note')),label);assert.ok(u.stats.artsDamage>0,label);
   if(index===2)assert.ok(h.hooksOf('damaged').some(c=>c.source===u&&c.dmg.type==='phys'&&c.amount>0),label);
   assert.equal(h.b.errorCount,0,label);verified++;
  }
 });
}
test('Sakiko case matrix exercised 288 distinct loadout/battle/fever combinations',()=>assert.equal(verified,288));
test('Sakiko S1 full-charge auto-cast emits arts notes without a target',()=>{
 for(const tier of [5,6])for(const elite of [false,true]){
  const h=makeBattle({data:raw,autoFinish:false,units:[{chessId:id(tier,elite),row:10,col:3,skillIndex:0}]});h.run(1.5);const u=h.unit(id(tier,elite));u.skill.rule='NEVER';u.skill.spType='none';u.mem.sakikoNotes=[];u.skill.gainSp(1000);h.step();
  assert.equal(u.mem.sakikoNotes.filter(n=>n.type==='arts').length,8);assert.equal(u.skill.charges,1);assert.equal(h.b.errorCount,0);
 }
});
test('Sakiko S2 switches back from organ arts to piano physical damage',()=>{
 const h=makeBattle({data:raw,autoFinish:false,captureNoisy:true,units:[{chessId:id(6,true),row:10,col:3,skillIndex:1}]});h.run(1.5);const u=h.unit(id(6,true));u.skill.rule='NEVER';u.skill.spType='none';h.spawn('enemy_note_target',{pos:[10,4.5]});
 u.skill.gainSp(1000);u.skill.activate('test');assert.equal(u.mem.sakikoOrgan,true);assert.ok(h.runUntil(()=>h.hooksOf('damaged').some(c=>c.source===u&&c.dmg.type==='arts'),5));
 u.skill.gainSp(1000);u.skill.activate('test');assert.equal(u.mem.sakikoOrgan,false);const count=h.hooksOf('damaged').length;assert.ok(h.runUntil(()=>h.hooksOf('damaged').slice(count).some(c=>c.source===u&&c.dmg.type==='phys'),5));assert.equal(h.b.errorCount,0);
});
test('Sakiko notes reacquire a living target after their original target dies',()=>{
 const h=makeBattle({data:raw,autoFinish:false,captureNoisy:true,units:[{chessId:id(6,true),row:10,col:3,skillIndex:0}]});h.run(1.5);const u=h.unit(id(6,true));u.skill.rule='NEVER';u.skill.spType='none';
 const first=h.spawn('enemy_note_target',{pos:[10,4]});u.skill.gainSp(1000);u.skill.activate('test');assert.ok(h.runUntil(()=>u.mem.sakikoNotes.some(n=>n.target===first&&n.type==='arts'),1));h.b.kill(first,null);
 const second=h.spawn('enemy_note_target',{pos:[10,3.8]});assert.ok(h.runUntil(()=>h.hooksOf('damaged').some(c=>c.source===u&&c.target===second&&c.dmg.type==='arts'),5));assert.equal(h.b.errorCount,0);
});

test('serialized client battle specs preserve Sakiko kit, selected skills, modules and arts damage',()=>{
 const data={...raw,stages:{...raw.stages,flat:flatStage()}};
 for(const kind of ['normal','unite','boss','hidden'])for(const index of [0,1,2]){
  const h=makeBattle({kind,data,autoFinish:false,units:[{chessId:id(6,true),row:10,col:3,skillIndex:index,moduleId:'uniequip_002_oblvns',skinId:'skin_char_4182_oblvns_avemujica_1'}]});
  const spec=buildBattleSpec({...h.b.opts,stageId:'flat'}),client=createBattleFromSpec(JSON.parse(JSON.stringify(spec)),data,{quiet:true});
  client.autoFinish=false;while(client.time<2&&!client.finished)client.step();const u=client.allyUnits.find(a=>a.kind==='op');assert.ok(Array.isArray(u.mem.sakikoNotes));assert.equal(u.def.raw.skill.index,index);assert.equal(u.def.raw.module.id,'uniequip_002_oblvns');
  u.skill.rule='NEVER';u.skill.spType='none';client.spawnEnemy('enemy_note_target',{pos:[u.y,u.x+1.5]});u.skill.gainSp(1000);u.skill.activate('test');
  const until=client.time+8;while(client.time<until&&!client.finished&&!(u.stats.artsDamage>0))client.step();assert.ok(u.stats.artsDamage>0,`${kind} S${index+1}`);assert.equal(client.errorCount,0);
 }
});

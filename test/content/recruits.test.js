import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeMatch} from '../match/harness.js';
import {makeBattle,enemyRec,checkInvariants} from '../helpers/battleHarness.js';
import {setGameData} from '../../server/sim/content/support/index.js';
import {drawDisabledBonds} from '../../server/match/pool.js';
import {checkLoadout} from '../../shared/protocol.js';
import {parseStored,sanitizeEntries,setChoice} from '../../public/js/ui/loadoutModel.js';
const data=loadData(new URL('../../.cache/ursus-data/',import.meta.url).pathname),get=id=>data.chess[id];
const id=(key,tier=6,elite=false)=>`chess_custom_recruit_${key}_${tier}_${elite?'b':'a'}`;
const keys=['oblvns','chen3','wisdel','narant','ascln'];
function combat(key,index=0,elite=false,tier=6,extra={}){
 const raw={...data,enemies:{...data.enemies,dummy:enemyRec({key:'dummy',hp:1e7,speed:0.05,atk:100,mass:4})}};
 const h=makeBattle({data:raw,autoFinish:false,captureNoisy:true,units:[{chessId:id(key,tier,elite),row:10,col:3,skillIndex:index}],enemies:[{key:'dummy',time:0,route:{motion:'WALK',start:[10,4],end:[10,2],checkpoints:[]}}],...extra});h.step();h.run(Math.max(0,...h.b.allyUnits.map(u=>u.deployRemaining)));return h;
}
test('optional recruits: all 60 skill variants activate without content errors, no garrison traits',()=>{
 setGameData(data);try{for(const key of keys)for(const tier of [5,6])for(const elite of [false,true])for(const index of [0,1,2]){
  const r=get(id(key,tier,elite));assert.deepEqual(r.garrisonIds,[]);assert.equal(r.optionalRecruit,true);const h=combat(key,index,elite,tier),u=h.unit(r.chessId);
  u.skill.gainSp(1000);if(!u.skill.active)assert.ok(u.skill.activate('test'));h.run(Math.max(10,u.skill.duration+1));assert.equal(h.b.errorCount,0,`${r.name} ${index}`);checkInvariants(h.b);
 }}finally{setGameData(null)}
});
test('server validates per-tier limits, uniqueness and optional-only selection',()=>{
 const entries=Object.fromEntries([id('oblvns',5),id('wisdel',5),id('chen3'),id('ascln')].map(k=>[k,{selected:true}]));assert.ok(checkLoadout(entries,get).ok);
 assert.equal(checkLoadout({...entries,[id('narant',5)]:{selected:true}},get).error,'BAD_TARGET');
 assert.equal(checkLoadout({[id('wisdel',5)]:{selected:true},[id('wisdel')]:{selected:true}},get).error,'BAD_TARGET');
 const ordinary=Object.values(data.chess).find(c=>c.visible&&!c.isGolden&&!c.optionalRecruit);assert.equal(checkLoadout({[ordinary.chessId]:{selected:true}},get).error,'BAD_TARGET');
 assert.equal(parseStored({entries})[id('wisdel',5)].selected,true);assert.equal(sanitizeEntries(entries,get)[id('wisdel',5)].selected,true);
 const base=get(id('wisdel',5));assert.equal(setChoice(entries,base,get(base.goldenId),{skill:0})[base.chessId].selected,true);
});
test('personal selection filters shop, reward and grants, including another player selection',()=>{
 const h=makeMatch({data,mode:'coop',humans:2,fake:true}).start();h.toPrep(1);const a=h.ps('p_0'),b=h.ps('p_1');assert.ok(a.setLoadout({[id('wisdel')]:{selected:true}}));
 assert.equal(a.canRecruit(id('wisdel')),true);assert.equal(b.canRecruit(id('wisdel')),false);assert.equal(a.canRecruit(id('wisdel',5)),false);
 assert.equal(b.acquireChess(id('wisdel'),{fromPool:false}),null);assert.equal(a.pushRewardOffer('test',{ids:[id('wisdel'),id('narant')]}).slots.length,1);assert.equal(b.pushRewardOffer('test',{ids:[id('wisdel')]}),null);
 for(const [cid,e] of h.m.pool.entries)if(cid!==id('wisdel'))e.left=0;
 assert.equal(b._rollChessSlot(),null);a.shop.level=6;assert.equal(a._rollChessSlot()?.id,id('wisdel'));
});
test('Ascalon poison stacks, slows and ticks arts damage; elite module boosts it',()=>{
 setGameData(data);try{const h=combat('ascln',1,true),u=h.unit(id('ascln',6,true)),e=h.enemy();assert.ok(h.runUntil(()=>e.findBuff(`ascln:poison:${u.id}`)?.stacks===3,12));const poison=e.findBuff(`ascln:poison:${u.id}`);assert.ok(poison);assert.equal(poison.stacks,3);assert.ok(e.s.moveSpeed<e.base.moveSpeed||e.s.speed<e.base.speed);assert.ok(h.hooksOf('hit').some(c=>c.dmg.tags?.includes('ascln-poison')))}finally{setGameData(null)}
});
test('Narantuya steals stats up to cap and collects returning boomerangs',()=>{
 setGameData(data);try{const h=combat('narant',2,true),u=h.unit(id('narant',6,true));h.run(40);assert.ok(u.mem.narantLoot.a>0);assert.ok(u.mem.narantLoot.a<=u.def.raw.talents[0].bb['attack@steal_atk_max']);assert.ok(h.eventsOf('atk').length>0);assert.equal(h.b.errorCount,0)}finally{setGameData(null)}
});
test('Ascalon periodic basic damage activates Dormant Progeny healing without another attack or poison recursion',()=>{
 setGameData(data);try{
  const cid=id('ascln'),h=combat('ascln',0,false,6,{units:[{chessId:cid,row:10,col:3,items:['chess_item_4_06_e_a']}]}),u=h.unit(cid),e=h.enemy();
  h.b.dealDamage(u,e,{amount:10,type:'arts',isAttack:true});h.b.loseHp(u,u.s.maxHp*.5);h.b.addBuff(u,{key:'test-disarm',flags:{disarm:true},duration:10});const before=u.hp,attacks=u.stats.attacks,stacks=e.findBuff(`ascln:poison:${u.id}`).stacks;
  h.run(1.1);assert.ok(u.hp>before,'periodic damage heals the equipment carrier');assert.equal(u.stats.attacks,attacks,'DOT does not start another attack animation');assert.equal(e.findBuff(`ascln:poison:${u.id}`).stacks,stacks,'DOT never recursively stacks itself');
  const hits=h.hooksOf('hit').filter(c=>c.dmg.tags?.includes('ascln-poison'));assert.ok(hits.length);assert.ok(hits.every(c=>c.dmg.isAttack&&!c.dmg.isSkill));
 }finally{setGameData(null)}
});
test('all seven official modules select their exact data and execute the authored kits',()=>{
 setGameData(data);try{let count=0;for(const key of keys){const r=get(id(key,6,true));for(const m of r.modules){const h=combat(key,2,true,6,{units:[{chessId:r.chessId,row:10,col:3,skillIndex:2,moduleId:m.uniEquipId}]}),u=h.unit(r.chessId);assert.equal(u.def.raw.module.id,m.uniEquipId);u.skill.gainSp(1000);if(!u.skill.active)u.skill.activate('test');h.run(8);assert.equal(h.b.errorCount,0,`${key} ${m.uniEquipId}`);checkInvariants(h.b);count++;}}assert.equal(count,7)}finally{setGameData(null)}
});

test('single-core recruits are banned despite an active auxiliary bond; another active core keeps dual-core recruits available',()=>{
 const gd={difficulty:'NORMAL',bans:()=>({core:0,addon:0}),modeInactiveBonds:new Set(['emptyShip']),bondIds:['emptyShip','other','aux'],bond:b=>({weight:1,isCore:b!=='aux'}),visibleChess:['single','dual','ordinary'],chess:cid=>({optionalRecruit:cid!=='ordinary',bonds:cid==='dual'?['emptyShip','other']:['emptyShip','aux']})};
 const rng=()=>0;rng.shuffle=()=>{};
 assert.deepEqual(drawDisabledBonds(gd,rng).banned,['single']);
});

test('Dawnstriker S3 auto-casts on airborne targets; only the opening wave hits air',()=>{
 setGameData(data);try{
  const raw={...data,enemies:{...data.enemies,air:enemyRec({key:'air',hp:1e7,speed:0,atk:0,motion:'FLY'})}};
  for(const tier of [5,6])for(const elite of [false,true]){
   const h=makeBattle({data:raw,autoFinish:false,captureNoisy:true,units:[{chessId:id('chen3',tier,elite),row:10,col:3,skillIndex:2}],enemies:[{key:'air',pos:[10,4],route:{motion:'FLY',start:[10,4],end:[10,2],checkpoints:[]}}]});
   h.run(2);const u=h.unit(id('chen3',tier,elite)),e=h.enemy();assert.ok(e.isFlying);u.skill.gainSp(1000);
   assert.ok(h.runUntil(()=>u.skill.active,1),'air alone starts the sword wave');
   assert.ok(h.runUntil(()=>h.hooksOf('hit').some(c=>c.target===e&&c.dmg.tags?.includes('chen3:wave')),3));
   const hp=e.hp;h.run(3);assert.equal(e.hp,hp,'sustained slashes remain ground-only');assert.equal(h.b.errorCount,0);
  }
 }finally{setGameData(null)}
});

test('verified anti-air skill variants activate and damage when only a flying enemy is present',()=>{
 setGameData(data);try{
  const cases=[['chess_custom_recruit_wisdel_6_a',2],['chess_char_5_14_a',2],['chess_char_6_19_a',2],['chess_char_5_19_a',2]];
  for(const [chessId,skillIndex] of cases){
   const raw={...data,enemies:{...data.enemies,air:enemyRec({key:'air',hp:1e7,speed:0,atk:0,motion:'FLY'})}};
   const h=makeBattle({data:raw,autoFinish:false,captureNoisy:true,units:[{chessId,row:10,col:3,skillIndex}],enemies:[{key:'air',pos:[10,4],route:{motion:'FLY',start:[10,4],end:[10,2],checkpoints:[]}}]});h.run(2);const u=h.unit(chessId),e=h.enemy();assert.ok(e.isFlying);u.skill.gainSp(1000);
   assert.ok(h.runUntil(()=>h.hooksOf('hit').some(c=>c.source===u&&c.target===e),5),`${chessId}: air-only auto-cast deals damage`);assert.equal(h.b.errorCount,0);
  }
 }finally{setGameData(null)}
});

test('Ascalon poison propagation excludes concealed enemies without applying its slow',()=>{
 setGameData(data);try{
  const h=combat('ascln',1),u=h.unit(id('ascln')),e=h.enemy();u.skill.gainSp(1000);if(!u.skill.active)u.skill.activate('test');
  const hidden=h.spawn('dummy',{pos:[e.y,e.x+.1],route:{motion:'WALK',start:[e.y,e.x+.1],end:[10,2],checkpoints:[]}});
  h.b.addBuff(hidden,{key:'test:stealth',duration:100,flags:{stealth:true}});
  h.b.dealDamage(u,e,{amount:10,type:'phys',isAttack:true});assert.ok(e.findBuff(`ascln:poison:${u.id}`));
  h.b.kill(e,u);assert.equal(hidden.findBuff(`ascln:poison:${u.id}`),null,'no poison or associated movement debuff is spread to concealment');
 }finally{setGameData(null)}
});

test('Ascalon S2 slow multiplies module slow, affects air, and poison tick survives frequent hits',()=>{
 setGameData(data);try{
  const h=combat('ascln',1,true),u=h.unit(id('ascln',6,true)),e=h.enemy();
  e.x=4;e.y=10;e.markDirty();h.b.removeBuff(e,`ascln:poison:${u.id}`);h.b.addBuff(u,{key:'test-disarm',flags:{disarm:true},duration:100});
  u.skill.gainSp(1000);if(!u.skill.active)u.skill.activate('test');h.run(.3);
  const ratio=Math.max(.05,(1+(u.def.raw.module?.active?-.2:0))*(1+u.skill.bb.move_speed));
  assert.ok(Math.abs(e.s.moveSpeed/e.base.moveSpeed-ratio)<1e-6,JSON.stringify({actual:e.s.moveSpeed/e.base.moveSpeed,ratio,x:e.x,y:e.y,buffs:e.buffs,active:u.skill.active}));
  e.motion='FLY';h.step();assert.ok(Math.abs(e.s.moveSpeed/e.base.moveSpeed-ratio)<1e-6,'S2 and module affect air too');e.motion='WALK';
  const before=h.hooksOf('hit').filter(c=>c.dmg.tags?.includes('ascln-poison')).length;
  for(let n=0;n<8;n++){h.b.dealDamage(u,e,{amount:1,type:'phys',isAttack:true});h.run(.2);}
  assert.ok(h.hooksOf('hit').filter(c=>c.dmg.tags?.includes('ascln-poison')).length>before,'repeated attacks do not postpone every poison tick');
  const p=e.findBuff(`ascln:poison:${u.id}`);assert.equal(p.stacks,3);
  assert.ok(Math.abs(p.mods.moveMul**3-(1+u.def.raw.talents[0].bb.move_speed*3))<1e-6);
  u.deployed=false;h.step();assert.equal(e.findBuff(`ascln:poison:${u.id}`),null);
 }finally{setGameData(null)}
});

test('Narantuya S1 actually shortens her range and restores it when the skill ends',()=>{
 setGameData(data);try{
 const h=combat('narant',0),u=h.unit(id('narant')),grid=[...u.rangeKeys];
 u.skill.gainSp(1000);u.skill.activate('test');assert.ok(u.rangeKeys.length<grid.length);
 u.skill.end('retreat');h.b._refreshRange(u);assert.deepEqual(u.rangeKeys,grid);
 }finally{setGameData(null)}
});

test('Sakiko basic attacks create a travelling note; no direct basic damage precedes note contact',()=>{
 setGameData(data);try{
  for(const tier of [5,6])for(const elite of [false,true])for(const index of [0,1,2]){
   const h=combat('oblvns',index,elite,tier,{enemies:[]}),u=h.unit(id('oblvns',tier,elite));
   u.skill.rule='NEVER';u.skill.spType='none';u.skill.charges=0;u.mem.sakikoNotes=[];
   const e=h.spawn('dummy',{pos:[10,5.4]}),hp=e.hp;
   assert.ok(h.runUntil(()=>u.mem.sakikoNotes.some(n=>n.target===e),5));
   assert.ok(u.stats.attacks>=1);assert.equal(e.hp,hp,'attack creates a note without immediate damage');
   u.atkCd=100;
   assert.ok(h.runUntil(()=>e.hp<hp,4),'travelling note reaches its target');
   const hits=h.hooksOf('hit').filter(c=>c.source===u&&c.target===e);
   assert.ok(hits.length);assert.ok(hits.every(c=>c.dmg.isAttack&&c.dmg.tags?.includes('sakiko-note')),'damage comes only from notes');
   assert.equal(h.b.errorCount,0);
  }
 }finally{setGameData(null)}
});

test('Sakiko generates notes continuously with no enemy in attack range',()=>{
 setGameData(data);try{
  for(const tier of [5,6])for(const elite of [false,true]){
   const h=combat('oblvns',2,elite,tier,{enemies:[]}),u=h.unit(id('oblvns',tier,elite));
   u.skill.rule='NEVER';u.skill.spType='none';
   assert.ok(h.runUntil(()=>u.mem.sakikoNotes.length>0,5));
   assert.equal(h.b.enemies.length,0);assert.ok(u.mem.sakikoNotes.every(n=>!n.target));
   assert.equal(h.b.errorCount,0);
  }
 }finally{setGameData(null)}
});

test('Sakiko snapshot exposes real note coordinates with stable IDs and removes them on retreat',()=>{
 setGameData(data);try{const h=combat('oblvns',2,false,6,{enemies:[]}),u=h.unit(id('oblvns'));u.skill.rule='NEVER';u.skill.spType='none';assert.ok(h.runUntil(()=>u.mem.sakikoNotes.length>0,5));const n=u.mem.sakikoNotes[0],snap=h.b.snapshot();assert.ok(snap.sakikoNotes.some(v=>v[0]===u.id&&v[1]===n.id&&Math.abs(v[2]-n.x)<.011&&v[5]===n.projectile));u.deployed=false;assert.equal(h.b.snapshot().sakikoNotes.length,0);}finally{setGameData(null)}
});

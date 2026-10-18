import {test}from 'node:test';import assert from 'node:assert/strict';
import{DATA,makeMatch}from './harness.js';import{applyCustomExtensions,validateExtensionMinimums}from '../../shared/customExtensions.js';import{makeBattle,chessRec}from '../helpers/battleHarness.js';
import{DataSource}from '../../server/sim/simdata.js';
import{GameData}from '../../server/match/gamedata.js';
test('disabled personal strategies may still supply common preparation and battle effects',t=>{
 const selection={bonds:[],stages:[],disabledBands:['band_quintus','band_amiya'],commonBands:['band_quintus','band_amiya']};assert.deepEqual(validateExtensionMinimums(DATA,selection,{mode:'coop8',difficulty:'NORMAL'}),[]);
 const h=makeMatch({mode:'coop8',humans:8,customExtensions:selection});t.after(()=>h.m.dispose());const m=h.m;m.round=3;assert.ok(!m.gd.bandAllowed('band_quintus'));assert.ok(!m.gd.bandIds().includes('band_quintus'));
 for(const ps of m.order){ps.bandId='band_pith';m.dispatch(ps,'onRoundStart',{});assert.equal(ps._itemLocations('chess_item_5_08_e_a').length,1);}
 const d=applyCustomExtensions(DATA,selection);d.chess={...d.chess,test:chessRec({id:'test',stats:{atk:100},skill:null})};const b=makeBattle({data:d,units:[{chessId:'test',row:10,col:4}],bandId:'band_pith',bonds:Object.fromEntries(['yanShip','swiftShip','arcaneShip'].map(id=>[id,{active:true,count:3,tier:1,layers:0}])),autoFinish:false});b.run(.1);assert.equal(b.unit('test').s.atk,120);assert.equal(b.b.errorCount,0);
});
test('Touch scales both normal and upgraded medical map operators by all personal and common copies',()=>{
 for(const eliteCount of [0,2])for(const copies of [1,2,3,8,9]){
  const raw={...DATA,config:{...DATA.config,commonBands:['band_amedic']}};
  const units=eliteCount?['chess_char_1_01_b','chess_char_1_02_b'].map((chessId,i)=>({chessId,row:10+i,col:5})):[];
  const b=makeBattle({data:new DataSource(raw),stageId:'act2autochess_m01',players:[{playerId:'p1',seat:0,bandId:'band_amedic',units,bonds:{},contentInfo:{matchBands:Array(copies).fill('band_amedic')}}],autoFinish:false});b.run(.1);
  const medics=b.b.allyUnits.filter(u=>u.kind==='token'&&['char_605_cmedic','char_613_acmedc'].includes(u.defId));assert.equal(medics.length,1);const u=medics[0];const ratio=1+.5*(copies-1);for(const key of ['maxHp','atk','def','res','aspd','blockCnt','spRecovery'])assert.equal(u.base[key],u.def.stats[key]*ratio,`${u.defId} ${copies} ${key}`);assert.equal(u.hp,u.s.maxHp);assert.equal(b.b.errorCount,0);
 }
});
test('Touch counts common and personal picks even without precomputed content info',()=>{
 const data=new DataSource({...DATA,config:{...DATA.config,commonBands:['band_amedic']}});
 const h=makeBattle({data,stageId:'act2autochess_m01',bandId:'band_amedic',autoFinish:false});h.run(.1);const u=h.b.allyUnits.find(u=>u.defId==='char_605_cmedic');assert.ok(u);assert.equal(u.base.atk,u.def.stats.atk*1.5);assert.equal(h.b.errorCount,0);
});
test('random strategy grants exactly five additional starting HP in the laboratory',async t=>{
 const {LaboratoryMatch}=await import('../../server/match/LaboratoryMatch.js');const {VirtualScheduler}=await import('../../server/match/scheduler.js');
 const m=new LaboratoryMatch({data:DATA,laboratory:{stageId:'act1autochess_m01',bossId:'boss_1',bandId:'band_random',kind:'boss'},difficulty:'NORMAL',seed:29,scheduler:new VirtualScheduler(),seats:[{seat:0,playerId:'local',name:'박사'}],send:()=>true,broadcast:()=>true,onEnd:()=>{}});t.after(()=>m.dispose());const p=m.order[0];assert.notEqual(p.bandId,'band_random');assert.equal(p.randomBandBonus,5);assert.equal(p.lp,m.gd.startLp(p.bandId)+5);
});
test('common starting HP modifiers stack with the personal strategy',t=>{
 const h=makeMatch({mode:'coop8',humans:8,customExtensions:{bonds:[],stages:[],commonBands:['band_sarkazb']}});t.after(()=>h.m.dispose());
 const gd=h.m.gd;assert.equal(gd.startLp('band_sarkazb'),45+(45-gd.defaultStartLp));assert.equal(gd.startLp('band_lisa'),20+(45-gd.defaultStartLp));
});
test('Duck Lord common-only and repeated team sources each replace their own wave entries',t=>{
 const normal=Object.values(DATA.enemies).find(e=>e.rank==='NORMAL'&&e.stats.motion==='WALK').key;
 for(const personal of [0,1,2]){
  const h=makeMatch({mode:'coop8',humans:8,seed:4,customExtensions:{bonds:[],stages:[],commonBands:['band_ducklord']}});t.after(()=>h.m.dispose());const m=h.m;m.round=5;
  for(const [i,p] of m.order.entries())p.bandId=i<personal?'band_ducklord':null;
  let total=0,max=0;
  for(let i=0;i<100;i++){
   const ev={kind:'normal',spawns:Array.from({length:100},(_,i)=>({enemyKey:normal,time:i,count:1,routeIndex:0}))};m.dispatch(m.order[0],'onBattleStart',ev);
   const count=ev.spawns.filter(s=>s.tag==='duck').length;total+=count;max=Math.max(max,count);assert.equal(ev.spawns.length,100);
  }
  assert.ok(total>0);assert.ok(max>2*personal,`all ${personal+1} sources are active: max=${max}`);assert.equal(m.errorCount,0);
 }
});
test('personal and common milestone rewards have independent once-only counters',t=>{
 const h=makeMatch({mode:'coop8',humans:8,customExtensions:{bonds:[],stages:[],commonBands:['band_paganini']}});t.after(()=>h.m.dispose());const m=h.m,p=m.order[0];p.bandId='band_paganini';m.round=3;
 const grants=[],acquire=p.acquireChess.bind(p);p.acquireChess=(id,opts)=>{const result=acquire(id,opts);if(result)grants.push(id);return result;};
 m.dispatch(p,'onSpend',{amount:54});assert.equal(grants.length,0);m.dispatch(p,'onSpend',{amount:1});assert.equal(grants.length,2);m.dispatch(p,'onSpend',{amount:55});assert.equal(grants.length,2);assert.equal(m.errorCount,0);
});
test('personal and common Amiya apply separate battle buffs',()=>{
 const raw=applyCustomExtensions(DATA,{bonds:[],stages:[],commonBands:['band_amiya']});raw.chess={...raw.chess,test:chessRec({id:'test',stats:{atk:100},skill:null})};
 const h=makeBattle({data:raw,units:[{chessId:'test',row:10,col:4}],bandId:'band_amiya',bonds:Object.fromEntries(['yanShip','swiftShip','arcaneShip'].map(id=>[id,{active:true,count:3,tier:1,layers:0}])),autoFinish:false});h.run(.1);assert.equal(h.unit('test').s.atk,140);assert.equal(h.b.errorCount,0);
});

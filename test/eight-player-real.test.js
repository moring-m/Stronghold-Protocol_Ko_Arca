import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch} from './match/harness.js';
import {loadData} from '../server/data.js';
const data=loadData(new URL('../content/production/data',import.meta.url).pathname,{log:{warn(){},error(){},info(){}}});

// No FakeBattle or fabricated results: eight client authorities run the shared
// combat engine, including shared-pool bosses; the server verifies every result.
// Extra starting HP keeps all eight seats alive to exercise the last-round path.
test('eight real simulation clients complete every round and four boss pairs without takeover',t=>{
 const h=makeMatch({data,mode:'coop8',difficulty:'FUNNY',humans:8,clientCombat:true,verify:'all',captureFrames:false,seed:8831,customExtensions:{bonds:[],stages:[],rules:['duplicateBands']}});
 t.after(()=>{h.clients.closeAll();h.m.dispose();});
 h.autoHumans();let preserved=false;
 const rounds=new Set(),drafts=new Map();let bossPairs;
 h.onBroadcast.push(()=>{
  const m=h.m;if(!preserved&&m.round===1&&m.phase==='PREP'){preserved=true;for(const p of m.order)p.lp=200;}if(m.phase==='COMBAT')rounds.add(m.round);
  if(m.phase==='SP_DRAFT'&&m.sp){assert.equal(m.sp.cards.length,9);drafts.set(m.round,m.sp);}
  if(m.phase==='FINAL_ASSAULT')bossPairs=m.bossWaves.map(w=>w.players.length);
 });
 h.start();h.runToEnd();
 assert.equal(h.ended.roomMode,'coop8');assert.equal(h.ended.players.length,8);assert.equal(h.m.round,14);
 assert.equal(rounds.size,13);assert.deepEqual(bossPairs,[2,2,2,2]);
 for(const [round,sp]of drafts)assert.equal(Object.keys(sp.picks).length,8,`all eight choose in round ${round}`);
 const clients=[...h.clients.values()];assert.equal(clients.length,8);
 for(const c of clients){assert.ok(c.log.some(x=>x.t==='b.result'));assert.ok(!c.ends.some(x=>x.reason==='takeover'));for(const b of c.battles.values())assert.equal(b.battle.errorCount,0);}
 assert.ok(clients.flatMap(c=>c.log).filter(x=>x.t==='b.result').length>100);
 assert.ok(clients.some(c=>[...c.battles.values()].some(b=>b.spec.kind==='unite')));
 assert.equal(h.m.errorCount,0);assert.deepEqual(h.logs.error,[]);assert.deepEqual(h.logs.warn,[]);
});

for(const helperCount of [1,2,3,4])test(`eight-player cooperative defense with ${helperCount} helpers completes actual client combat`,t=>{
 const h=makeMatch({data,mode:'coop8',humans:8,clientCombat:true,verify:'all',captureFrames:false});
 t.after(()=>{h.clients.closeAll();h.m.dispose();});const m=h.m;m.round=1;
 const enemy=Object.keys(m.data.enemies).find(id=>!m.data.enemies[id].tokenOnly);
 const helpers=m.order.slice(0,helperCount),leakers=m.order.slice(helperCount);
 for(const ps of m.order)m.lastResults.set(ps.playerId,{unitsEnd:[],leaked:[],perfect:true,layerGains:{}});
 const plan={helpers,leakers,leaked:leakers.map(ps=>({enemyKey:enemy,lpr:1,sourcePlayerId:ps.playerId})),notReentered:new Map()};
 m.startUnite(plan);h.runToPhase('SETTLE');
 const battles=[...h.clients.values()].flatMap(c=>[...c.battles.values()]);
 assert.ok(battles.length);assert.ok(battles.every(b=>b.spec.kind==='unite'&&b.battle.errorCount===0));
 const replies=[...h.clients.values()].flatMap(c=>c.log).filter(x=>x.t==='b.result');assert.equal(replies.length,1);
 assert.equal(m.errorCount,0);assert.deepEqual(h.logs.error,[]);
 const spec=battles[0].spec;assert.equal(spec.players.length,helperCount);
 assert.ok(spec.stageId.startsWith('coop8_unite_'));assert.ok(spec.routes.every(r=>r.end[1]===2));assert.equal(spec.players[0].colOffset,24);
});

for(const clientCombat of [false,true])test(`eight-player unite quadruples both simulation limit and server deadline (${clientCombat?'client':'server'})`,t=>{
 const h=makeMatch({data,mode:'coop8',humans:8,clientCombat,clients:false,instant:false});t.after(()=>h.m.dispose());const m=h.m;m.round=1;m.wave={timeLimit:60,overrides:{}};
 const enemy=Object.keys(m.data.enemies).find(id=>!m.data.enemies[id].tokenOnly);for(const p of m.order)m.lastResults.set(p.playerId,{unitsEnd:[],leaked:[],perfect:true});
 m.startUnite({helpers:m.order.slice(0,4),leakers:m.order.slice(4),leaked:[{enemyKey:enemy,lpr:1,sourcePlayerId:m.order[4].playerId}],notReentered:new Map()});
 assert.equal(clientCombat?m.fields[0].spec.timeLimit:m.fields[0].battle.timeLimit,240);
 assert.equal(m.deadline-m.sched.now(),240000/m.gameSpeed);
});

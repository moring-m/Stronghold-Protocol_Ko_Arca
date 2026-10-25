import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch} from './harness.js';
function combat(humans=1,options={}){const h=makeMatch({mode:humans>1?'coop':'solo',humans,seed:71,clientCombat:true,clients:false,instant:false,...options}).start();h.toPrep(1);for(const p of h.m.alivePlayers())h.m.handle(p.playerId,{t:'g.ready',ready:true});h.runToPhase('COMBAT',1);return h;}
test('end battle resolves the own field immediately and stale client reports cannot overwrite it',()=>{
 const h=combat();const f=h.m.fields.find(f=>f.players.includes('p_0'));
 assert.deepEqual(h.m.handle('p_0',{t:'g.endBattle',fieldId:f.fieldId}),{ok:true});
 h.run(()=>f.done,{maxSteps:10000});assert.equal(f.done,true);assert.equal(f.resultSource,'server');assert.ok(f.result.time<1);
 assert.deepEqual(h.m.handle('p_0',{t:'g.endBattle',fieldId:'foreign'}).error,'WRONG_PHASE');
});
test('a player cannot stop a teammate field',()=>{
 const h=combat(2);const f=h.m.fields.find(f=>f.players.includes('p_1'));
 assert.ok(h.m.handle('p_0',{t:'g.endBattle',fieldId:f.fieldId}).error);assert.equal(f.done,false);
});
test('shared field requires every human vote',()=>{
 const h=combat(2);const f=h.m.fields[0];f.players=['p_0','p_1'];
 assert.deepEqual(h.m.handle('p_0',{t:'g.endBattle',fieldId:f.fieldId}),{ok:true});assert.equal(f.done,false);assert.equal(f.endRequested,undefined);
 assert.deepEqual([...f.endVotes],['p_0']);
 assert.deepEqual(h.m.handle('p_1',{t:'g.endBattle',fieldId:f.fieldId}),{ok:true});
 h.run(()=>f.done,{maxSteps:10000});assert.equal(f.done,true);
});

test('boss fight requires the whole human team to agree before forcing its end',()=>{
 const h=combat(2);h.m.phase='FINAL_ASSAULT';for(const f of h.m.fields)f.kind='boss';
 const calls=[];h.m._endFinal=reason=>calls.push(reason);
 h.m.handle('p_0',{t:'g.endBattle',fieldId:h.m.fields[0].fieldId});assert.deepEqual(calls,[]);
 h.m.handle('p_1',{t:'g.endBattle',fieldId:h.m.fields[1].fieldId});assert.deepEqual(calls,['forced']);
});

test('pending shared termination is reevaluated when a nonvoter leaves',()=>{
 const h=combat(2);const f=h.m.fields[0];f.players=['p_0','p_1'];
 h.m.handle('p_0',{t:'g.endBattle',fieldId:f.fieldId});
 assert.equal(f.endRequested,undefined);
 h.m.onLeave('p_1');
 h.run(()=>f.done,{maxSteps:10000});assert.equal(f.done,true);
});

test('early surrender includes every scheduled enemy for HP settlement',()=>{
 const h=combat();const f=h.m.fields.find(f=>f.players.includes('p_0'));
 const scheduled=f.spec.spawns.reduce((n,s)=>n+(s.count||1),0);
 assert.ok(f.spec.spawns.some(s=>s.time>1));
 const hp=h.m.players.get('p_0').lp;
 h.m.handle('p_0',{t:'g.endBattle',fieldId:f.fieldId});h.run(()=>f.done,{maxSteps:10000});
 const pp=f.result.perPlayer.p_0;
 assert.equal(pp.killed+pp.leaked.filter(e=>e.counted!==false).length,scheduled);
 assert.ok(pp.leaked.some(e=>e.spawned===false));assert.equal(f.result.unspawned,undefined);
 h.runToPhase('PREP',2);assert.equal(h.m.players.get('p_0').lp,hp-Math.min(10,scheduled));
});

test('early surrender transfers scheduled enemies to cooperative defense',async()=>{
 const {planUnite}=await import('../../server/match/unite.js');
 const h=combat(2),f=h.m.fields.find(f=>f.players.includes('p_0'));
 h.m.handle('p_0',{t:'g.endBattle',fieldId:f.fieldId});h.run(()=>f.done,{maxSteps:10000});
 const results=new Map([['p_0',f.result.perPlayer.p_0],['p_1',{perfect:true,leaked:[],unitsEnd:[]}]]);
 const plan=planUnite(h.m,results);assert.ok(plan);assert.ok(plan.helpers.some(p=>p.playerId==='p_1'));
 assert.equal(plan.leaked.length,f.result.perPlayer.p_0.leaked.filter(e=>e.counted!==false).length);assert.ok(plan.leaked.length>1);
});
test('eight-player unite requires votes from all four human defenders, excludes leakers, and completes surrender',()=>{
 const h=makeMatch({mode:'coop8',humans:8,clientCombat:true,instant:false});const m=h.m;m.start();m.startRound(1);m.enterPrep();const chess=m.gd.visibleChess.find(id=>m.gd.chess(id).position==='MELEE');
 for(const p of m.order.slice(0,4)){p.board.set('10,3',p.newPiece('chess',chess));m.lastResults.set(p.playerId,{unitsEnd:[]});}
 m.startUnite({helpers:m.order.slice(0,4),leakers:m.order.slice(4),leaked:[{enemyKey:Object.keys(m.data.enemies)[0],lpr:1,sourcePlayerId:'p_4'}],notReentered:new Map()});const f=m.fields[0];
 assert.ok(m.handle('p_4',{t:'g.endBattle',fieldId:f.fieldId}).error);
 for(let i=0;i<3;i++){assert.ok(m.handle('p_'+i,{t:'g.endBattle',fieldId:f.fieldId}).ok);assert.equal(f.done,false);assert.equal(f.endRequested,undefined);}
 assert.ok(m.handle('p_3',{t:'g.endBattle',fieldId:f.fieldId}).ok);h.run(()=>f.done,{maxSteps:10000});assert.equal(f.done,true);assert.equal(f.endVotes.size,4);assert.equal(f.endRequested,true);assert.equal(f.result.reason,'timeout');m.dispose();
});

for(const clientCombat of [true,false])test(`surrender charges breakthrough for pending enemies (${clientCombat?'client':'server'} combat)`,t=>{
 const h=combat(1,{clientCombat,customExtensions:{rules:['augments']}});t.after(()=>h.m.dispose());
 const m=h.m,f=m.fields[0],ps=m.players.get('p_0');
 m.augments.enemies=[{effect:{kind:'leak',amount:1}}];
 const scheduled=clientCombat?f.spec.spawns.reduce((n,s)=>n+(s.count||1),0):f.battle._pending.length+f.battle.enemies.filter(e=>e.alive).length;
 assert.ok(scheduled>0);const hp=ps.lp;
 m.handle('p_0',{t:'g.endBattle',fieldId:f.fieldId});
 if(clientCombat)h.run(()=>f.done,{maxSteps:10000});
 assert.equal(ps.lp,hp-Math.min(10,scheduled),'surrender immediately charges remaining enemies, including unspawned ones');
 const result=clientCombat?f.result:f.battle.result();
 m.augments.creditResult(f,result);assert.equal(ps.lp,hp-Math.min(10,scheduled),'repeated final reports do not charge twice');
 h.runToPhase('PREP',2);assert.equal(ps.lp,hp-2*Math.min(10,scheduled),'ordinary settlement is still separate');
});

for(const clientCombat of [true,false])test(`ordinary surrender at ten HP has no health floor (${clientCombat?'client':'server'} combat)`,t=>{
 const h=makeMatch({mode:'solo',difficulty:'ABYSS',humans:1,seed:2125392049,clientCombat,clients:false,instant:false}).start();t.after(()=>h.m.dispose());
 h.toPrep(1);h.m.startRound(2);h.m.enterPrep();
 const m=h.m,ps=m.players.get('p_0');ps.lp=10;ps.dirty();
 assert.equal(m.augments.enabled,false);
 m.handle(ps.playerId,{t:'g.ready',ready:true});h.runToPhase('COMBAT',2);
 const f=m.fields[0];assert.ok(m.handle(ps.playerId,{t:'g.endBattle',fieldId:f.fieldId}).ok);
 h.run(()=>m.phase==='SETTLE'||m.ended,{maxSteps:10000});
 const result=(f.result||f.battle.result()).perPlayer[ps.playerId];
 const leaked=result.leaked.filter(l=>l.counted!==false).length;
 assert.ok(leaked>=10,'the fixture must exercise lethal loss from exactly ten HP');
 assert.equal(ps.lp,0);assert.equal(ps.alive,false);
 const pub=m.publicView();assert.equal(pub.players.find(p=>p.playerId===ps.playerId).lp,0);
 assert.equal(ps.privateView().lp,0);
});

test('surrender does not grant kills from wall time ahead of a delayed browser simulation',t=>{
 const h=combat();t.after(()=>h.m.dispose());const m=h.m,ps=m.players.get('p_0'),f=m.fields[0];
 ps.lp=10;ps.dirty();f.spec.spawns=[{...f.spec.spawns[0],time:0,count:10}];
 const build=m._specBattle.bind(m);m._specBattle=(spec,...args)=>{
  const b=build(spec,...args);b.after(3,()=>{for(const e of [...b.enemies])if(e.alive)b.kill(e);});return b;
 };
 f.startAt-=30000;f.progress.gt=1;
 m.handle(ps.playerId,{t:'g.endBattle',fieldId:f.fieldId});h.run(()=>m.phase==='SETTLE'||m.ended,{maxSteps:10000});
 assert.ok(f.result.time<=1.05,'replay must stop at the known client battle time, not the later server wall clock');
 assert.equal(f.result.perPlayer[ps.playerId].killed,0);assert.equal(ps.lp,0);
});

for(const gt of [1,.2])test(`surrender preserves completed kills with a current or stale snapshot (${gt})`,t=>{
 const h=combat();t.after(()=>h.m.dispose());const m=h.m,ps=m.players.get('p_0'),f=m.fields[0];
 ps.lp=10;ps.dirty();f.spec.spawns=[{...f.spec.spawns[0],time:0,count:10}];
 const build=m._specBattle.bind(m);m._specBattle=(spec,...args)=>{
  const b=build(spec,...args);b.after(.6,()=>b.kill(b.enemies.find(e=>e.alive)));
  b.after(3,()=>{for(const e of [...b.enemies])if(e.alive)b.kill(e);});return b;
 };
 f.startAt-=30000;f.progress.gt=gt===1?.5:1;
 m.handle(ps.playerId,{t:'g.endBattle',fieldId:f.fieldId,gt});h.run(()=>m.phase==='SETTLE'||m.ended,{maxSteps:10000});
 assert.ok(f.result.time<=1.05);assert.equal(f.result.perPlayer[ps.playerId].killed,1);assert.equal(ps.lp,1);
});

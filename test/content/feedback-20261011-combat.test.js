import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,chessRec,enemyRec} from '../helpers/battleHarness.js';
import {resolveHit} from '../../server/sim/ai.js';
import {unitTuple} from '../../server/sim/snapshot.js';
const dummy=()=>enemyRec({key:'dummy',hp:1e8,speed:0,atk:0});
test('equipment applies silence to every splash victim and every individual strike, excluding proc damage',()=>{
 const h=makeBattle({defs:{chess:{a:chessRec({id:'a',stats:{atk:100},skill:null})},enemies:{dummy:dummy()}},units:[{chessId:'a',row:10,col:5,items:['chess_item_3_08_e_a']}],enemies:[{key:'dummy',pos:[10,6]},{key:'dummy',pos:[11,6]}],autoFinish:false});
 h.run(1.2);const u=h.unit('a'),[e1,e2]=h.enemies();
 const prof={dmgType:'phys',splashRadius:1.5,canHitFly:true,atkScale:1};
 resolveHit(h.b,u,prof,e1,{attackId:900,isSkill:false},e1.x,e1.y);
 for(const e of [e1,e2])assert.ok(e.s.flags.silence,'all impact victims silenced');
 for(const e of [e1,e2])for(const buff of [...e.buffs])if(buff.status==='silence')h.b.removeBuff(e,buff);
 h.b.dealDamage(u,e2,{amount:1,type:'true',tags:['item-proc']});
 assert.ok(!e2.s.flags.silence,'secondary item damage cannot trigger an attack effect');
});
test('Kazemaru substitute changes to token range, drains its SP timer and returns to operator range',()=>{
 const id='chess_char_2_11_a';const h=makeBattle({units:[{chessId:id,row:10,col:5,skillIndex:0}],autoFinish:false,timeLimit:100});h.run(1.2);const u=h.unit(id),before=JSON.stringify(u.rangeGrid);
 h.b.dealDamage(null,u,{amount:1e9,type:'true'});assert.equal(u.form,'doll');assert.equal(u.rangeGrid.length,9);
 const a=unitTuple(u,h.b.time);assert.equal(a[5],a[6]);assert.equal(a[6],21);
 h.run(3);assert.ok(unitTuple(u,h.b.time)[5]<a[5]);h.run(18.1);assert.equal(u.form,null);assert.equal(JSON.stringify(u.rangeGrid),before);
});
for(const id of ['chess_char_3_19_a','chess_char_6_11_a'])test(`tactician ${id} loses reinforcement on death and regains it on redeployment`,()=>{
 const h=makeBattle({units:[{chessId:id,row:10,col:5}],timeLimit:150,autoFinish:false});h.run(1.2);const u=h.unit(id);
 const summons=()=>h.b.allyUnits.filter(t=>t.kind==='token'&&t.ownerUnit===u&&t.alive&&t.deployed);
 assert.ok(summons().length);h.b.dealDamage(null,u,{amount:1e9,type:'true'});assert.equal(summons().length,0);
 assert.ok(h.b.redeploy(u,{free:true}));h.run(1.2);assert.ok(summons().length);assert.equal(h.b.errorCount,0);
});
test('levitation carries a 0.35 tile status height without changing native flying units',()=>{
 const h=makeBattle({defs:{chess:{a:chessRec({id:'a',skill:null})},enemies:{dummy:dummy()}},units:[{chessId:'a',row:10,col:3}],enemies:[{key:'dummy',pos:[10,5]}],autoFinish:false});h.run(.2);const e=h.spawn('dummy',{pos:[10,5]});h.b.applyStatus(e,'levitate',{duration:3});assert.deepEqual(h.b.snapshot().airHeights,[[e.id,.35]]);h.run(3.1);assert.deepEqual(h.b.snapshot().airHeights,[]);
});
test('Zima S3 retains initial delay and does not release multiple scheduled strikes in one tick',async()=>{
 const {readFileSync}=await import('node:fs');const all=JSON.parse(readFileSync(new URL('../../content/production/data/chess.json',import.meta.url)));const id='chess_custom_ursus_headb2_a';const rec=all[id];assert.ok(rec);
 const h=makeBattle({defs:{chess:{[id]:rec}},units:[{chessId:id,row:10,col:5,skillIndex:2}],autoFinish:false,timeLimit:100});h.run(1.2);const u=h.unit(id);u.skill.gainSp(1000,'test');assert.ok(u.skill.activate('test'));
 h.run(1);assert.equal(u.mem.zimaStrikes,0);h.run(.2);assert.equal(u.mem.zimaStrikes,1);
 const n=u.mem.zimaStrikes;u.skill.tick(5);assert.equal(u.mem.zimaStrikes,n+1,'one strike per update even after a stall');assert.equal(h.b.errorCount,0);
});

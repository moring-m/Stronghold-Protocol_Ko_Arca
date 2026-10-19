import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
import {criticalDamage,roundedDamageNumber,showDamageNumber,damageNumberMode} from '../../shared/damageDisplay.js';
import {compileRoute} from '../../server/sim/ai.js';

test('original damage display uses expected mitigated damage, ties-to-even and legacy preferences',()=>{
 assert.equal(criticalDamage(149,100),false);assert.equal(criticalDamage(150,100),true);
 assert.equal(criticalDamage(10,100,true),true);
 assert.equal(roundedDamageNumber(150.5),150);assert.equal(roundedDamageNumber(151.5),152);
 assert.equal(damageNumberMode({damageNumbers:false}),'none');assert.equal(damageNumberMode({damageNumbers:true}),'sum');
 for(const mode of ['sum','all'])assert.ok(showDamageNumber({damageNumberMode:mode},{critical:false}));
 assert.equal(showDamageNumber({damageNumberMode:'basic'},{critical:false}),false);
 assert.ok(showDamageNumber({damageNumberMode:'basic'},{critical:true}));
 assert.ok(showDamageNumber({damageNumberMode:'basic'},null,true));
 assert.equal(showDamageNumber({damageNumberMode:'none'},{critical:true},true),false);
});
test('penetration counts toward critical text without changing damage; invulnerability suppresses its zero',()=>{
 const h=makeBattle({content:'none',autoFinish:false,defs:{enemies:{enemy_dummy:enemyRec({key:'enemy_dummy',hp:10000,def:200,speed:0})}},enemies:[{key:'enemy_dummy',pos:[10,4]}]});h.step();
 const e=h.enemy('enemy_dummy');
 h.b.dealDamage(null,e,{amount:300,type:'phys',canDodge:false});
 let ev=h.eventsOf('dmg').at(-1);assert.equal(ev[2],100);assert.equal(ev[4].expected,100);assert.equal(ev[4].critical,false);
 h.b.dealDamage(null,e,{amount:300,type:'phys',defIgnoreFlat:100,canDodge:false});
 ev=h.eventsOf('dmg').at(-1);assert.equal(ev[2],200);assert.equal(ev[4].expected,100);assert.equal(ev[4].critical,true);
 const hp=e.hp;h.b.addBuff(e,{key:'test-invulnerable',duration:2,flags:{invulnerable:true}});
 h.b.dealDamage(null,e,{amount:300,type:'phys'});ev=h.eventsOf('dmg').at(-1);
 assert.equal(e.hp,hp);assert.equal(ev[2],0);assert.equal(ev[4].critical,true);assert.equal(ev[4].blocked,'invulnerable');assert.equal(showDamageNumber({damageNumberMode:'all'},ev[4]),false);
});
test('native PATROL checkpoints loop before the next tick can advance to the exit',()=>{
 const route={motion:'FLY',start:[10,5],end:[10,2],checkpoints:[{type:'MOVE',pos:[10,6]},{type:'PATROL',pos:[10,7]},{type:'PATROL',pos:[10,8]}]};
 const legs=compileRoute(route);assert.equal(legs[2].loopTo,1);
 const h=makeBattle({content:'none',autoFinish:false,defs:{enemies:{enemy_patroller:enemyRec({key:'enemy_patroller',hp:10000,speed:20,motion:'FLY'})}},enemies:[{key:'enemy_patroller',route}]});
 h.run(5);const e=h.enemy('enemy_patroller');assert.ok(e.alive);assert.ok(e.x>=6.9&&e.x<=8.1,`${e.x}`);
 assert.equal(h.eventsOf('leak').length,0);assert.equal(h.b.errorCount,0);
});

test('damage events carry their actual source and attack/skill role for sound attribution',()=>{
 const h=makeBattle({content:'none',autoFinish:false,defs:{enemies:{enemy_dummy:enemyRec({key:'enemy_dummy',hp:10000,speed:0})}},enemies:[{key:'enemy_dummy',pos:[10,4]}]});h.step();const e=h.enemy();
 h.b.dealDamage(null,e,{amount:100,type:'true',isSkill:true});let ev=h.eventsOf('dmg').at(-1);assert.equal(ev[4].sourceId,null);assert.equal(ev[4].isSkill,true);
 // No attributed attack means no unit impact bank should be guessed from another attack.
 h.b.loseHp(e,100);ev=h.eventsOf('dmg').at(-1);assert.equal(ev[4].sourceId,null);assert.equal(ev[4].isAttack,false);assert.equal(ev[4].isSkill,false);
});

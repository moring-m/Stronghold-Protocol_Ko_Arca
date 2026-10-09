import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle, chessRec, enemyRec} from '../helpers/battleHarness.js';
import {spineAttackTiming, attackWindup} from '../../shared/attackTiming.js';
import {updateAlly} from '../../server/sim/ai.js';
const timing = {front:{attack:{dur:1,hit:.4},skills:{}},back:null};
function scenario(side='ally') {
 const op={...chessRec({id:'timed',skill:null,stats:{atk:side==='ally'?100:0,blockCnt:0,bat:1}}),attackTiming:timing};
 const enemy={...enemyRec({key:'timed_enemy',hp:10000,atk:side==='enemy'?100:0,speed:0,range:2,applyWay:'RANGED'}),attackTiming:timing};
 return makeBattle({content:'generic',autoFinish:false,captureNoisy:true,defs:{chess:{timed:op},enemies:{timed_enemy:enemy}},units:[{chessId:'timed',row:10,col:3}],enemies:[{key:'timed_enemy',pos:[10,4]}]});
}
for (const side of ['ally','enemy']) test(`${side}: no damage before OnAttack; one strike after full wind-up`,()=>{
 const h=scenario(side);h.step();const source=side==='ally'?h.unit('timed'):h.enemies()[0],target=side==='ally'?h.enemies()[0]:h.unit('timed');
 const initial=target.hp;assert.ok(source.mem.attackWindup);const until=source.mem.attackWindup.until;
 h.run(.3);assert.equal(target.hp,initial);while(h.b.time<until+1e-8)h.step();assert.equal(source.stats.attacks,1);h.run(.2);assert.ok(target.hp<initial);assert.equal(h.b.errorCount,0);
});
test('a living target leaving range does not cancel the committed attack',()=>{
 const h=scenario();h.step();const u=h.unit('timed'),e=h.enemies()[0];e.x=18;e.y=10;e.tileC=18;h.run(.6);
 assert.equal(u.stats.attacks,1);assert.equal(u.mem.attackWindup,undefined);assert.ok(!h.events.some(e=>e[0]==='atkCancel'));assert.ok(e.hp<e.s.maxHp);
});
test('an immediate attack-enhancing skill preserves the in-progress hit deadline',()=>{
 const h=scenario();h.step();const u=h.unit('timed'),until=u.mem.attackWindup.until;
 u.skill={active:true,index:2,attackOverride:()=>({dmgMul:2}),targetingOverride:()=>null};
 updateAlly(h.b,u,.05);assert.equal(u.mem.attackWindup.until,until);
 assert.equal(u.mem.attackWindup.profile.skillDmgMul,2);
 assert.equal(h.eventsOf('atkStart').filter(e=>e[1]===u.id).length,1);
 assert.equal(h.eventsOf('atkCancel').filter(e=>e[1]===u.id).length,0);
});
test('Spine extraction keeps skill OnAttack; attack speed compresses wind-up in the same ratio',()=>{
 const sp={anims:{idle:'Idle',attack:{loop:'Attack'},skills:{2:{loop:'Skill'}}},animations:{Attack:1,Skill:2},hits:{Attack:[.4],Skill:[.8]}};
 const a=spineAttackTiming(sp);assert.equal(a.skills[2].hit,.8);assert.equal(attackWindup({def:{attackTiming:{front:a}},s:{interval:.5},skill:{active:true,index:2}}),.2);
});
test('stance loops without OnAttack retain the normal attack hit timing',()=>{
 const sp={skel:'char_337_utage.skel',animations:{Attack:1.2,Skill_Loop:1.5},hits:{Attack:[.433]},anims:{attack:{loop:'Attack'},skills:{0:{loop:'Skill_Loop'},1:{loop:'Skill_Loop'}}}};
 const timing=spineAttackTiming(sp);assert.deepEqual(timing.skills,{});assert.equal(timing.attack.hit,.433);
});
test('native one-second rhythm does not gain a tick of idle from floating-point cooldown residue',()=>{
 const h=scenario();const times=[];h.b.on('tick',()=>{});h.b._ev=((original)=>function(e){if(e[0]==='atkStart'&&e[1]===h.unit('timed').id)times.push(h.b.time);return original.call(this,e);})(h.b._ev);
 h.run(5);assert.ok(times.length>=4);for(let i=1;i<times.length;i++)assert.ok(Math.abs(times[i]-times[i-1]-1)<1e-8,JSON.stringify(times));
});

test('a pre-hit target death retargets without resetting the wind-up deadline or animation',()=>{
 const h=scenario();h.step();const u=h.unit('timed'),old=h.enemies()[0];
 const replacement=h.spawn('timed_enemy',{pos:[10,4]});
 const until=u.mem.attackWindup.until;old.alive=false;old.hp=0;
 h.step();assert.equal(u.mem.attackWindup.until,until);assert.equal(u.mem.attackWindup.targets[0],replacement);
 assert.equal(h.eventsOf('atkStart').filter(e=>e[1]===u.id).length,1);
 assert.equal(h.eventsOf('atkCancel').filter(e=>e[1]===u.id).length,0);
 assert.equal(h.eventsOf('atkRetarget').filter(e=>e[1]===u.id).length,1);
 while(h.b.time<until+1e-8)h.step();
 assert.equal(u.stats.attacks,1);assert.ok(h.eventsOf('atk').some(e=>e[1]===u.id&&e[2]===replacement.id));
});

test('a range-sensitive drone wind-up retargets a living enemy leaving range without a new attack animation',()=>{
 const h=scenario();h.step();const u=h.unit('timed'),a=h.enemies()[0];
 u.mem.attackWindup.profile.windupNeedsRange=true;
 const until=u.mem.attackWindup.until;
 const next=h.spawn('timed_enemy',{pos:[10,4],route:{motion:'WALK',start:[10,4],end:[10,2],checkpoints:[]}});
 a.x=18;h.run(.1);assert.equal(u.mem.attackWindup.until,until);assert.equal(u.mem.attackWindup.targets[0],next);
 assert.equal(h.eventsOf('atkStart').filter(e=>e[1]===u.id).length,1);
 h.run(.4);assert.equal(u.stats.attacks,1);
});

test('Vendela active buff timing uses Attack, not its short activation gesture',()=>{
 const sp={skel:'char_494_vendla.skel',anims:{attack:{loop:'Attack'},skills:{0:{loop:'Skill'},1:{loop:'Skill'}}},animations:{Attack:1.367,Skill:.5},hits:{Attack:[.567],Skill:[.167]}};
 const timing=spineAttackTiming(sp);assert.deepEqual(timing.skills,{});
 assert.equal(attackWindup({def:{attackTiming:{front:timing},skill:{index:1}},s:{interval:1.6},skill:{active:true}}),.567);
});

test('legacy enemy strike metadata supplies wind-up, including Big Bob',()=>{
 assert.equal(attackWindup({kind:'enemy',def:{attackAnim:{dur:1,hit:.167}},s:{interval:4}}),.167);
 const h=scenario('enemy');h.step();const e=h.enemies()[0];e.def={...e.def,attackTiming:null,attackAnim:{dur:1,hit:.167}};delete e.mem.attackWindup;e.atkCd=0;
 const u=h.unit('timed');const before=u.hp;
 h.run(.1);assert.equal(u.hp,before,'no damage before the strike frame');
 h.run(.2);assert.ok(u.hp<before,'strike lands after the wind-up');
});

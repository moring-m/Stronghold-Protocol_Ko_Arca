import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {setGameData} from '../../server/sim/content/support/index.js';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
const base=loadData(new URL('../../.cache/leithanien-data',import.meta.url).pathname);
const find=(charId,golden=false)=>Object.values(base.chess).find(c=>c.charId===charId&&c.isGolden===golden&&!c.optionalRecruit);
const bond=(layers=0)=>({active:true,count:3,tier:1,layers});
const raw=(record,bonds)=>({...base,chess:{...base.chess,[record.chessId]:{...record,bonds:[...new Set([...record.bonds,...bonds])]}},enemies:{dummy:enemyRec({key:'dummy',hp:1e9,atk:0,speed:0,def:0,res:0})}});

test('Eyjafjalla alter S2 repeatedly auto casts with healthy allies and Swift, awarding her skill trait layers',()=>{
 const c=find('char_1016_agoat2'),data=raw(c,['swiftShip']);setGameData(data);
 const h=makeBattle({data,autoFinish:false,units:[{chessId:c.chessId,row:10,col:3,skillIndex:1}],bonds:{swiftShip:bond(300)},flags:{layerGainsEnabled:true}});
 h.run(.3);const u=h.unit(c.chessId);assert.equal(u.hp,u.s.maxHp);u.skill.setSpTotal(u.skill.spCost);h.run(15);
 assert.ok(u.skill.activations>=3);assert.equal(u.hp,u.s.maxHp);
 assert.ok(h.b.getPlayer(u.ownerId).bonds.swiftShip.layers>300);assert.equal(h.b.errorCount,0);
});

for(const charId of ['char_350_surtr','char_423_blemsh'])for(const golden of [false,true])test(`${charId} ${golden?'elite':'normal'} S1 gets Raid stats during its strike and loses them immediately afterwards`,()=>{
 const c=find(charId,golden),data=raw(c,['raidShip']);setGameData(data);
 const h=makeBattle({data,autoFinish:false,captureNoisy:true,units:[{chessId:c.chessId,row:10,col:3,skillIndex:0}],enemies:[{key:'dummy',pos:[10,4],route:{motion:'WALK',start:[10,4],end:[10,4],checkpoints:[]}}],bonds:{raidShip:bond(10)}});
 h.run(1.5);const u=h.unit(c.chessId),atk=u.s.atk,hp=u.s.maxHp;u.skill.setSpTotal(u.skill.spCost);assert.ok(u.skill.activate('test'));
 assert.ok(u.s.atk>atk);assert.ok(u.s.maxHp>hp);
 let hit=false;h.b.on('damaged',d=>{if(d.source===u&&d.dmg.isSkill&&d.dmg.isAttack){hit=true;assert.ok(u.s.atk>atk);assert.ok(u.s.maxHp>hp);}});
 assert.ok(h.runUntil(()=>hit&&!u.skill.active,5));assert.equal(u.findBuff('bond:raidShip'),null);assert.ok(Math.abs(u.s.atk-atk)<1e-6);assert.ok(Math.abs(u.s.maxHp-hp)<1e-6);assert.equal(h.b.errorCount,0);
});

for(const charId of ['char_263_skadi','char_4064_mlynar'])test(`${charId} Raid jump restores current SP plus initial SP before deployment listeners`,()=>{
 const c=find(charId),data=raw(c,['raidShip']);setGameData(data);
 const h=makeBattle({data,autoFinish:false,units:[{chessId:c.chessId,row:12,col:3,skillIndex:2}],enemies:[{key:'dummy',pos:[9,9],route:{motion:'WALK',start:[9,9],end:[9,9],checkpoints:[]}}],bonds:{raidShip:bond()}});
 h.run(.3);const u=h.unit(c.chessId);u.skill.setSpTotal(charId==='char_263_skadi'?55:40);u.deployedAt=-20;u.lastAttackAt=-20;
 let before,landed;h.b.on('death',d=>{if(d.unit===u&&d.reason==='raid')before=u.skill.spTotal;});h.b.on('deploy',d=>{if(d.unit===u&&!d.initial)landed={sp:u.skill.spTotal,ready:u.skill.ready};});
 assert.ok(h.runUntil(()=>!!landed,2));assert.ok(landed.sp>=Math.min(u.skill.spCost,before+u.skill.initSp));assert.equal(landed.ready,true);assert.ok(h.runUntil(()=>u.skill.active,3),'skill starts after landing');assert.equal(h.b.errorCount,0);
});

test('ordinary keep-SP redeployment does not receive the Raid-only initial SP bonus',()=>{
 const c=find('char_263_skadi'),data=raw(c,[]);setGameData(data);const h=makeBattle({data,autoFinish:false,units:[{chessId:c.chessId,row:10,col:3,skillIndex:2}]});h.run(.3);const u=h.unit(c.chessId);u.skill.setSpTotal(20);h.b.retreat(u);assert.ok(h.b.redeploy(u,{free:true,keepSp:true}));assert.equal(u.skill.spTotal,20);
});

test('Ebenholz S2 remnant explosion applies Notes using its operator owner',()=>{
 const id='chess_custom_leithanien_ebenholz_a';setGameData(base);
 const data={...base,enemies:{dummy:enemyRec({key:'dummy',hp:1e9,atk:0,speed:0,def:0,res:0})}};
 const h=makeBattle({data,autoFinish:false,captureNoisy:true,units:[{chessId:id,row:10,col:3,skillIndex:1}],bonds:{leithanienShip:bond(30)}});
 h.run(.3);const u=h.unit(id);u.profile.noAttack=true;u.skill.setSpTotal(u.skill.spCost);
 assert.ok(h.runUntil(()=>h.b.allyUnits.some(t=>t.kind==='token'&&t.ownerUnit===u&&t.alive),3));
 const token=h.b.allyUnits.find(t=>t.kind==='token'&&t.ownerUnit===u&&t.alive),r=Math.round(token.y),c=Math.round(token.x);const e=h.spawn('dummy',{pos:[r,c<10?c+1:c-1],route:{motion:'WALK',start:[r,c<10?c+1:c-1],end:[r,c<10?c+1:c-1],checkpoints:[]}});
 assert.ok(h.runUntil(()=>h.hooksOf('damaged').some(d=>d.dmg.tags.includes('ebnhlz:flashback')),3));assert.ok(h.b.leithanien.applications>0);assert.ok([...h.b.leithanien.cohorts.values()].some(c=>c.u===u));h.run(1.1);assert.ok(u.stats.noteDamage>0);assert.equal(h.b.errorCount,0);
});

import {effectiveProfile} from '../../server/sim/ai.js';
test('a ranged charged strike retains its Raid ATK until the projectile lands after skill end',()=>{
 const c=find('char_103_angel'),data=raw(c,['raidShip']);setGameData(data);
 const h=makeBattle({data,autoFinish:false,captureNoisy:true,units:[{chessId:c.chessId,row:10,col:3,skillIndex:0}],enemies:[{key:'dummy',pos:[10,6],route:{motion:'WALK',start:[10,6],end:[10,6],checkpoints:[]}}],bonds:{raidShip:bond(10)}});
 h.run(1.5);const u=h.unit(c.chessId),e=h.enemy();u.atkCd=0;u.skill.setSpTotal(u.skill.spCost);assert.ok(u.skill.activate('test'));
 const p=effectiveProfile(u),expected=u.s.atk*(p.atkScale||1)*u.s.atkScaleMul*(p.hits||1),before=e.hp;
 assert.ok(h.b.forceAttack(u,[e]));assert.equal(u.skill.active,false);assert.equal(u.findBuff('bond:raidShip'),null);u.atkCd=100;u.profile.noAttack=true;h.run(.8);
 assert.ok(Math.abs(before-e.hp-expected)<1e-3,`expected ${expected}, got ${before-e.hp}`);assert.equal(h.b.errorCount,0);
});

test('Lappland alter S3 continues her own attacks while drones deal damage',()=>{
 const c=find('char_1038_whitw2'),data=raw(c,[]);setGameData(data);
 const h=makeBattle({data,autoFinish:false,captureNoisy:true,units:[{chessId:c.chessId,row:10,col:3,skillIndex:2}],enemies:[{key:'dummy',pos:[10,4],route:{motion:'WALK',start:[10,4],end:[10,4],checkpoints:[]}}]});
 h.run(.3);const u=h.unit(c.chessId);u.skill.setSpTotal(u.skill.spCost);assert.ok(h.runUntil(()=>u.skill.active,5));
 let attacks=0;h.b.on('attack',ctx=>{if(ctx.attacker===u&&u.skill.active)attacks++;});h.run(8);
 assert.ok(attacks>=2,`own attacks during S3: ${attacks}`);assert.ok(h.hooksOf('damaged').some(d=>d.source===u&&!d.dmg.isAttack));assert.equal(h.b.errorCount,0);
});

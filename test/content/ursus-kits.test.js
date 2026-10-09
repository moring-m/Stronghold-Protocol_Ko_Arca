import {acquireTargets} from '../../server/sim/ai.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {loadData} from '../../server/data.js';
import {GameData} from '../../server/match/gamedata.js';
import {pieceBonds} from '../../server/match/bondsMeta.js';
import {makeMatch} from '../match/harness.js';
import {makeBattle,enemyRec,checkInvariants,flatStage} from '../helpers/battleHarness.js';
import {setGameData} from '../../server/sim/content/support/index.js';
import {imperialPlatforms,ukusikChain} from '../../server/sim/content/kits/ursus.js';
const dir=new URL('../../.cache/ursus-data/',import.meta.url);
const ready=existsSync(new URL('chess.json',dir));
const data=ready?loadData(dir.pathname):null;
const id=(key,elite=false)=>`chess_custom_ursus_${key}_${elite?'b':'a'}`;
function combat(key,index=0,elite=false,extra={}){
 const raw={...data,enemies:{...data.enemies,dummy:enemyRec({key:'dummy',hp:1e7,speed:0,atk:0,mass:4})}};
 const h=makeBattle({data:raw,autoFinish:false,captureNoisy:true,units:[{chessId:id(key,elite),row:10,col:3,skillIndex:index}],enemies:[{key:'dummy',time:0,route:{motion:'WALK',start:[10,4],end:[10,2],checkpoints:[]}}],...extra});h.step();h.run(Math.max(0,...h.b.allyUnits.map(u=>u.deployRemaining)));return h;
}
test('All 19 Ursus skills, normal and elite: selected authored runtime and complete activation without errors',{skip:!ready},()=>{
 setGameData(data);
 try{let total=0;for(const r of Object.values(data.chess).filter(c=>c.chessId.startsWith('chess_custom_ursus_'))){for(const sk of r.skills){
  const key=r.chessId.split('_')[3],h=combat(key,sk.index,r.isGolden),u=h.unit(r.chessId);assert.equal(u.skill.id,sk.skillId);
  u.hp=u.s.maxHp*.5;u.skill.gainSp(1000,'test');assert.ok(u.skill.activate('test'),`${r.name} ${sk.name}`);h.run(Math.max(8,sk.duration+1));assert.equal(h.b.errorCount,0,`${r.name} ${sk.name}`);checkInvariants(h.b);total++;
 }}assert.equal(total,38);
 }finally{setGameData(null)}
});
test('Botani acquisition grants no layers; morph grants Ursus only when paired',{skip:!ready},()=>{
 const h=makeMatch({data,customFactions:true,mode:'solo',fake:true}).start();h.toPrep(1);const ps=h.ps('p_0');ps.layers={};ps.board.clear();ps.hand.fill(null);ps.temp.fill(null);ps.recompute();
 ps.acquireChess(id('botany'),{source:'test'});assert.equal(ps.layers.ursusShip||0,0);assert.equal(ps.layers.miraShip||0,0);assert.equal(!!ps.bonds.ursusShip?.active,false);
 ps.acquireChess(id('botany',true),{source:'test'});assert.equal(ps.layers.ursusShip||0,0);assert.equal(ps.layers.miraShip||0,0);
 const gd=new GameData(data),base=Object.values(data.chess).find(c=>c.visible&&!c.isGolden&&!c.bonds.includes('ursusShip')).chessId;
 assert.ok(!pieceBonds(gd,{id:base,items:[{id:'chess_item_custom_ursus_a'}]}).includes('ursusShip'));
 for(const suffix of ['a','b'])assert.ok(pieceBonds(gd,{id:base,items:[{id:`chess_item_custom_ursus_${suffix}`},{id:'chess_item_6_09_e_a'}]}).includes('ursusShip'));
});
test('Hellagur garrison adds attack speed by each complete three active Ursus layers',{skip:!ready},()=>{
 setGameData(data);try{for(const elite of [false,true]){
  const run=layers=>combat('helage',0,elite,{bonds:{ursusShip:{count:3,active:true,tier:1,layers}}}).unit(id('helage',elite));
  const a=run(0),b=run(8);assert.equal(b.s.aspd-a.s.aspd,2*(elite?4:2));assert.ok(Math.abs(b.s.atk/a.s.atk-1.28/1.2)<1e-6);assert.ok(Math.abs(b.s.maxHp/a.s.maxHp-1.28/1.2)<1e-6);
 }}finally{setGameData(null)}
});
test('Rosa locks heavy targets for six one-second pulses and prevents ordinary attacks',{skip:!ready},()=>{
 setGameData(data);try{const h=combat('poca',2,false,{enemies:[{key:'dummy',time:0,route:{motion:'WALK',start:[10,5],end:[10,2],checkpoints:[]}}]}),u=h.unit(id('poca')),e=h.enemy();h.b._refreshRange(u);u.skill.gainSp(1000);assert.ok(u.skill.activate());const hp=e.hp;h.run(6.1);
 const hits=h.hooksOf('hit').filter(c=>c.source===u&&c.dmg.tags?.includes('rosa-harpoon'));assert.equal(hits.length,6);assert.ok(e.hp<hp);assert.equal(h.b.errorCount,0);
 }finally{setGameData(null)}
});
test('Zima S2 doubles on second activation and remains active; S3 consumes exactly five strikes',{skip:!ready},()=>{
 setGameData(data);try{
 const h=combat('headb2',1),u=h.unit(id('headb2'));u.skill.gainSp(1000);if(!u.skill.active)u.skill.activate();h.run(u.skill.duration+1);u.skill.gainSp(1000);u.skill.activate();h.run(25);assert.equal(u.skill.activations,2);assert.equal(u.skill.kind,'toggle');assert.equal(u.skill.active,true);checkInvariants(h.b);
 const h3=combat('headb2',2),z=h3.unit(id('headb2'));z.skill.gainSp(1000);z.skill.activate();h3.run(15);assert.equal(z.mem.zimaStrikes,5);assert.equal(z.skill.active,false);assert.equal(h3.b.errorCount,0);
 }finally{setGameData(null)}
});
test('Zima elevated tiles hit ground neighbours and root them; Botani burst talent caps at three stacks',{skip:!ready},()=>{
 setGameData(data);try{
 const stage=flatStage({rows:{11:'##hrhrrrrrfrrrrrrrf##'}}),h=combat('headb2',0,false,{stage}),u=h.unit(id('headb2')),e=h.enemy();const hp=e.hp;
 assert.ok(imperialPlatforms(h.b,u,4,11,{radius:1,depth:2,bind:1})>0);assert.ok(e.hp<hp);assert.ok(e.s.flags.bind);
 const hb=combat('botany',1),bot=hb.unit(id('botany'));for(let i=0;i<5;i++)hb.b.emit('elementBurst',{element:'erosion',target:hb.enemy()});assert.equal(bot.mem.botanyStacks,3);assert.equal(hb.b.errorCount,0);
 }finally{setGameData(null)}
});
test('Ukusik self-bounce grants an extra hop without decay; S2 applies HoT and camouflage',{skip:!ready},()=>{
 setGameData(data);try{
  const h=combat('turdus',1,false,{units:['turdus','leto','botany','glassb'].map((key,i)=>({chessId:id(key),row:10,col:3+i,skillIndex:key==='turdus'?1:0}))});
  const u=h.unit(id('turdus'));for(const a of h.allies())a.hp=a.s.maxHp*.2;
  const hp=u.hp;u.skill.gainSp(1000);u.skill.activate();assert.ok(Math.abs(u.hp-hp*.85)<1e-6);
  const healed=ukusikChain({battle:h.b,unit:u,target:u,amount:100});assert.equal(healed.length,4);assert.equal(healed[0],u);for(const a of healed){assert.ok(a.s.flags.camou);assert.ok(a.buffs.some(v=>v.key===`skill:turdus:hot:${u.id}`))}
  const last=healed.at(-1),before=last.hp;h.run(1.1);assert.ok(last.hp>before);assert.equal(h.b.errorCount,0);
 }finally{setGameData(null)}
});
test('Leto S2 starts ready student skills, excludes non-students, and removes ASPD at skill end',{skip:!ready},()=>{
 setGameData(data);try{
 const h=combat('leto',1,false,{units:[{chessId:id('leto'),row:10,col:3,skillIndex:1},{chessId:id('glassb'),row:11,col:3},{chessId:id('botany'),row:12,col:3}]});
 const leto=h.unit(id('leto')),istina=h.unit(id('glassb')),botany=h.unit(id('botany'));const speed=istina.s.aspd;
 for(const u of [leto,istina,botany])u.skill.gainSp(1000);assert.ok(leto.skill.activate());assert.equal(istina.skill.active,true);assert.equal(botany.skill.active,false);assert.equal(istina.s.aspd,speed+21);
 leto.skill.end('test');assert.equal(istina.s.aspd,speed);assert.equal(h.b.errorCount,0);
 }finally{setGameData(null)}
});
test('Absinthe S2 refuses targets above half HP; Botani S1 adds both extra arts damage and erosion',{skip:!ready},()=>{
 setGameData(data);try{
 const h=combat('absin',1),u=h.unit(id('absin')),e=h.enemy();h.run(.5);u.skill.gainSp(1000);u.skill.activate();const hp=e.hp;h.run(2);assert.equal(e.hp,hp);e.hp=e.s.maxHp*.4;h.run(3);assert.ok(e.hp<e.s.maxHp*.4);
 const hb=combat('botany',0),bot=hb.unit(id('botany')),target=hb.enemy();bot.skill.gainSp(1000);bot.skill.activate();hb.run(3);assert.ok(target.elem.erosion>0);assert.ok(hb.hooksOf('hit').some(c=>c.source===bot&&c.dmg.tags?.includes('botany-extra')));assert.equal(hb.b.errorCount,0);
 }finally{setGameData(null)}
});
test('Zima preparation start and end each grant six / twelve layers when active',{skip:!ready},()=>{
 for(const elite of [false,true]){const h=makeMatch({data,customFactions:true,mode:'solo',fake:true}).start();h.toPrep(1);const ps=h.ps('p_0');ps.board.clear();ps.hand.fill(null);ps.temp.fill(null);ps.layers={};ps.bandId=null;
  const p=ps.acquireChess(id('headb2',elite),{source:'test'});ps.board.set('10,3',p);ps.hand.fill(null);ps.bondCountBonus.ursusShip=3;ps.recompute();h.m.dispatch(ps,'onRoundStart',{round:h.m.round});assert.equal(ps.layers.ursusShip,elite?12:6);
  h.m.dispatch(ps,'onPrepEnd',{round:h.m.round});assert.equal(ps.layers.ursusShip,elite?24:12);
  assert.equal(h.m.dispatcher.triggerGarrisons(ps,p,'SERVER_PREP_FIN'),1,'prep-end trait can be triggered by other operators');assert.equal(ps.layers.ursusShip,elite?36:18);
  ps.bondCountBonus.ursusShip=0;ps.recompute();h.m.dispatch(ps,'onPrepEnd',{});assert.equal(ps.layers.ursusShip,elite?36:18,'inactive bond gains nothing');
  ps.bondCountBonus.ursusShip=3;ps.board.clear();ps.hand[0]=p;ps.recompute();h.m.dispatch(ps,'onRoundStart',{});h.m.dispatch(ps,'onPrepEnd',{});assert.equal(ps.layers.ursusShip,elite?36:18,'bench trait does not run');h.m.dispose();
 }
});
test('Ursus Cutlass applies normal / elite ATK and max-HP buffs through the real equipment runtime',{skip:!ready},()=>{
 setGameData(data);try{const base=combat('turdus').unit(id('turdus'));for(const suffix of ['a','b']){
 const h=combat('turdus',0,false,{units:[{chessId:id('turdus'),row:10,col:3,items:[`chess_item_custom_ursus_${suffix}`]}]}),u=h.unit(id('turdus')),ratio=suffix==='a'?1.15:1.25;
 assert.ok(Math.abs(u.s.atk/base.s.atk-ratio)<1e-6);assert.ok(Math.abs(u.s.maxHp/base.s.maxHp-ratio)<1e-6);assert.equal(h.b.errorCount,0);
 }}finally{setGameData(null)}
});
test('Ursus drone approaches and attacks stationary ground and flying targets with shell projectiles',{skip:!ready},()=>{
 setGameData(data);try{for(const motion of ['WALK','FLY']){
 const raw={...data,enemies:{...data.enemies,drone_target:enemyRec({key:'drone_target',hp:1e7,atk:0,speed:0,motion})}};
 const h=makeBattle({data:raw,autoFinish:false,captureNoisy:true,units:[{chessId:id('turdus'),row:10,col:3}],bonds:{ursusShip:{count:3,active:true,tier:1,layers:20}},enemies:[{key:'drone_target',time:0,route:{motion,start:[10,6],end:[9,2],checkpoints:[]}}]});
 h.run(18);const drone=h.b.allyUnits.find(u=>u.defId==='token_custom_ursus_drone'),enemy=h.enemy();assert.ok(drone);assert.ok(drone.stats.attacks>=2);assert.ok(enemy.hp<enemy.s.maxHp);assert.ok(h.hooksOf('hit').some(c=>c.credit===drone&&c.target===enemy));assert.equal(drone.s.atk,1400);assert.equal(drone.s.maxHp,17680);assert.equal(h.b.errorCount,0);checkInvariants(h.b);
 }}finally{setGameData(null)}
});
test('Airborne Ursus drone pursues distant enemies, stops in range, and resumes pursuit after target loss',{skip:!ready},()=>{
 setGameData(data);try{
 const raw={...data,enemies:{...data.enemies,flight_target:enemyRec({key:'flight_target',hp:1e7,atk:0,speed:0})}};
 const h=makeBattle({data:raw,autoFinish:false,units:[{chessId:id('turdus'),row:10,col:3}],bonds:{ursusShip:{count:3,active:true,tier:1,layers:0}},enemies:[{key:'flight_target',time:0,route:{motion:'WALK',start:[10,9],end:[9,2],checkpoints:[]}}]});h.step();
 const drone=h.b.allyUnits.find(u=>u.defId==='token_custom_ursus_drone'),enemy=h.enemy(),initial=drone.x;h.run(18);assert.ok(Math.abs(drone.x-initial)>1,`moved ${initial} -> ${drone.x}, target ${enemy.x}`);assert.ok(enemy.hp<enemy.s.maxHp,JSON.stringify({initial,pos:[drone.x,drone.y],target:[enemy.x,enemy.y],attacks:drone.stats.attacks,range:drone.rangeKeys}));const stopped=drone.x;h.run(2);assert.ok(Math.abs(drone.x-stopped)<1e-6);
 h.b.loseHp(enemy,enemy.hp,{source:drone});const next=h.spawn('flight_target',{route:{motion:'WALK',start:[10,2],end:[9,2],checkpoints:[]},pos:[10,2]});assert.ok(next);h.run(2);assert.ok(drone.x<stopped);assert.equal(drone.ground,false);assert.equal(h.b.errorCount,0);checkInvariants(h.b);
 }finally{setGameData(null)}
});
test('New operator skills, talents and traits use Korean source strings with resolved combat values',{skip:!ready},()=>{
 for(const c of Object.values(data.chess).filter(c=>c.chessId.startsWith('chess_custom_ursus_'))){
  for(const sk of c.skills){assert.match(sk.name,/[가-힣]/);assert.match(sk.desc,/[가-힣]/);assert.ok(!/\{[^}]+\}/.test(sk.desc),`${c.name} ${sk.name}`)}
  assert.match(c.trait.desc,/[가-힣]/);for(const t of c.talents.filter(t=>!t.hidden&&t.desc))assert.match(t.desc,/[가-힣]/);
 }
});
test('Every new elite operator has selectable official modules; all module loadouts run without callback errors',{skip:!ready},()=>{
 setGameData(data);try{for(const c of Object.values(data.chess).filter(c=>c.chessId.startsWith('chess_custom_ursus_')&&c.isGolden)){
 assert.ok(c.modules.length>=1,c.name);assert.equal(c.module.level,3);assert.equal(c.module.active,true);assert.equal(c.modules.filter(m=>m.isDefault).length,1);
 for(const moduleId of ['none',...c.modules.map(m=>m.uniEquipId)]){const key=c.chessId.split('_')[3];const h=combat(key,0,true,{units:[{chessId:c.chessId,row:10,col:3,moduleId}]});const u=h.unit(c.chessId);assert.equal(u.def.raw.module?.active||false,moduleId!=='none');u.skill.gainSp(1000);u.skill.activate();h.run(8);assert.equal(h.b.errorCount,0,`${c.name} ${moduleId}`);checkInvariants(h.b)}
 }}finally{setGameData(null)}
});
test('Updated affiliations/tier and default/alternate skill icons follow the UI manifest contract',{skip:!ready},async()=>{
 const {skillIconUrl,skillRecordIconUrl}=await import('../../public/js/ui/assetUrls.js');const c=data.chess[id('glassb')];assert.equal(c.tier,4);assert.deepEqual(c.bonds,['ursusShip','visiShip']);assert.deepEqual(data.chess[id('helage')].bonds,['ursusShip','raidShip']);
 assert.equal(data.assets.bonds.ursusShip,'/assets/custom/ursus/icon-full.png');
 for(const c of Object.values(data.chess).filter(c=>c.chessId.startsWith('chess_custom_ursus_'))){assert.match(skillIconUrl(data.assets,c),/\/custom\/ursus\/skill\//);for(const sk of c.skills)assert.match(skillRecordIconUrl(data.assets,sk),/\/custom\/ursus\/skill\//)}
});
test('Leto: own Ursus skill activations grant 2/4 layers per activation, capped at eight activations',{skip:!ready},()=>{
 const plain=Object.values(data.chess).find(c=>c.visible&&!c.isGolden&&!c.bonds.includes('ursusShip')&&(c.garrisonIds||[]).every(g=>data.garrisons[g].eventType!=='IN_BATTLE')).chessId;
 setGameData(data);try{for(const elite of [false,true]){
 const h=combat('leto',0,elite,{flags:{layerGainsEnabled:true},bonds:{ursusShip:{count:3,active:true,tier:1,layers:0}},enemies:[],units:[{chessId:id('leto',elite),row:10,col:3},{chessId:id('glassb'),row:11,col:3},{chessId:plain,row:12,col:3}]});
 const own=h.unit(id('glassb')),other=h.unit(plain);h.b.emit('skillStart',{unit:other});assert.equal(h.b.getPlayer('p1').bonds.ursusShip.layers,0);
 for(let i=0;i<20;i++)h.b.emit('skillStart',{unit:own});assert.equal(h.b.getPlayer('p1').bonds.ursusShip.layers,elite?32:16);assert.equal(h.b.errorCount,0);
 }}finally{setGameData(null)}
});
test('Drone spawns one tile right of map centre; shells wait three seconds, hit a fixed 1.2-radius area, and survive shooter death',{skip:!ready},()=>{
 setGameData(data);try{
 const raw={...data,enemies:{...data.enemies,shell_target:enemyRec({key:'shell_target',hp:1e7,atk:0,speed:0})}};
 const h=makeBattle({data:raw,captureNoisy:true,autoFinish:false,rect:{r0:9,r1:12,c0:2,c1:10},units:[{chessId:id('turdus'),row:10,col:3}],bonds:{ursusShip:{count:3,active:true,tier:1,layers:0}}});h.step();const drone=h.b.allyUnits.find(u=>u.defId==='token_custom_ursus_drone');assert.equal(drone.x,7);assert.equal(drone.y,10.5);assert.equal(h.b.fieldMeta().units.find(u=>u.id===drone.id).rangeRadius,2);
 const spawn=(r,c)=>h.spawn('shell_target',{route:{motion:'WALK',start:[r,c],end:[9,2],checkpoints:[]},pos:[r,c]});const target=spawn(10,6),near=spawn(11,6),far=spawn(10,8);const hp=target.hp,nearHp=near.hp,farHp=far.hp;
 h.runUntil(()=>drone.stats.attacks>0,2);assert.ok(drone.stats.attacks>0);assert.equal(target.hp,hp);h.run(2.7);assert.equal(target.hp,hp);assert.equal(near.hp,nearHp);
 // A moving original target avoids the locked landing; the neighbour remains in the blast.
 target.x=9;target.y=10;h.b.loseHp(drone,drone.hp,{source:far});h.run(.4);assert.equal(target.hp,hp);assert.ok(near.hp<nearHp);assert.equal(far.hp,farHp);assert.equal(h.b.errorCount,0);
 assert.ok(h.eventsOf('fx').some(e=>e[1]==='bombardShell'&&e[4].vertical));checkInvariants(h.b);
 }finally{setGameData(null)}
});

test('Drone ignores taunt for base-distance priority and pursues the leading enemy despite in-range trailing enemies',{skip:!ready},()=>{
 setGameData(data);try{
  const raw={...data,enemies:{...data.enemies,target:enemyRec({key:'target',hp:1e8,atk:0,speed:0})}};
  const h=makeBattle({data:raw,autoFinish:false,units:[{chessId:id('turdus'),row:10,col:3}],bonds:{ursusShip:{count:3,active:true,tier:1,layers:0}}});h.step();
  const d=h.b.allyUnits.find(u=>u.defId==='token_custom_ursus_drone');h.run(2);d.atkCd=2;
  const spawn=(r,c)=>h.spawn('target',{route:{motion:'WALK',start:[r,c],end:[r,2],checkpoints:[]},pos:[r,c]});
  const outside=spawn(10,3),nearBase=spawn(10,6),farBase=spawn(10,7);
  h.b.addBuff(farBase,{key:'taunt',mods:{taunt:100}});h.step();
  assert.deepEqual(acquireTargets(h.b,d,d.profile),[nearBase]);
  d.atkCd=2;const x=d.x;h.run(.2);assert.ok(d.x<x);
  nearBase.x=3;farBase.x=3;h.step();assert.deepEqual(acquireTargets(h.b,d,d.profile),[]);
  h.run(.2);assert.ok(d.x<x);assert.equal(h.b.errorCount,0);
 }finally{setGameData(null)}
});

test('Ukusik preparation grants +4 / +8 to each active bond',{skip:!ready},()=>{
 for(const elite of [false,true]){
  const h=makeMatch({data,customFactions:true,mode:'solo',fake:true}).start();h.toPrep(1);const ps=h.ps('p_0');
  ps.board.clear();ps.hand.fill(null);ps.temp.fill(null);ps.layers={};ps.bandId=null;
  const p=ps.acquireChess(id('turdus',elite),{source:'test'});ps.board.set('10,3',p);ps.hand.fill(null);
  ps.bondCountBonus.ursusShip=3;ps.bondCountBonus.deputShip=3;ps.recompute();
  const active=['ursusShip','deputShip'].filter(k=>ps.bonds[k]?.active);assert.ok(active.includes('ursusShip'));
  h.m.dispatch(ps,'onRoundStart',{round:h.m.round});for(const k of active)assert.equal(ps.layers[k],elite?8:4);
 }
});

for(const elite of [false,true])test(`Istina ${elite?'elite':'normal'}: only sluggish deaths inside range grant +2 / +4 to active bonds, at most eight triggers`,{skip:!ready},(t)=>{
 setGameData(data);t.after(()=>setGameData(null));
 const state=()=>({count:3,active:true,tier:1,layers:0});
 const h=combat('glassb',0,elite,{flags:{layerGainsEnabled:true},bonds:{ursusShip:state(),visiShip:state()},enemies:[]});const u=h.unit(id('glassb',elite));
 const layers=()=>['ursusShip','visiShip'].map(k=>h.b.getPlayer('p1').bonds[k].layers);
 const death=(status,pos=[10,4],killer=null)=>{const e=h.spawn('dummy',{pos,route:{motion:'WALK',start:pos,end:[10,2],checkpoints:[]}});if(status)h.b.applyStatus(e,status,{duration:5,source:u,value:.5});h.b.kill(e,killer);};
 assert.match(data.garrisons[u.def.raw.garrisonIds[0]].desc,new RegExp(`정지.*\\[우르수스\\]/\\[예견\\].*\\+${elite?4:2}.*전투당 최대 8회 발동`));
 death('slow');death('stun');death('freeze');death(null);death('sluggish',[12,9]);assert.deepEqual(layers(),[0,0]);
 death('sluggish');assert.deepEqual(layers(),elite?[4,2]:[2,1],'another source or no credited killer still qualifies');
 for(let i=0;i<13;i++)death('sluggish');assert.deepEqual(layers(),elite?[32,16]:[16,8],'one death is one trigger even when both bonds gain');
});

test('Istina never grants inactive bonds and shares one eight-trigger budget across later activation',{skip:!ready},(t)=>{
 setGameData(data);t.after(()=>setGameData(null));
 const h=combat('glassb',0,false,{flags:{layerGainsEnabled:true},bonds:{ursusShip:{count:3,active:true,tier:1,layers:0},visiShip:{count:0,active:false,tier:0,layers:0}},enemies:[]});const u=h.unit(id('glassb'));
 const death=()=>{const e=h.spawn('dummy',{pos:[10,4],route:{motion:'WALK',start:[10,4],end:[10,2],checkpoints:[]}});h.b.applyStatus(e,'sluggish',{duration:5,source:u});h.b.kill(e);};
 for(let i=0;i<4;i++)death();const bonds=h.b.getPlayer('p1').bonds;assert.equal(bonds.ursusShip.layers,8);assert.equal(bonds.visiShip.layers,0);
 Object.assign(bonds.visiShip,{count:3,active:true,tier:1});for(let i=0;i<9;i++)death();assert.equal(bonds.ursusShip.layers,16);assert.equal(bonds.visiShip.layers,4);
});

test('Ursus default skills match the requested roster for normal and elite records',{skip:!ready},async()=>{
 const {resolveRecordLoadout}=await import('../../shared/loadoutRecord.js');
 const expected={absin:0,turdus:0,botany:0,glassb:1,leto:1,poca:1,helage:1,headb2:2};
 for(const [key,index]of Object.entries(expected))for(const elite of [false,true]){
  const rec=data.chess[id(key,elite)];assert.equal(rec.skill.index,index,rec.name);
  assert.equal(resolveRecordLoadout(rec).skillIndex,index,rec.name);
 }
});

test('every Ursus operator has distinct normal and elite trait data and matching nested effects',{skip:!ready},()=>{
 const normals=Object.values(data.chess).filter(c=>!c.isGolden&&c.bonds.includes('ursusShip'));
 assert.equal(normals.length,10);
 for(const c of normals){const elite=data.chess[c.goldenId];assert.ok(elite,c.name);
  const gs=c.garrisonIds.map(g=>data.garrisons[g]),es=elite.garrisonIds.map(g=>data.garrisons[g]);
  {assert.notDeepEqual(gs.map(g=>g.bb),es.map(g=>g.bb),c.name+' must improve on promotion');assert.notDeepEqual(gs.map(g=>g.desc),es.map(g=>g.desc),c.name+' description must show the improvement');}
  for(const g of [...gs,...es])if(g.garrisonId.startsWith('garrison_ursus_'))for(const effect of g.effects||[]){
   assert.deepEqual(effect.bb,g.bb,g.garrisonId);assert.deepEqual(effect.bbStr,g.bbStr,g.garrisonId);assert.equal(effect.eventType,g.eventType);
   if(g.eventTypes)assert.deepEqual(effect.eventTypes,g.eventTypes);
  }
 }
});

test('in-place Ukusik promotion uses the upgraded prep trait on the same piece',{skip:!ready},()=>{
 const h=makeMatch({data,customFactions:true,mode:'solo',fake:true}).start();h.toPrep(1);const ps=h.ps('p_0');
 ps.board.clear();ps.hand.fill(null);ps.temp.fill(null);ps.layers={};ps.bandId=null;
 const p=ps.acquireChess(id('turdus'),{source:'test'});ps.hand.fill(null);ps.board.set('10,3',p);ps.bondCountBonus.ursusShip=3;ps.recompute();
 h.m.dispatch(ps,'onRoundStart',{});assert.equal(ps.layers.ursusShip,3);
 assert.ok(ps.promote(p));assert.equal(p.id,id('turdus',true));
 h.m.dispatch(ps,'onRoundStart',{});assert.equal(ps.layers.ursusShip,9,'elite contributes six after the normal three');h.m.dispose();
});

test('Zima S3 fires all five rounds at its fixed front tile without enemies',{skip:!ready},()=>{
 setGameData(data);try{
  const h=combat('headb2',2,false,{enemies:[]}),u=h.unit(id('headb2'));
  u.skill.gainSp(1000);assert.ok(u.skill.activate());
  h.run(20);assert.equal(u.mem.zimaStrikes,5);assert.equal(u.skill.active,false);
  assert.equal(u.stats.attacks,5);assert.equal(h.b.errorCount,0);
 }finally{setGameData(null)}
});

test('Botani first skill grants seven / fourteen active Ursus layers by grade',{skip:!ready},()=>{
 setGameData(data);try{for(const elite of [false,true]){
  const h=combat('botany',0,elite,{flags:{layerGainsEnabled:true},bonds:{ursusShip:{count:3,active:true,tier:1,layers:0}},enemies:[]}),u=h.unit(id('botany',elite));
  const before=h.b.getPlayer('p1').bonds.ursusShip.layers;
  h.b.emit('skillStart',{unit:u});
  assert.equal(h.b.getPlayer('p1').bonds.ursusShip.layers,before+(elite?14:7));
  h.b.emit('skillStart',{unit:u});
  assert.equal(h.b.getPlayer('p1').bonds.ursusShip.layers,before+(elite?14:7),'no further grants this battle');
  checkInvariants(h.b);
 }}finally{setGameData(null)}
});

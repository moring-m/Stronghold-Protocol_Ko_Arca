import {test} from 'node:test';
import {formatBondEffect,richTextPlain} from '../../public/js/ui/richText.js';
import {DataSource} from '../../server/sim/simdata.js';
import {createBattleFromSpec,buildBattleSpec} from '../../server/sim/spec.js';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {setGameData} from '../../server/sim/content/support/index.js';
import {makeBattle,chessRec,enemyRec} from '../helpers/battleHarness.js';
import {applyCustomExtensions} from '../../shared/customExtensions.js';
import {createRng} from '../../server/sim/rng.js';
import {GameData} from '../../server/match/gamedata.js';
import {drawDisabledBonds} from '../../server/match/pool.js';
const data=loadData(new URL('../../.cache/leithanien-data/',import.meta.url).pathname);
function setup(count=3,layers=0,multiple=false,targets=1){
 const raw={...data,chess:{...data.chess,test:chessRec({id:'test',bonds:['leithanienShip'],skill:null,stats:{atk:100,aspd:0}}),test2:chessRec({id:'test2',bonds:['leithanienShip'],skill:null,stats:{atk:200,aspd:0}})},enemies:{dummy:enemyRec({key:'dummy',hp:1e9,atk:100,speed:0,def:0,res:0})}};
 setGameData(raw);
 const h=makeBattle({data:raw,captureNoisy:true,autoFinish:false,units:[{chessId:'test',row:10,col:3},...(multiple?[{chessId:'test2',row:10,col:4}]:[])],enemies:Array.from({length:targets},()=>({key:'dummy',route:{motion:'WALK',start:[10,10],end:[10,9],checkpoints:[]}})),bonds:{leithanienShip:{active:true,count,tier:count>=6?2:1,layers}}});
 h.run(.1);h.u=h.unit('test');h.e=h.enemy();return h;
}
test('independent notes last five seconds, merge equal-frame stacks, do not recursively apply',()=>{
 const h=setup();h.b.dealDamage(h.u,h.e,{amount:1,type:'arts'});h.b.dealDamage(h.u,h.e,{amount:1,type:'arts'});
 assert.equal(h.b.leithanien.applications,1);assert.equal(h.b.leithanien.heap.length,1);assert.equal(h.b.snapshot().noteStacks[h.e.id],1);
 h.run(1.1);assert.equal(h.b.leithanien.damageBatches,1);
 const d=h.hooksOf('damaged').filter(c=>c.dmg.tags.includes('leithanien:note'));assert.equal(d[0].amount,51);assert.equal(d[0].source,h.u);assert.equal(h.u.stats.artsDamage,2);assert.equal(h.u.stats.physicalDamage||0,0);
 h.b.dealDamage(h.u,h.e,{amount:1,type:'arts'});h.run(4);
 assert.equal(h.b.leithanien.liveStacks,1);h.run(1.1);assert.equal(h.b.leithanien.liveStacks,0);assert.equal(h.b.leithanien.applications,2);assert.equal(h.b.snapshot().noteStacks[h.e.id],undefined);assert.equal(h.b.errorCount,0);
});
test('six synergy extends each duration by ten seconds + one per twenty-five layers and weakens enemy damage',()=>{
 const h=setup(6,30);h.b.dealDamage(h.u,h.e,{amount:1,type:'arts'});
 assert.equal(h.b.leithanien.heap[0].end-h.b.time,11);
 const below=setup(6,24);below.b.dealDamage(below.u,below.e,{amount:1,type:'arts'});assert.equal(below.b.leithanien.heap[0].end-below.b.time,10);
 const hp=h.u.hp;h.b.dealDamage(h.e,h.u,{amount:100,type:'true'});assert.equal(hp-h.u.hp,75);const hpDot=h.u.hp;h.b.dealDamage(h.e,h.u,{amount:100,type:'true',sourceless:true});assert.equal(hpDot-h.u.hp,75);
 h.run(11.1);const hp2=h.u.hp;h.b.dealDamage(h.e,h.u,{amount:100,type:'true'});assert.equal(hp2-h.u.hp,100);
 assert.ok(Math.abs(h.hooksOf('damaged').find(c=>c.dmg.tags.includes('leithanien:note')).amount-51.3)<1e-6);assert.equal(h.b.errorCount,0);
});
test('faction content is opt-in and each custom core adds exactly one ban',()=>{
 const base=applyCustomExtensions(data,{bonds:[],stages:[]});assert.ok(!base.bonds.leithanienShip);assert.ok(!base.items.chess_item_custom_leithanien_bell_a);assert.ok(!base.bands.band_custom_leithanien_witchking);assert.ok(!base.choices.cards.tactic.some(c=>c.effectId==='allybuff_custom_leithanien_oath'));
 for(const bonds of [[],['leithanien'],['ursus'],['ursus','leithanien']]){
  const d=applyCustomExtensions(data,{bonds,stages:[]}),gd=new GameData(d,'mode_single_normal');const off=drawDisabledBonds(gd,createRng(3)).drawn;assert.equal(off.filter(id=>gd.bond(id).isCore).length,3+bonds.length);
 }
});
test('all eight new normal/elite operators enter actual combat without content errors',()=>{
 setGameData(data);
 for(const [id,c]of Object.entries(data.chess).filter(([id])=>id.startsWith('chess_custom_leithanien_'))){
  const h=makeBattle({data,units:[{chessId:id,row:10,col:4}],enemies:[{key:'enemy_1000_gopro',route:{motion:'WALK',start:[10,5],end:[10,3],checkpoints:[]}}],bonds:{leithanienShip:{active:true,count:6,tier:2,layers:30},skillfulShip:{active:true,count:3,tier:1,layers:0},swiftShip:{active:true,count:3,tier:1,layers:0}},flags:{layerGainsEnabled:true},captureNoisy:true,autoFinish:false});
  h.run(15);assert.equal(h.b.errorCount,0,`${id}: ${JSON.stringify(h.b.errors)}`);assert.ok(h.unit(id).kit);
 }
});
test('Viviana gain and other battle traits respect per-battle limits; equipment sharing applies once per caster',()=>{
 const vivi='chess_custom_leithanien_viviana_a',less='chess_custom_leithanien_lessing_a',diam='chess_custom_leithanien_diamante_a';
 const raw={...data,enemies:{...data.enemies,dummy:enemyRec({key:'dummy',hp:1e9,speed:0,atk:0,def:0,res:0})}};setGameData(raw);
 const h=makeBattle({data:raw,autoFinish:false,units:[{chessId:vivi,row:10,col:3,items:['chess_item_custom_leithanien_score_a','chess_item_custom_leithanien_bell_a']},{chessId:less,row:10,col:4},{chessId:diam,row:10,col:5}],enemies:[{key:'dummy',route:{motion:'WALK',start:[10,9],end:[10,8],checkpoints:[]}}],bonds:{leithanienShip:{active:true,count:6,tier:2,layers:0},skillfulShip:{active:true,count:3,tier:1,layers:0},arcaneShip:{active:true,count:3,tier:1,layers:0},raidShip:{active:true,count:3,tier:1,layers:0}},flags:{layerGainsEnabled:true},captureNoisy:true});h.run(.1);
 const v=h.unit(vivi),l=h.unit(less),d=h.unit(diam),e=h.enemy();const p=h.b.getPlayer(v.ownerId);assert.equal(p.bonds.leithanienShip.layers,4);
 for(let i=0;i<20;i++)h.b.emit('deploy',{unit:l,initial:false});assert.equal(p.bonds.leithanienShip.layers,32);
 for(let i=0;i<60;i++){h.b.dealDamage(v,e,{amount:1,type:'arts'});h.b.time+=.2;}assert.equal(p.bonds.leithanienShip.layers,52);assert.equal(p.bonds.skillfulShip.layers,10);
 const arcaneBefore=p.bonds.arcaneShip.layers,nimbleBefore=p.bonds.skillfulShip.layers;e.x=6;e.y=10;for(let i=0;i<9;i++)h.b.emit('damaged',{target:e,type:'element',dmg:{element:'necrosis'},amount:1});assert.equal(p.bonds.arcaneShip.layers-arcaneBefore,5);assert.equal(p.bonds.skillfulShip.layers,nimbleBefore);
 const before=h.b.leithanien.applications;h.b.emit('skillStart',{unit:l});assert.equal(h.b.leithanien.applications,before+1);
 assert.equal(v.findBuff('leithanien:score:arts').mods.artsDealtMul,1.4);assert.equal(v.s.aspd>=120,true);assert.equal(h.b.errorCount,0,JSON.stringify(h.b.errors));
});

test('three thousand simultaneous hits are throttled to one note and five damage batches',()=>{
 const h=setup();
 for(let i=0;i<3000;i++)h.b.dealDamage(h.u,h.e,{amount:1,type:'arts'});
 assert.equal(h.b.leithanien.heap.length,1);assert.equal(h.b.leithanien.liveStacks,1);
 h.run(5.1);assert.equal(h.b.leithanien.damageBatches,5);assert.equal(h.b.leithanien.liveStacks,0);assert.equal(h.b.errorCount,0);
});
test('newly supported operators also cast their alternative skills without content errors',()=>{
 setGameData(data);
 for(const [key,index]of [['earthspirit',1],['czerny',0],['diamante',1],['bassline',1]])for(const suffix of ['a','b']){
  const id=`chess_custom_leithanien_${key}_${suffix}`;
  const h=makeBattle({data,units:[{chessId:id,skillIndex:index,row:10,col:4}],enemies:[{key:'enemy_1000_gopro',route:{motion:'WALK',start:[10,5],end:[10,3],checkpoints:[]}}],bonds:{leithanienShip:{active:true,count:6,tier:2,layers:30}},autoFinish:false});
  h.run(.1);const u=h.unit(id);u.hp=u.s.maxHp*.25;u.skill.gainSp(1000,'test');u.skill.activate('test');h.run(3);
  assert.equal(h.b.errorCount,0,`${id}: ${JSON.stringify(h.b.errors)}`);assert.equal(u.skill.id,data.chess[id].skills.find(s=>s.index===index).skillId);
 }
});

test('battle entry preserves enabled Leithanien operators through DataSource and Spec filtering',()=>{
 setGameData(data);
 const ids=Object.keys(data.chess).filter(id=>id.startsWith('chess_custom_leithanien_'));
 for(const suffix of ['a','b']){
  const selected=ids.filter(id=>id.endsWith('_'+suffix));
  const spec=buildBattleSpec({seed:42,kind:'normal',stageId:'act1autochess_m01',players:[{playerId:'p1',units:selected.map((chessId,i)=>({uid:i+1,chessId,row:9,col:i+2})),bonds:{leithanienShip:{active:true,count:8,layers:30}}}],spawns:[],flags:{customExtensions:{bonds:['leithanien'],stages:[]},customFactions:false}});
  const battle=createBattleFromSpec(spec,new DataSource(data,null),{quiet:true});
  assert.deepEqual(battle.allyUnits.map(u=>u.defId).sort(),selected.sort());
  battle.start();assert.ok(battle.allyUnits.filter(u=>u.kind==='op').every(u=>u.deployed&&u.alive));
  assert.deepEqual(data.chess['chess_custom_leithanien_czerny_'+suffix].bonds,['leithanienShip','steadShip']);
 }
 const disabled=buildBattleSpec({seed:42,kind:'normal',stageId:'act1autochess_m01',players:[{playerId:'p1',units:[{chessId:ids[0],row:10,col:3}],bonds:{}}],spawns:[],flags:{customExtensions:{bonds:[],stages:[]}}});
 assert.equal(createBattleFromSpec(disabled,new DataSource(data,null),{quiet:true}).allyUnits.length,0);
});

test('notes from multiple casters are recorded separately for each caster',()=>{
 const h=setup(3,0,true),second=h.unit('test2');
 h.b.dealDamage(h.u,h.e,{amount:1,type:'phys'});h.b.dealDamage(second,h.e,{amount:1,type:'phys'});h.run(1.1);
 assert.equal(h.u.stats.noteDamage,51);assert.equal(second.stats.noteDamage,52);
 assert.equal(h.u.stats.physicalDamage,1);assert.equal(second.stats.physicalDamage,1);
 assert.equal(h.b.snapshot().noteStacks[h.e.id],2);assert.equal(h.b.errorCount,0);
});

test('Leithanien description displays the current attack coefficient scaling',()=>{
 const bond=data.bonds.leithanienShip;
 assert.ok(richTextPlain(formatBondEffect(bond,600)).includes('7.00%'));
 assert.ok(richTextPlain(formatBondEffect(bond,568)).includes('6.68%'));
 assert.ok(richTextPlain(formatBondEffect(bond,400)).includes('5.00%'));
 assert.ok(bond.desc.includes('25회 중첩할 때마다 +1초'));
 assert.ok(!bond.desc.includes('[3]'));
});

 test('notes suppress floating damage numbers while retaining caster statistics',()=>{
 const h=setup(6,30);h.b.dealDamage(h.u,h.e,{amount:1,type:'arts'});const before=h.eventsOf('dmg').length;h.run(1.1);
 assert.equal(h.eventsOf('dmg').length,before);assert.ok(Math.abs(h.u.stats.noteDamage-51.3)<1e-6);
 const bond=data.bonds.leithanienShip;assert.ok(richTextPlain(formatBondEffect(bond,90,6)).includes('13초간'));assert.ok(bond.descRaw.includes('<@ba.vup>속세의 음</>'));
 });
test('Ebenholz uses two/four percent attack per three Leithanien layers',()=>{
 for(const [suffix,value] of [['a',.02],['b',.04]]){
  const rec=data.chess['chess_custom_leithanien_ebenholz_'+suffix];assert.equal(rec.customTrait.bb.count,value);
  assert.ok(data.garrisons[rec.garrisonIds[0]].desc.includes('+'+value*100+'%'));
 }
});

test('final operator tiers and Diamante affiliations match the selected changes',()=>{
 for(const suffix of ['a','b']){
  assert.equal(data.chess['chess_custom_leithanien_viviana_'+suffix].tier,5);
  assert.equal(data.chess['chess_custom_leithanien_ebenholz_'+suffix].tier,6);
  const d=data.chess['chess_custom_leithanien_diamante_'+suffix];assert.deepEqual(d.bonds,['leithanienShip','arcaneShip']);
  assert.ok(data.garrisons[d.garrisonIds[0]].desc.includes('[아케인]'));
 }
});

test('current Leithanien effect shows floored duration bonuses without per-layer formulas',()=>{
 const bond=data.bonds.leithanienShip;
 for(const [layers,bonus] of [[24,0],[25,1],[400,16]]){
  const text=richTextPlain(formatBondEffect(bond,layers,6));
  assert.ok(text.includes(`목표에게 ${10+bonus}초간`));
  assert.ok(text.includes(`지속시간 +${5+bonus}초`));
  assert.ok(text.includes(`중첩 보너스 +${bonus}초`));
  assert.ok(!text.includes('중첩당')&&!text.includes('25회 중첩'));
 }
 assert.ok(richTextPlain(formatBondEffect(bond,400,3)).includes('목표에게 5초간'));
 assert.ok(bond.desc.includes('25회 중첩할 때마다 +1초'));
});

test('note application cooldown is per caster and expires at 0.1 game seconds',()=>{
 const h=setup(3,600,true),second=h.unit('test2');
 const hit=u=>h.b.dealDamage(u,h.e,{amount:1,type:'phys'});
 hit(h.u);hit(h.u);hit(second);assert.equal(h.b.leithanien.applications,2);
 h.b.time+=.099;hit(h.u);assert.equal(h.b.leithanien.applications,2);
 h.b.time+=.001;hit(h.u);assert.equal(h.b.leithanien.applications,3);
 h.run(1.1);
 const notes=h.hooksOf('damaged').filter(c=>c.dmg.tags.includes('leithanien:note'));
 assert.ok(notes.some(c=>c.source===second&&Math.abs(c.amount-64)<1e-6));
});

 test('one caster applies notes to a new target during the first target cooldown',()=>{
 const h=setup(3,0,false,2),other=h.b.enemies.find(u=>u.id!==h.e.id);
 assert.ok(other);h.b.dealDamage(h.u,h.e,{amount:1,type:'phys'});
 h.b.time+=.05;h.b.dealDamage(h.u,other,{amount:1,type:'phys'});h.b.dealDamage(h.u,h.e,{amount:1,type:'phys'});
 assert.equal(h.b.leithanien.applications,2);assert.equal(h.b.snapshot().noteStacks[other.id],1);
 h.b.time+=.05;h.b.dealDamage(h.u,h.e,{amount:1,type:'phys'});assert.equal(h.b.leithanien.applications,3);
 });


test('Viviana belongs to Kazimierz in both forms',()=>{
 for(const suffix of ['a','b'])assert.ok(data.chess['chess_custom_leithanien_viviana_'+suffix].bonds.includes('kazimierzShip'));
 assert.ok(data.bonds.kazimierzShip.members.includes('chess_custom_leithanien_viviana_a'));
});

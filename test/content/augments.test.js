import {test} from 'node:test';import assert from 'node:assert/strict';
import {makeBattle,chessRec,enemyRec} from '../helpers/battleHarness.js';
import {install} from '../../server/sim/content/augments.js';import {createAugmentCatalog} from '../../shared/augments.js';import {loadData} from '../../server/data.js';
const data=loadData('content/production/data'),catalog=createAugmentCatalog(data,10),find=(name,side='ally')=>catalog.find(a=>a.name===name&&a.side===side),item=a=>({id:a.id,effect:a.effect});
function fixture({allies=[],enemies=[],kind='normal',skill=null,hp=1e6,hitCount=false,content='none'}={}){
 const h=makeBattle({kind,defs:{chess:{op:chessRec({id:'op',stats:{atk:100,maxHp:1000,def:100,res:10,aspd:100,bat:1,block:1},skill})},enemies:{enemy_test:enemyRec({key:'enemy_test',hp,atk:100,def:100,res:20,speed:0})}},content,extraContent:[{install}],setup:b=>b.on('deploy',({unit})=>{if(unit.side==='ally')unit.atkCd=1e6;}),units:[{chessId:'op',row:kind==='boss'?2:10,col:4}],enemies:[{key:'enemy_test',pos:[kind==='boss'?2:10,5]}],flags:{augments:{allies:{p1:allies.map(item)},enemies:enemies.map(item)}},autoFinish:false});h.run(.1);const u=h.unit('op'),e=h.enemy('enemy_test');if(hitCount)h.b.addBuff(e,{key:'test:frequency',flags:{hitCount:true}});return {h,u,e};
}
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
test('ally/enemy stat augments apply immediately to the right camp, including spawned enemies',()=>{
 const {h,u,e}=fixture({allies:[find('공격력 증가 I'),find('HP 증가 I'),find('마법 저항 증가 I')],enemies:[find('공격력 증가 II','enemy'),find('HP 증가 II','enemy')]});
 close(u.s.atk,120);close(u.s.maxHp,1200);close(u.hp,1200);close(u.s.res,25);close(e.s.atk,125);close(e.s.maxHp,1.25e6);close(e.hp,e.s.maxHp);
 const spawn=h.spawn('enemy_test',{pos:[10,6]});close(spawn.s.atk,125);
});
test('personal slow/weak effects never enter cooperative or boss battles and stack independently',()=>{
 const effects=[find('감속 I'),find('약화 II'),find('약화 I')];
 for(const kind of ['normal','unite','boss']){const {e}=fixture({kind,allies:effects});close(e.s.atk,kind==='normal'?100*.75*.85:100);}
});
test('enemy shields, silence immunity, regeneration and status extension work with their stated scopes',()=>{
 const {h,u,e}=fixture({enemies:[find('실드 II','enemy'),find('극복','enemy'),find('재생 I','enemy'),find('상태이상 증가 II','enemy')]});
 assert.equal(h.b.applyStatus(e,'silence',{duration:3,source:u}),false);assert.ok(h.b.applyStatus(u,'stun',{duration:2,source:e}));close(u.findBuff('stun').duration,3);
 for(let i=0;i<3;i++)assert.equal(h.b.dealDamage(u,e,{amount:100,type:'true'}),0);assert.equal(h.b.dealDamage(u,e,{amount:100,type:'true'}),100);const before=e.hp;h.run(1);assert.ok(e.hp>=before+14);
});
test('frequency enemies receive no regeneration',()=>{
 const h=makeBattle({defs:{enemies:{enemy_test:enemyRec({key:'enemy_test',hp:10,speed:0})}},content:'none',extraContent:[{install:b=>{b.on('deploy',({unit})=>{if(unit.side==='enemy')b.addBuff(unit,{key:'freq',flags:{hitCount:true}});});}},{install}],enemies:[{key:'enemy_test',pos:[10,5]}],flags:{augments:{allies:{},enemies:[item(find('재생 III','enemy'))]}},autoFinish:false});h.run(.1);const e=h.enemy('enemy_test');assert.equal(e.s.hpRegen,0);
});
test('corrosion reaches exactly fifty stacks and persists in snapshots',()=>{
 const {h,u,e}=fixture({allies:[find('부식')]});for(let n=0;n<100;n++)h.b.dealDamage(u,e,{amount:1,type:'true'});close(e.s.def,50);close(e.s.res,10);assert.equal(h.b.snapshot().corrosionStacks[e.id],50);
});
test('weakness uses whichever mitigation yields more damage',()=>{
 const {h,u,e}=fixture({allies:[find('약점 공격')]});const damage=h.b.dealDamage(u,e,{amount:100,type:'phys'});close(damage,80);close(u.s.atk,115);
});
test('archmage SP cost rounds up after the forty-percent reduction and remains stable',()=>{
 const skill={skillId:'test',spCost:11,initSp:0,spType:'INCREASE_WITH_TIME',skillType:'MANUAL',duration:0};const {u}=fixture({allies:[find('아츠 마스터 III')],skill});assert.equal(u.skill.spCost,7);u.skill.spCostMul=.5;assert.equal(u.skill.spCost,3);
});
test('enemy elemental damage and elemental buildup scale once, not twice',()=>{
 const {h,u,e}=fixture({enemies:[find('원소 피해 증가 III','enemy')]});const before=u.hp;h.b.dealDamage(e,u,{amount:100,type:'elemental'});close(before-u.hp,150);
});
for(const [name,aspd]of [['기습 I',140],['기습 II',180]])test(`${name} deployment attack speed lasts thirty seconds`,()=>{
 const {h,u}=fixture({allies:[find(name)]});close(u.s.aspd,aspd);h.run(29);close(u.s.aspd,aspd);h.run(1);close(u.s.aspd,100);
});
test('extra attack launches at a 0.18-second interval and can recursively proc',()=>{
 const {h,u}=fixture({allies:[{id:'forced-extra',effect:{kind:'extraAttack',probability:1}}]});let attacks=0;h.b.on('attack',({attacker})=>{if(attacker===u)attacks++;});h.b.forceAttack(u);assert.equal(attacks,1);h.run(.69);assert.equal(attacks,2);h.run(.5);assert.ok(attacks>=4);u.alive=false;const stopped=attacks;h.run(.3);assert.equal(attacks,stopped);
});

test('skill SP recovery works while duration skills are active, and Sargon stacks expire individually',()=>{
 const skill={skillId:'test',spCost:30,initSp:0,spType:'INCREASE_WITH_TIME',skillType:'MANUAL',duration:25};
 const {h,u}=fixture({allies:[find('신속 I'),find('사르곤')],skill,content:'generic'});u.skill.gainSp(1000,'test');u.skill.activate('test');h.run(.05);assert.ok(u.skill.active);close(u.skill.sp,3);close(u.s.aspd,112);
 h.run(5);h.b.emit('skillStart',{unit:u});h.run(.05);close(u.s.aspd,124);h.run(10);close(u.s.aspd,112);h.run(5);close(u.s.aspd,100);
});
test('breakthrough includes enemies not yet spawned when the field is surrendered',()=>{
 const h=makeBattle({defs:{enemies:{enemy_test:enemyRec({key:'enemy_test',hp:100,lpr:1})}},content:'none',extraContent:[{install}],enemies:[{key:'enemy_test',time:50}],flags:{augments:{allies:{},enemies:[item(find('돌파','enemy'))]}},autoFinish:false});h.run(.1);h.b.forceEnd('surrender');const leaks=h.b.result().perPlayer.p1.leaked;assert.equal(leaks.length,1);assert.equal(leaks[0].lpr,2);
});

test('enemy elemental buildup uses the same once-only multiplier as elemental damage',()=>{
 const {h,u,e}=fixture({enemies:[find('원소 피해 증가 III','enemy')]});h.b.dealDamage(e,u,{amount:100,type:'element',element:'apoptosis'});close(u.elem.apoptosis,150);
});

test('all-enemy HP augments also increase frequency HP without granting regeneration',()=>{
 const h=makeBattle({defs:{enemies:{enemy_test:enemyRec({key:'enemy_test',hp:10,speed:0})}},content:'none',extraContent:[{install:b=>b.on('deploy',({unit})=>{if(unit.side==='enemy')b.addBuff(unit,{key:'freq',flags:{hitCount:true}});})},{install}],enemies:[{key:'enemy_test',pos:[10,5]}],flags:{augments:{allies:{},enemies:[item(find('HP 증가 III','enemy')),item(find('재생 III','enemy'))]}},autoFinish:false});h.run(.1);const e=h.enemy('enemy_test');assert.equal(e.s.maxHp,14);assert.equal(e.s.hpRegen,0);
});

test('per-second recovery augments also recover attack and defensive SP types',()=>{
 for(const spType of ['INCREASE_WHEN_ATTACK','INCREASE_WHEN_TAKEN_DAMAGE']){
  const skill={skillId:'test',spCost:100,initSp:0,spType,skillType:'MANUAL',duration:25};const {h,u}=fixture({allies:[find('SP 회복 증가 II')],skill,content:'generic'});
  assert.notEqual(u.skill.spType,'time');const before=u.skill.sp;h.run(2);close(u.skill.sp-before,.4);
 }
});

test('swordmaster uses a thirty-five percent proc threshold',()=>{
 const augment=find('소드마스터 III');assert.equal(augment.effect.probability,.33);
 for(const [roll,expected]of [[.329,2],[.33,1]]){const {h,u}=fixture({allies:[augment]});let attacks=0;h.b.on('attack',({attacker})=>{if(attacker===u)attacks++;});h.b.rng=()=>roll;h.b.forceAttack(u);h.run(.69);assert.equal(attacks,expected);u.alive=false;}
});

test('extra attacks preserve the remaining normal-attack cooldown',()=>{
 const {h,u}=fixture({allies:[{id:'test-extra',effect:{kind:'extraAttack',probability:1}}]});u.atkCd=.8;let attacks=0;h.b.on('attack',({attacker})=>{if(attacker===u)attacks++;});h.b.forceAttack(u);h.run(.69);assert.equal(attacks,2);assert.ok(u.atkCd<.8&&u.atkCd>.05,`extra attack reset cooldown: ${u.atkCd}`);u.alive=false;
});

test('runtime enemies never advance the stage enemy counter but leaks retain HP loss',async()=>{
 const {snapHud}=await import('../../public/js/ui/gameLogic.js');const {h,u,e}=fixture();const originalTotal=h.b.total,child=h.b.spawnEnemy('enemy_test',{pos:[10,5]});assert.equal(child.inTotal,false);h.b.kill(child,u);assert.equal(h.b.killed,1);assert.equal(snapHud(h.b.snapshot()).resolved,0);assert.equal(h.b.total,originalTotal);
 const escaped=h.b.spawnEnemy('enemy_test',{pos:[10,5]});escaped.lpr=3;h.b.leak(escaped);const leak=h.b.result().perPlayer.p1.leaked.at(-1);assert.equal(leak.lpr,3);assert.equal(leak.counted,true);assert.equal(snapHud(h.b.snapshot()).resolved,0);h.b.kill(e,u);assert.equal(snapHud(h.b.snapshot()).resolved,1);
});

test('swordmaster waits for the full current recovery and serializes each bonus animation',()=>{
 const {h,u}=fixture({allies:[{id:'queue',effect:{kind:'extraAttack',probability:1}}]});u.def={...u.def,attackTiming:{front:{attack:{dur:1,hit:.4}}}};const starts=[],emit=h.b._ev;h.b._ev=function(ev){if(ev[0]==='atkStart'&&ev[1]===u.id)starts.push({t:this.time,lead:ev[3],interval:ev[4]});return emit.call(this,ev);};const hit=h.b.time;h.b.forceAttack(u);h.run(.55);assert.equal(starts.length,0,'the original attack is still recovering');h.run(.45);assert.ok(starts.length>=2);assert.ok(starts[0].t>=hit+.6-1e-9,'the normal clip finishes before the bonus starts');assert.equal(starts[0].interval,.18);close(starts[0].lead,.072);for(let i=1;i<starts.length;i++)assert.ok(starts[i].t>=starts[i-1].t+.18-1e-9,'bonus clips never interrupt each other');u.alive=false;const stopped=starts.length;h.run(.5);assert.equal(starts.length,stopped);
});

test('regeneration augments stop when an enemy becomes hit-count after deployment',()=>{
 for(const flag of ['hitCount','hitCountArts']){
  const {h,e}=fixture({enemies:[find('재생 III','enemy')]});
  assert.ok(e.s.hpRegen>0);
  h.b.addBuff(e,{key:'late-frequency',flags:{[flag]:true}});
  assert.equal(e.s.hpRegen,0);
  e.hp=e.s.maxHp-3;const hp=e.hp;h.run(1);assert.equal(e.hp,hp);
 }
});

for(const [name,chance]of [['회피 I',.25],['회피 II',.35],['회피 III',.5]])test(`${name} grants the stated physical and magical dodge`,()=>{const {u}=fixture({allies:[find(name)]});close(u.s.dodgePhys,chance);close(u.s.dodgeArts,chance);});
for(const [name,amount]of [['무사 I',30],['무사 II',50],['무사 III',80]])test(`${name} heals the operator once per attack`,()=>{const {h,u}=fixture({allies:[find(name)]});u.hp=500;h.b.forceAttack(u);close(u.hp,500+amount);});
test('Siracusa augment grants stealth to operators and Karlans eye reveals only the personal field',async()=>{
 const {enemyStealthed}=await import('../../server/sim/targeting.js');const {u}=fixture({allies:[find('시라쿠사')]});assert.equal(u.s.flags.stealth,true);
 for(const kind of ['normal','unite','boss','hidden']){const {h,e}=fixture({kind,allies:[find('카란의 눈')]});h.b.addBuff(e,{key:'late-stealth',flags:{stealth:true}});assert.equal(enemyStealthed(e),kind!=='normal');}
});

for(const [tier,pct,res,aspd]of [['I',10,8,10],['II',20,15,20],['III',30,30,30]])test(`enemy allied reductions ${tier} apply to allies rather than enemies`,()=>{
 const names=['공격력','HP','방어력','마법 저항','공격 속도'].map(n=>find(`아군 ${n} 감소 ${tier}`,'enemy'));const {u,e}=fixture({enemies:names});close(u.s.atk,100*(1-pct/100));close(u.s.maxHp,1000*(1-pct/100));close(u.s.def,100*(1-pct/100));close(u.s.res,Math.max(0,10-res));close(u.s.aspd,100-aspd);close(e.s.atk,100);close(e.s.maxHp,1e6);close(e.s.def,100);close(e.s.res,20);close(e.s.aspd,100);
});
for(const [tier,rate]of [['I',10],['II',20],['III',30]])test(`enemy allied drain ${tier} removes HP per second irrespective of defenses`,()=>{
 const {h,u,e}=fixture({enemies:[find(`아군 지속 피해 ${tier}`,'enemy')]});h.b.addBuff(e,{key:'disarm-test',flags:{disarm:true}});h.b.addBuff(u,{key:'armor-test',mods:{defFlat:1e6,resFlat:90}});const before=u.hp;h.run(1);close(u.hp,before-rate);assert.ok(u.alive);
});

test('structural devices ignore enemy max HP reduction and continuous HP drain while operators retain them',()=>{
 const{h,u}=fixture({enemies:[find('아군 HP 감소 III','enemy'),find('아군 지속 피해 III','enemy')]});
 const device=h.b.spawnDevice('crate',9,3,{hp:100,obstacle:true});assert.ok(device);close(device.s.maxHp,100);const hp=device.hp,before=u.hp;h.run(1);close(device.hp,hp);close(u.hp,before-30);
});
for(const [grade,percent]of [['I',10],['II',20],['III',33]])test(`Swordmaster ${grade} uses the requested probability`,()=>assert.equal(find(`소드마스터 ${grade}`).effect.probability,percent/100));
for(const [grade,percent]of [['I',10],['II',20],['III',40]])test(`Arts master ${grade} reduces maximum SP with upward rounding`,()=>{
 const skill={skillId:'test',spCost:11,initSp:0,spType:'INCREASE_WITH_TIME',skillType:'MANUAL',duration:0};const {u}=fixture({allies:[find(`아츠 마스터 ${grade}`)],skill});assert.equal(u.skill.spCost,Math.ceil(11*(1-percent/100)));
});
for(const [grade,multiplier]of [['I',1.1],['II',1.2],['III',1.35]])test(`damage increase ${grade} multiplies physical, magical and true damage`,()=>{
 const {h,u,e}=fixture({allies:[find(`피해 증가 ${grade}`)]});for(const [type,base]of [['phys',5],['arts',80],['true',100]])close(h.b.dealDamage(u,e,{amount:100,type}),base*multiplier);
});
test('Victoria grants thirty percent attack per equipped item',()=>{
 const {h,u}=fixture({allies:[find('빅토리아')]});u.items=['a','b'];h.b.emit('deploy',{unit:u});close(u.s.atk,160);u.items=['a'];h.b.emit('deploy',{unit:u});close(u.s.atk,130);
});

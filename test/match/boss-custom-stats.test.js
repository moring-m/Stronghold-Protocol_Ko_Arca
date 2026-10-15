import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATA,makeMatch} from './harness.js';
import {bossPoolHp} from '../../server/match/finalAssault.js';
import {applyCustomExtensions} from '../../shared/customExtensions.js';
import {makeBattle,chessRec,enemyRec} from '../helpers/battleHarness.js';
import {createBattleFromSpec} from '../../server/sim/spec.js';
import {hurt} from '../../server/sim/content/enemies.js';
import {buildBossWave} from '../../server/match/waves.js';
import {GameData} from '../../server/match/gamedata.js';
import {createRng} from '../../server/sim/rng.js';

for(const mode of ['coop','coop8'])for(const hidden of [false,true])for(const clientCombat of [false,true]){
 test(`${mode} ${hidden?'hidden':'final'} ${clientCombat?'client':'server'}: actual round pool and public HP use 1000% exactly once`,t=>{
  const h=makeMatch({mode,difficulty:'HARD',humans:mode==='coop8'?8:4,fake:!clientCombat,clientCombat,clients:false,customExtensions:{bonds:[],stages:[],ruleValues:{bossHp:1000,enemyHp:200}}}).start();t.after(()=>h.m.dispose());
  const m=h.m;for(const p of m.players.values()){p.lp=30;p.bandId=m.gd.bandIds()[0];}m.round=hidden?m.gd.hiddenRound:m.gd.bossRound;
  m.startFinalAssault(hidden);
  const id=hidden?m.hiddenBossId:m.bossId;
  const baseline=new GameData({...DATA,config:{...DATA.config,coop8:mode==='coop8'}},m.modeId);
  const expected=bossPoolHp(baseline,id,mode==='coop8'?8:4)*10;
  assert.equal(m.bossPool.maxHp,expected);assert.equal(m.publicView().bossHp.max,expected);
  assert.equal(m.bossPool.maxHp,m.gd.bossPoolHp(id,mode==='coop8'?8:4));
  if(clientCombat)for(const field of m.fields){
   assert.equal(field.spec.boss.poolMax,expected);
   const battle=createBattleFromSpec(JSON.parse(JSON.stringify(field.spec)),DATA,{quiet:true});
   const spawn=field.spec.spawns.find(s=>s.tag==='boss');
   const boss=battle.spawnEnemy(spawn.enemyKey,{...spawn});
   assert.equal(boss.s.maxHp,expected);assert.equal(boss.hp,expected);
   assert.equal(battle.snapshot().boss.max,expected);
  }
 });
}

const values={bossHp:1000,bossAtk:200,bossDef:150,bossRes:200,bossSpeed:150,bossAspd:200};
const source=applyCustomExtensions(DATA,{bonds:[],stages:[],ruleValues:values});
const gd=new GameData(DATA,'mode_multi_hard');
for(const id of Object.keys(DATA.bosses)){
 test(`${id}: real boss template stats obey custom ratios after native spawn hooks`,()=>{
  const wave=buildBossWave(gd,createRng(1),[],gd.bossRound,{bossId:id,solo:false});
  assert.ok(wave.spawns.some(s=>s.tag==='boss'));
  for(const spawn of [...wave.spawns.filter(s=>s.tag==='boss'),...(DATA.bosses[id].parts||[]).map(enemyKey=>({enemyKey,tag:'part'}))]){
   const opts={kind:id==='boss_8'||id==='boss_9'||id==='boss_10'?'hidden':'boss',autoFinish:false,content:'full'};
   const a=makeBattle({...opts,data:DATA}),b=makeBattle({...opts,data:source});a.b.enemyOverrides=wave.overrides;b.b.enemyOverrides=wave.overrides;
   const base=a.spawn(spawn.enemyKey,{...spawn,pos:[3,7]}),scaled=b.spawn(spawn.enemyKey,{...spawn,pos:[3,7]});
   for(const [stat,ratio]of [['maxHp',10],['atk',2],['def',1.5],['res',2],['moveSpeed',1.5],['aspd',2]]){
    // The engine caps resistance at 100 and attack speed at 600.
    const fixedHits=stat==='maxHp'&&(base.s.flags.hitCount||base.s.flags.hitCountArts);
    const expected=fixedHits?base.s[stat]:stat==='res'?Math.min(100,base.s[stat]*ratio):stat==='aspd'?Math.min(600,base.s[stat]*ratio):base.s[stat]*ratio;
    assert.ok(Math.abs(scaled.s[stat]-expected)<1e-6,`${spawn.enemyKey} ${stat}: ${scaled.s[stat]} expected ${expected}`);
   }
   assert.ok(Math.abs(scaled.s.interval-base.s.interval/2)<1e-6,`${spawn.enemyKey}: actual attack interval`);
  }
 });
}

test('configured boss ATK, DEF, RES and speed affect actual damage, attacks and movement',()=>{
 const raw={...DATA,enemies:{...DATA.enemies,enemy_test_stats:enemyRec({key:'enemy_test_stats',hp:1e8,atk:100,def:100,res:20,speed:1,bat:1})},chess:{...DATA.chess,t_wall:chessRec({id:'t_wall',profession:'TANK',stats:{atk:0,maxHp:1e7,def:0,res:0,blockCnt:1},skill:null})}};
 const outcomes=[];
 for(const ruleValues of [{},values]){
  const data=applyCustomExtensions(raw,{bonds:[],stages:[],ruleValues});
  const h=makeBattle({kind:'boss',data,content:'generic',autoFinish:false,units:[{chessId:'t_wall',row:3,col:6}],kits:{t_wall:()=>({trait:{noAttack:true}})}});h.step();
  const e=h.spawn('enemy_test_stats',{pos:[3,6],tag:'boss',mods:{speedMul:0}}),u=h.unit('t_wall');
  const hp=u.hp;hurt(h.b,e,u,e.s.atk,'phys');const dealt=hp-u.hp;
  let before=e.hp;hurt(h.b,u,e,1000,'phys');const physical=before-e.hp;
  before=e.hp;hurt(h.b,u,e,1000,'arts');const magical=before-e.hp;
  const times=[];h.b.on('attack',c=>{if(c.attacker===e)times.push(h.b.time);});h.run(5);
  assert.ok(times.length>=2);outcomes.push({dealt,physical,magical,interval:times[1]-times[0]});
  const moving=makeBattle({kind:'boss',data,content:'generic',autoFinish:false});moving.step();
  const walker=moving.spawn('enemy_test_stats',{pos:[3,8],tag:'boss',route:{motion:'WALK',start:[3,8],end:[3,2]}});const x=walker.x;moving.run(1);outcomes.at(-1).distance=x-walker.x;
 }
 const [base,changed]=outcomes;assert.equal(base.dealt,100);assert.equal(changed.dealt,200);assert.equal(base.physical,900);assert.equal(changed.physical,850);assert.equal(base.magical,800);assert.equal(changed.magical,600);
 assert.ok(Math.abs(changed.distance/base.distance-1.5)<1e-6);assert.ok(Math.abs(changed.interval/base.interval-.5)<.06);
});

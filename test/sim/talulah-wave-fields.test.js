import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeBattle} from '../helpers/battleHarness.js';
import {eightUniteStage,EIGHT_UNITE_RECT} from '../../shared/cooperativeEight.js';
import {dirVec} from '../../server/sim/dir.js';
const data=loadData(new URL('../../content/production/data/',import.meta.url).pathname);
const id='chess_custom_recruit_talulah_6_b';
function fire({eight=false,stageId='custom_snowfield',dir='UP',col=10,over=true}={}){
 const stage=eight?eightUniteStage(data.stages[stageId]):data.stages[stageId];
 const h=makeBattle({data,stage,kind:'unite',rect:eight?EIGHT_UNITE_RECT:undefined,units:[{chessId:id,row:10,col,dir,skillIndex:2}],enemies:[],autoFinish:false,timeLimit:120});
 h.run(1.2);const u=h.unit(id);u.skill.gainSp(1000);assert.ok(u.skill.activate('test'));
 if(over){
  // Isolate the overdrive volley after separately testing the immediate normal volley.
  u.mem.talulah.waves=[];h.eventsOf('fx');h.events.length=0;u.skill.timeLeft=u.skill.duration*.49;u.mem.talulah.waveClock=Number(u.skill.bb.overload_interval);h.step();
 }
 const waves=u.mem.talulah.waves.slice();assert.ok(waves.length);return{h,u,waves};
}
for(const eight of [false,true])for(const stageId of ['custom_snowfield','act1autochess_m01','act2autochess_m01'])for(const dir of ['UP','DOWN','LEFT','RIGHT'])for(const over of [false,true])for(const position of ['left','middle','right'])test(`${eight?8:4}p ${stageId} ${dir} ${over?'overdrive':'normal'} ${position}: no missing in-field lanes, fired waves reach the far edge`,()=>{
 const col=position==='left'?2:position==='right'?(eight?34:18):(eight?18:10),{h,u,waves}=fire({eight,stageId,dir,col,over}),[dr,dc]=dirVec(dir),R=h.b.rect;
 const half=Number(u.skill.bb[over?'overload_half_width':'normal_half_width']);
 const lanes=[];for(let lane=-half;lane<=half;lane++){const r=10+dc*lane,c=col-dr*lane;if(h.b.grid.inRect(r,c))lanes.push(lane);}
 assert.deepEqual(waves.map(w=>w.lane),lanes);
 const events=h.eventsOf('fx').filter(e=>e[1]==='talulahWave');assert.equal(events.length,lanes.length);
 for(const e of events){const x=e[2],y=e[3],extra=e[4],behind=(col-x)*dc+(10-y)*dr;assert.ok(behind>=0&&behind<=11);assert.ok(h.b.grid.inRect(y,x));const edge=dr?(dr>0?R.r1+.5:R.r0-.5):(dc>0?R.c1+.5:R.c0-.5),end=(dr?y:x)+(dr||dc)*extra.speed*extra.dur;assert.ok(Math.abs(end-(edge+(dr||dc)*5))<1e-6);}
 u.skill.end('test');u.skill.noSkill=true;assert.equal(u.mem.talulah.waves.length,waves.length);
 const edge=dr?(dr>0?R.r1+.5:R.r0-.5):(dc>0?R.c1+.5:R.c0-.5),sign=dr||dc;
 assert.ok(h.runUntil(()=>waves.every(w=>sign*((dr?w.y:w.x)-edge)>=0),30),'every emitted lane must cross the distant field edge');
 h.run(5);assert.equal(u.mem.talulah.waves.length,0);assert.deepEqual(h.b.errors,[]);
});
test('a missing flame at an enemy is a per-lane impact, not a gap in spawning',()=>{
 const {h,u,waves}=fire();const center=waves.find(w=>w.lane===0),other=waves.find(w=>w.lane===3),before=waves.length;
 const rec=data.enemies.enemy_1010_demon;const enemy=h.b.spawnEnemy({...rec,stats:{...rec.stats,maxHp:1e8,atk:0,moveSpeed:0}},{pos:[center.y+1,center.x]});
 assert.ok(enemy);h.run(.35);assert.ok(!u.mem.talulah.waves.includes(center));assert.ok(u.mem.talulah.waves.includes(other));assert.equal(u.mem.talulah.waves.length,before-1);
 assert.ok(h.eventsOf('fx').some(e=>e[1]==='talulahWaveHit'&&e[4].lane===0));
});
test('overlapping casts retain unique wave identities instead of replacing the previous projectiles',()=>{
 const {h,u,waves}=fire({eight:true,dir:'RIGHT',col:2});u.skill.end('test');u.skill.gainSp(1000);u.mem.skillCastUntil=0;assert.ok(u.skill.activate('test'));u.mem.talulah.waveClock=Number(u.skill.bb.normal_interval);h.step();
 const next=u.mem.talulah.waves.filter(w=>!waves.includes(w));assert.ok(next.length);assert.notEqual(next[0].serial,waves[0].serial);assert.ok(waves.every(w=>u.mem.talulah.waves.includes(w)));
});

test('retreating the caster does not freeze or erase an already-fired projectile',()=>{
 const {h,u,waves}=fire({eight:true,dir:'RIGHT',col:2});const first=waves[0],x=first.x;
 h.b.retreat(u,{reason:'test'});assert.ok(waves.every(w=>u.mem.talulah.waves.includes(w)));h.run(.5);assert.ok(first.x>x);h.run(30);assert.equal(u.mem.talulah.waves.length,0);assert.deepEqual(h.b.errors,[]);
});

for(const dir of ['UP','DOWN','LEFT','RIGHT'])test(`Talulah ${dir}: first volley spawns on activation, second volley waits the normal interval`,()=>{
 const {h,u}=fire({dir,over:false});const born=h.eventsOf('fx').filter(e=>e[1]==='talulahWave');assert.ok(born.length);assert.equal(u.mem.talulah.waveSerial,1);assert.ok(born.every(e=>Math.abs(e[4].born-h.b.time)<1e-9));const interval=Number(u.skill.bb.normal_interval);h.run(interval-.1);assert.equal(u.mem.talulah.waveSerial,1);h.run(.2);assert.equal(u.mem.talulah.waveSerial,2);
});

test('custom rule skillMotionAspd: S3 fires its waves at the normal interval / (ASPD / 100); off, at the authored interval', () => {
 const counts = {};
 for (const on of [false, true]) {
  const h=makeBattle({data,stage:data.stages.custom_snowfield,kind:'unite',units:[{chessId:id,row:10,col:10,dir:'UP',skillIndex:2}],enemies:[],autoFinish:false,timeLimit:120});
  h.b.data.raw={...(h.b.data.raw||{}),config:{...(h.b.data.raw?.config||{}),customRules:on?{skillMotionAspd:true}:{}}};
  h.run(1.2);const u=h.unit(id);u.skill.gainSp(1000);assert.ok(u.skill.activate('test'));
  const iv=Number(u.skill.bb.normal_interval),before=u.mem.talulah.waveSerial;
  // within the first (normal) half: 4 authored intervals
  const run=Math.min(u.skill.duration*.45,iv*4+.01);
  for(let t=0;t<run;t+=h.b.dt){u.s.aspd=200;h.step();}
  counts[on]=u.mem.talulah.waveSerial-before;
  assert.deepEqual(h.b.errors,[]);
 }
 assert.ok(counts[true] >= counts[false] * 2 - 1, `twice the waves at ASPD 200: ${counts[false]} -> ${counts[true]}`);
});

import{test,before,after}from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{installFakePixi}from'./fakepixi.js';import{loadData}from'../../server/data.js';import{makeBattle}from'../helpers/battleHarness.js';
const data=loadData(new URL('../../content/production/data/',import.meta.url).pathname),key='enemy_1158_divman',id='chess_char_3_01_a';let fake,SpineActor;
before(async()=>{fake=installFakePixi();({SpineActor}=await import('../../public/js/render/spine.js'));});after(()=>fake.restore());
const entry=data.assets.enemies[key].spine;
function actor(fromStrike=true){const a=new SpineActor({animations:Object.keys(entry.animations).map(name=>({name}))},entry);a.clipPerAttack=true;a.attackFromStrike=fromStrike;return a;}
test('a diver whose initial wind-up was missed resumes at its real strike frame, never from the start',()=>{
 const a=actor();a.setBase('move');a.attack(2.7);
 assert.equal(a.current,'Attack01');assert.equal(a.spine.state.tracks[0].trackTime,.467);
 a.update(.35);assert.equal(a.current,'Attack01');a.update(.02);assert.equal(a.current,'Move01');
});
for(const missed of [false,true])for(const aspd of [100,200,600])test(`diver movement and displayed recovery agree at ASPD ${aspd}, missed start ${missed}`,()=>{
 const guard={...data.chess[id],stats:{...data.chess[id].stats,maxHp:1e8,atk:0,blockCnt:0}},enemy={...data.enemies[key],stats:{...data.enemies[key].stats,aspd}};
 const h=makeBattle({content:'generic',data:{...data,chess:{...data.chess,[id]:guard},enemies:{...data.enemies,[key]:enemy}},units:[{chessId:id,row:10,col:5}],enemies:[{key,route:{motion:'WALK',start:[10,4],end:[10,0],checkpoints:[]}}],autoFinish:false});
 const a=actor();let events=[],samples=[],shown,interval=2.7,lastX,attacks=0,movements=0;
 for(let frame=0;frame<600;frame++){
  const t=frame/60;while(h.b.time<=t+1e-9){h.step();const enemy=h.enemy();if(enemy)samples.push({t:h.b.time,x:enemy.x,moving:enemy.moving});for(const e of h.events.splice(0))events.push([h.b.time,e]);}
  const e=h.enemy();if(!e)break;
  while(events.length&&events[0][0]<=t+1e-9){const[,ev]=events.shift();if(ev[1]!==e.id)continue;
   if(ev[0]==='atkStart'){interval=ev[4];if(!missed)a.beginAttack(interval,ev[3]);}
   if(ev[0]==='atk'){attacks++;a.attack(interval);}
  }
  while(samples.length&&samples[0].t<=t+1e-9)shown=samples.shift();
  if(!shown)continue;
  a.setBase(shown.moving?'move':'idle');a.update(1/60);
  if(lastX!==undefined&&shown.x!==lastX){movements++;assert.notEqual(a.mode,'attack',`moving during ${a.current} at t=${t}, track=${a.spine.state.tracks[0].trackTime}`);}
  lastX=shown.x;
 }
 assert.ok(attacks>0);if(aspd<=200)assert.ok(movements>0);assert.equal(h.b.errorCount,0);a.destroy();
});
test('normal enemy wind-up still plays from frame zero, while the existing operator fallback is preserved',()=>{
 const a=actor();a.beginAttack(2.7,.467);assert.equal(a.spine.state.tracks[0].trackTime,0);a.update(.467);const track=a.spine.state.tracks[0];a.attack(2.7);assert.equal(a.spine.state.tracks[0],track);
 const op=actor(false);op.attack(2.7);assert.equal(op.spine.state.tracks[0].trackTime,0);
});

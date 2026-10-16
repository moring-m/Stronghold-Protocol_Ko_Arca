import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync,readdirSync} from 'node:fs';
import {FxWiring} from '../../public/js/render/vfx/wiring.js';
import {compileEffect,Effect} from '../../public/js/render/vfx/effect.js';
const yaw={RIGHT:0,UP:Math.PI/2,LEFT:Math.PI,DOWN:-Math.PI/2};
const near=(a,b)=>assert.ok(Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)))<1e-6,`${a} != ${b}`);
const assetRoot=new URL('../../public/assets/local/fx/',import.meta.url);
function harness(def,late=false){
 let loaded=!late,last;
 const ofx={lib:{has:()=>true,def:()=>loaded?def:null},spawn:(k,p,o)=>{last={fx:new Effect(def).place(p),p,o};return last;}};
 const w=new FxWiring(ofx);w.idx={units:{},prefabs:{}};
 return {w,load:()=>{loaded=true;},get last(){return last;}};
}
const desc=(body=false)=>({key:'range',nodes:[{id:0,parent:null,pos:[0,0,0],rot:[0,0,0,1],scale:[1,1,1],behaviours:[{class:'ParticleEffect',fields:{_rotateType:2,_mainDir:1,_useBodyRotation:body?1:0,_holdByOwner:body?1:0,_rotationZ:{node:0}}}]}],materials:[],clips:[]});
for(const late of [false,true])test(`deployment-directed cast ignores target direction (${late?'cold':'warm'} prefab)`,()=>{
 for(const [dir,a]of Object.entries(yaw)){
  const h=harness(compileEffect(desc()),late);
  const v={id:1,dir,x:10,y:9};
  h.w._casts({cast:[{effects:['range'],oneshot:1,useFourDirectionalFace:1}]},v,{x:12,y:9},'all');
  if(late){h.load();h.last.o.track(h.last.fx);}
  near(h.last.fx.yaw,a);
 }
});
test('a held body-directed range follows deployment turns, including info-only views',()=>{
 const h=harness(compileEffect(desc(true))),v={id:1,x:10,y:9,info:{dir:'RIGHT'}};
 h.w.playOn('range',v,{follow:true});
 for(const [dir,a]of Object.entries(yaw)){v.info.dir=dir;h.last.o.track(h.last.fx);near(h.last.fx.yaw,a);}
});
test('target-directed attacks still aim at targets when deployment override is absent',()=>{
 const h=harness(compileEffect(desc()));
 h.w.playOn('range',{id:1,x:10,y:9,dir:'LEFT'},{toward:{x:10,y:11}});near(h.last.fx.yaw,Math.PI/2);
});
for(const key of ['mizuki_attack_01_start','mizuki_skill_02_start','mizuki_skill_03_start','lisa_skill_03_range'])test(`${key}: real helper matrices follow all four deployment directions`,{skip:!existsSync(new URL(`prefabs/${key}.json`,assetRoot))},()=>{
 const def=compileEffect(JSON.parse(readFileSync(new URL(`prefabs/${key}.json`,assetRoot),'utf8')));
 const h=harness(def),v={id:1,x:10,y:9,dir:'RIGHT'};
 for(const [dir,a]of Object.entries(yaw)){
  v.dir=dir;
  h.w.playOn(key,v,{follow:!!def.holdByOwner,toward:{x:12,y:9},useFourDirectionalFace:key.startsWith('mizuki')});
  h.last.fx._matrices();near(Math.atan2(h.last.fx.world[def.rotZ][1],h.last.fx.world[def.rotZ][0]),a-def.mainYaw);
 }
});
test('all extracted body-directed held effects update to the new deployment direction',{skip:!existsSync(new URL('prefabs/',assetRoot))},()=>{
 let count=0;
 for(const name of readdirSync(new URL('prefabs/',assetRoot))){
  if(!name.endsWith('.json'))continue;
  const def=compileEffect(JSON.parse(readFileSync(new URL(`prefabs/${name}`,assetRoot),'utf8')));
  if(!def.useBodyRotation||![2,4].includes(def.rotateType))continue;
  const h=harness(def),v={id:1,x:10,y:9,dir:'RIGHT'};h.w.playOn(def.key,v,{follow:true});
  v.dir='UP';h.last.o.track(h.last.fx);near(h.last.fx.yaw,yaw.UP);count++;
 }
 assert.equal(count,82,`audited every body-directed rotating prefab (${count})`);
});
test('every extracted four-direction emitter preserves its deployment direction',{skip:!existsSync(new URL('index.json',assetRoot))},()=>{
 const idx=JSON.parse(readFileSync(new URL('index.json',assetRoot),'utf8'));let tested=0;
 function walk(o){
  if(!o||typeof o!=='object')return;
  if(o.useFourDirectionalFace&&Array.isArray(o.effects))for(const key of o.effects){
   const file=new URL(`prefabs/${key}.json`,assetRoot);if(!existsSync(file))continue;
   const def=compileEffect(JSON.parse(readFileSync(file,'utf8')));if(![2,4].includes(def.rotateType))continue;
   const h=harness(def);for(const [dir,a]of Object.entries(yaw)){
    h.w._casts({cast:[{...o,effects:[key],startEvent:undefined}]},{id:1,x:10,y:9,dir},{x:12,y:9},'all');near(h.last.fx.yaw,a);
   }tested++;
  }
  for(const v of Object.values(o))if(v&&typeof v==='object')walk(v);
 }
 walk(idx.units);assert.ok(tested>0,`verified ${tested} directional emitter effects`);
});

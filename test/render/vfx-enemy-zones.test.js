import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {FxWiring} from '../../public/js/render/vfx/wiring.js';
import {OfficialFx} from '../../public/js/render/vfx/system.js';
import {compileEffect} from '../../public/js/render/vfx/effect.js';
const root=new URL('../../public/assets/local/fx/',import.meta.url);
const cases=[
 ['enemy_1267_nhpbr','pollution','projectile_enemy_nhpbr_polluted','toTargetOnStart','enemy_nhpbr_attack_range'],
 ['enemy_1267_nhpbr_2','pollution','projectile_enemy_nhpbr_polluted','toTargetOnStart','enemy_nhpbr_attack_range'],
 ['enemy_1272_nhtank','pollution','projectile_enemy_nhtank_polluted','onReached','enemy_nhtank_attack_range'],
 ['enemy_1272_nhtank_2','pollution','projectile_enemy_nhtank_polluted','onReached','enemy_nhtank_attack_range'],
 ['enemy_9006_actoxi','poison','projectile_enemy_actoxi','onReached','enemy_actoxi_idle'],
];
for(const [sourceDef,kind,projectile,slot,key] of cases)test(`${sourceDef}: detached official ${kind} lasts exactly as long as the sim zone`,()=>{
 const spawns=[];const ofx={active:true,time:12,lib:{has:k=>k===key,def:()=>null},spawn:(k,place,opts)=>{const h={stop(){this.stopped=true;}};spawns.push({k,place,opts,h});return h;}};
 const w=new FxWiring(ofx);w.idx={units:{[sourceDef]:{}},skins:{},projectiles:{[projectile]:{[slot]:[key]}}};
 assert.ok(w.keysFor([{id:1,info:{defId:sourceDef}}],false).includes(key));
 assert.equal(w.simFx('zone',7,8,{sourceDef,kind,r:2,dur:8}),true);
 assert.equal(w.simFx('zone',9,10,{sourceDef,kind,r:2,dur:10}),true);
 assert.equal(spawns.length,2);assert.deepEqual(spawns.map(x=>x.opts.owner),[{x:7,y:8,z:0},{x:9,y:10,z:0}]);
 assert.ok(spawns.every(x=>x.opts.loop));assert.deepEqual(ofx.timers.map(t=>t.at),[20,22]);
 ofx.timers[0].fn();assert.equal(spawns[0].h.stopped,true);assert.equal(spawns[1].h.stopped,undefined);
 ofx.active=false;assert.equal(w.simFx('zone',7,8,{sourceDef,kind,dur:8}),false);
});
for(const key of new Set(cases.map(c=>c[4])))test(`${key}: real official asset compiles and remains active until zone expiry`,{skip:!existsSync(new URL(`prefabs/${key}.json`,root))},()=>{
 const index=JSON.parse(readFileSync(new URL('index.json',root)));const row=cases.find(c=>c[4]===key);
 assert.ok(index.projectiles[row[2]][row[3]].includes(key),'binding is in the source enemy projectile');
 const def=compileEffect(JSON.parse(readFileSync(new URL(`prefabs/${key}.json`,root))));
 const ofx=new OfficialFx({P:{Container:class{}},lib:{available:true,has:k=>k===key,def:()=>def},tier:'full'});
 const w=new FxWiring(ofx);w.idx=index;
 assert.equal(w.simFx('zone',10,9,{sourceDef:row[0],kind:row[1],dur:3}),true);
 for(let i=0;i<120;i++){ofx.update(1/60);w.tick();}
 assert.equal(ofx.effects.length,1);assert.equal(ofx.effects[0].state,'play');
 for(let i=0;i<180;i++){ofx.update(1/60);w.tick();}
 assert.equal(ofx.effects.length,0);
});

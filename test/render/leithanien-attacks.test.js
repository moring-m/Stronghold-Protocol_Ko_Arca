import test from 'node:test';import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {setGameData} from '../../server/sim/content/support/index.js';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
import {installFakePixi,fakeViewCtx} from './fakepixi.js';
import {presetCamera} from '../../public/js/render/projection.js';
const data=loadData('content/production/data');
const operators=Object.values(data.chess).filter(c=>c.bonds?.includes('leithanienShip')&&!c.isGolden);
assert.equal(operators.length,10,'all ten Leithanien operators are audited');
for(const c of operators)test(`${c.name}: normal attacks emit and render a visible effect`,async()=>{
 setGameData(data);
 const raw={...data,enemies:{...data.enemies,dummy:enemyRec({key:'dummy',hp:1e9,atk:0,speed:0,def:0,res:0,rank:'ELITE'})}};
 const h=makeBattle({data:raw,units:[{chessId:c.chessId,row:10,col:4}],enemies:[{key:'dummy',route:{motion:'WALK',start:[10,4],end:[10,3],checkpoints:[]}}],autoFinish:false});
 h.run(.1);const u=h.unit(c.chessId);u.hp=u.s.maxHp*.25;if(c.subProfessionId==='phalanx'){u.skill.gainSp(1000,'test');u.skill.activate('test');}h.run(8);const e=h.enemy();const attack=h.eventsOf('atk').find(x=>x[1]===u.id);
 assert.ok(attack,'normal attack event');assert.equal(h.b.errorCount,0);
 const fake=installFakePixi();try{
  const {FxSystem}=await import('../../public/js/render/fx.js');const cam=presetCamera('normal',{width:1600,height:900});
  const src={id:u.id,x:4,y:10,z:0,_headTiles:1.2,alive:true,statuses:new Set(),info:{charId:c.charId,subProf:c.subProfessionId,rangeGrid:c.rangeGrid}},target={id:e.id,x:5,y:10,z:0,_headTiles:1.2,alive:true,maxHp:1e9,onHit(){}};
  const fx=new FxSystem({...fakeViewCtx(fake.P),cam:()=>cam,settings:{quality:'high',damageNumbers:false},screenSize:()=>({width:1600,height:900}),fieldTop:()=>120});
  fx.attack(src,target,attack[3]);fx.damage(target,100,'arts',src,{});
  assert.ok(fx.projs.length+fx.parts.length+fx.rings.length+fx.sweeps.length+fx.contacts.length>0,'visible attack/hit with damage numbers disabled');fx.destroy();
 }finally{fake.restore();}
});

import {test} from 'node:test';import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
const data=loadData('content/production/data'),id='chess_custom_leithanien_ebenholz_a';
for(const [rank,pos,expected]of [['NORMAL',[10,5],false],['ELITE',[10,5],true],['BOSS',[10,5],true],['ELITE',[3,15],false]])test(`Ebenholz S3 automatic cast: ${rank} at ${pos}`,()=>{
 const h=makeBattle({autoFinish:false,defs:{chess:{[id]:data.chess[id]},enemies:{dummy:enemyRec({key:'dummy',rank,hp:1e9,speed:0,atk:0})}},units:[{chessId:id,row:10,col:4,skillIndex:2}],enemies:[{key:'dummy',pos}]});h.step();const u=h.unit(id);assert.equal(u.skill.id,'skchr_ebnhlz_3');u.skill.gainSp(1000,'test');h.run(4);assert.equal(u.skill.activations>0,expected);assert.equal(h.b.errorCount,0);
});

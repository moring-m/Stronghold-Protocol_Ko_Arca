import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,chessRec,enemyRec,flatStage} from '../helpers/battleHarness.js';
import {bodyKeys} from '../../server/sim/body.js';
import {tileKeyOf} from '../../server/sim/targeting.js';
import {tileKey} from '../../server/sim/content/support/index.js';

test('wide cooperative fields target and damage enemies on all four fields without affecting normal battles',()=>{
 const stage=flatStage();stage.rows=stage.rows.map(row=>row+row.slice(0,16));
 stage.rows[10]='R'.repeat(37);
 const wide=makeBattle({stage,rect:{r0:9,r1:12,c0:0,c1:36},content:'generic',units:[3,11,19,27].map((col,i)=>({chessId:'test',uid:'u'+i,row:10,col})),defs:{chess:{test:chessRec({id:'test',stats:{atk:1000,maxHp:10000},skill:null,rangeGrid:[[0,0],[0,1]]})},enemies:{target:enemyRec({key:'target',hp:10,def:0,speed:0})}},autoFinish:false});
 const normal=makeBattle({content:'generic',units:[{chessId:'test',row:10,col:3}],defs:{chess:{test:chessRec({id:'test',skill:null})}},autoFinish:false});
 wide.run(.1);normal.run(.1);
 for(const u of wide.allies().filter(u=>u.kind==='op')){
  const k=10*37+u.tileC;assert.equal(tileKeyOf(u),k);assert.equal(tileKey(u),k);assert.deepEqual(bodyKeys(u),[k]);assert.ok(u.rangeKeySet.has(k+1));
  wide.spawn('target',{pos:[10,u.tileC+1]});
 }
 for(let i=0;i<60;i++){wide.step();normal.step();}
 assert.equal(wide.b.enemies.filter(e=>e.alive).length,0);
 assert.ok(wide.allies().filter(u=>u.kind==='op').every(u=>u.stats.dmg>0));
 assert.equal(normal.b.grid.cols,21);assert.equal(tileKeyOf(normal.unit('test')),10*21+3);
 assert.equal(wide.b.errorCount,0);assert.equal(normal.b.errorCount,0);
});

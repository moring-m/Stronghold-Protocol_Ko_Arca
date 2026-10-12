import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
import {loadData} from '../../server/data.js';
import {selectedSkillClip} from '../../shared/attackTiming.js';
const data=loadData();
test('Nearl S2 uses ordinary attacks on both model directions, never the withdrawal clip',()=>{
 for(const sp of Object.values(data.assets.chars.char_1014_nearl2.spine)){
  const role=selectedSkillClip(sp,1);assert.equal(role.loop,sp.anims.attack.loop);assert.equal(role.via,'attack');
 }
});
for(const [id,index] of [['chess_char_6_17_a',1],['chess_char_4_04_a',2]])test(`${id} deployment skill relocates with Raid and continues attacking`,()=>{
 const h=makeBattle({autoFinish:false,captureNoisy:true,defs:{enemies:{dummy:enemyRec({key:'dummy',hp:1e9,speed:0,atk:0})}},players:[{playerId:'p1',seat:0,bonds:{raidShip:{count:2,active:true,tier:1,layers:0}},units:[{uid:1,chessId:id,row:12,col:3,skillIndex:index}]}],enemies:[{key:'dummy',pos:[9,9]}]});
 h.run(3);const u=h.unit(id);assert.ok(u.alive&&u.deployed);assert.notDeepEqual([u.tileR,u.tileC],[12,3]);assert.ok(u.stats.dmg>0,'attacks after relocation');assert.equal(h.b.errorCount,0);
});

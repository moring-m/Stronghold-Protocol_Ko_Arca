import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle} from '../helpers/battleHarness.js';
import {hasGeneratedData} from '../../server/sim/simdata.js';
for(const key of ['enemy_1267_nhpbr','enemy_1267_nhpbr_2','enemy_9006_actoxi'])test(`${key}: death zone retains the visual source after death`,{skip:!hasGeneratedData()},()=>{
 const h=makeBattle({autoFinish:false,captureNoisy:true,enemies:[{key,pos:[9,6],mods:{speedMul:0}}]});
 h.step();const e=h.b.enemies.find(e=>e.defId===key);assert.ok(e);
 h.b.kill(e,null);h.step();
 const zone=h.eventsOf('fx').find(f=>f[1]==='zone');assert.ok(zone);
 assert.equal(zone[4].sourceDef,key);assert.ok(zone[4].dur>0);assert.equal(e.alive,false);
 assert.deepEqual(h.b.errors,[]);
});

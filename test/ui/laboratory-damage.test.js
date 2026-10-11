import {test} from 'node:test';import assert from 'node:assert/strict';
import {appendDamageSample} from '../../public/js/ui/laboratoryDamage.js';
const sample=(time,values,id='battle')=>({battleId:id,time,rows:[{id:1,values}]});
test('live DPS uses game time and ignores repeated render frames and paused time',()=>{
 const start=appendDamageSample(null,sample(0,[0,0,0,0]));
 assert.equal(appendDamageSample(start,sample(0,[0,0,0,0])),start);
 const next=appendDamageSample(start,sample(1,[100,20,10,5]));assert.deepEqual(next.points.at(-1).values,[100,20,10,5]);
 assert.deepEqual(appendDamageSample(next,sample(3,[300,60,30,15])).points.at(-1).values,[100,20,10,5]);
 assert.equal(appendDamageSample(next,sample(1,[100,20,10,5])),next);
});
test('live chart retains at most sixty seconds and resets for another battle',()=>{
 let state=null;for(let t=0;t<=120;t++)state=appendDamageSample(state,sample(t,[t,0,0,0]));
 assert.equal(state.points[0].time,60);assert.equal(state.points.length,61);
 assert.equal(appendDamageSample(state,sample(0,[0,0,0,0],'new')).points.length,1);
});

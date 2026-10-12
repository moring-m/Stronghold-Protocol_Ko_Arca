import {test} from 'node:test';import assert from 'node:assert/strict';
import {appendDamageSample} from '../../public/js/ui/laboratoryDamage.js';
const sample=(time,values,id='battle')=>({battleId:id,time,rows:[{id:1,values}]});
test('live DPS uses game time and ignores repeated render frames and paused time',()=>{
 const start=appendDamageSample(null,sample(0,[0,0,0,0]));
 assert.equal(appendDamageSample(start,sample(0,[0,0,0,0])),start);
 const next=appendDamageSample(start,sample(1,[100,20,10,5,0,0]));assert.deepEqual(next.points.at(-1).values,[100,20,10,5,0,0]);
 assert.deepEqual(appendDamageSample(next,sample(3,[300,60,30,15,0,0])).points.at(-1).values,[100,20,10,5,0,0]);
 assert.equal(appendDamageSample(next,sample(1,[100,20,10,5,0,0])),next);
});
test('live chart retains at most sixty seconds and resets for another battle',()=>{
 let state=null;for(let t=0;t<=120;t++)state=appendDamageSample(state,sample(t,[t,0,0,0]));
 assert.equal(state.points[0].time,60);assert.equal(state.points.length,61);
 assert.equal(appendDamageSample(state,sample(0,[0,0,0,0],'new')).points.length,1);
});

import {DAMAGE_TYPES,damageValues} from '../../shared/damageTypes.js';
test('both charts distinguish elemental, notes, true and unclassified damage in the requested order',()=>{
 assert.deepEqual(DAMAGE_TYPES.map(t=>t.label),['물리 대미지','마법 대미지','원소 대미지','속세의 음','트루 대미지','유형 미기록 대미지']);
 const values=damageValues({dmg:100,physicalDamage:10,artsDamage:20,elementalDamage:15,noteDamage:25,trueDamage:5});assert.deepEqual(values,[10,20,15,25,5,25]);
 assert.deepEqual(damageValues({dmg:100}),[0,0,0,0,0,100]);
 const next=appendDamageSample(appendDamageSample(null,sample(0,[0,0,0,0,0,0])),sample(2,values));assert.deepEqual(next.points.at(-1).values,[5,10,7.5,12.5,2.5,12.5]);
});

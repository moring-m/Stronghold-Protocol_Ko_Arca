import {test} from 'node:test';
import assert from 'node:assert/strict';
import {adaptiveElapsed,adaptiveMapScale} from '../../public/js/render/adaptiveMap.js';
test('severe ongoing lag contributes to adaptation, while hidden/resumed tabs do not',()=>{
 assert.equal(adaptiveElapsed(.4),.1,'2.5fps must not bypass adaptive quality');
 assert.equal(adaptiveElapsed(.8),.1);
 assert.equal(adaptiveElapsed(1.5),.1,'visible 1fps lag must still adapt');
 assert.equal(adaptiveElapsed(1.5,false,true),0,'a resumed tab is handled separately');
 assert.equal(adaptiveElapsed(.4,true),0);
 for(const dt of [NaN,Infinity,-1,0])assert.equal(adaptiveElapsed(dt),0);
});
test('adaptive map levels reduce background pixels without changing logical dimensions',()=>{
 assert.deepEqual([0,1,2,3].map(n=>adaptiveMapScale(n)),[1,.85,.7,.55]);
 assert.equal(adaptiveMapScale(3,false),1,'manual graphics choices work with adaptation disabled');
 assert.equal(adaptiveMapScale(-1),1);assert.equal(adaptiveMapScale(20),.55);
});

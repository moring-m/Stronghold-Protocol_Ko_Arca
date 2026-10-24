import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FxLibrary} from '../../public/js/render/vfx/library.js';
import {UnitView} from '../../public/js/render/units.js';

test('unchanged poses reuse live bounds, but the next pose and changed box remain protected from clipping',()=>{
 let calls=0,rect={x:-4,y:-9,width:8,height:10};
 const v={_box:{x0:-5,y0:-10,w:10,h:12,over:new Set()},actor:{poseVersion:1,spine:{state:{tracks:[]},getLocalBounds(){calls++;return rect;}}}};
 const check=()=>UnitView.prototype._impOver.call(v);
 for(let i=0;i<100;i++)assert.equal(check(),false);assert.equal(calls,1);
 rect={x:-12,y:-9,width:20,height:10};v.actor.poseVersion++;assert.equal(check(),true);assert.equal(calls,2);
 v._box={...v._box,x0:-20,w:40};assert.equal(check(),false);assert.equal(calls,3);
});

test('concurrent effect requests share one prefab compile and preserve the same result',async()=>{
 const lib=new FxLibrary();let reads=0;lib.descriptor=async()=>{reads++;await new Promise(r=>setTimeout(r,1));return {key:'a',nodes:[],materials:[]};};
 const [a,b]=await Promise.all([lib.load('a'),lib.load('A')]);assert.equal(a,b);assert.equal(reads,1);assert.equal(lib.loads.size,0);
 assert.equal(await lib.load('a'),a);assert.equal(reads,1);
});

test('effect compilation yields between expensive prefabs rather than blocking input for the whole batch',async()=>{
 const lib=new FxLibrary(),done=[];
 const jobs=Array.from({length:4},(_,i)=>lib._compile(()=>{const until=performance.now()+3;while(performance.now()<until){ /* simulate synchronous prefab compilation */ }done.push(i);return i;}));
 await new Promise(r=>setTimeout(r,0));assert.ok(done.length>0&&done.length<4,'input timer runs before the full batch completes');
 assert.deepEqual(await Promise.all(jobs),[0,1,2,3]);
 await assert.rejects(lib._compile(()=>{throw Error('invalid prefab');}),/invalid prefab/);assert.equal(await lib._compile(()=>5),5);
});

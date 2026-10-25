import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import vm from 'node:vm';
test('a load completing between first render and subscription releases the loading screen',()=>{
 const source=readFileSync('public/js/data.js','utf8').match(/export function useData\(\.\.\.names\) \{[\s\S]*?\n\}/)[0].replace('export ','');
 let status='loading',effect,notifications=0,listener;
 const ctx=vm.createContext({useReducer:()=>[0,()=>notifications++],useEffect:fn=>{effect=fn;},data:{status:()=>status,load(){},subscribe(fn){listener=fn;return()=>{listener=null;};}}});
 vm.runInContext(source+'\nglobalThis.read=useData;',ctx);
 assert.equal(ctx.read('chess'),false);status='ready';const cleanup=effect();
 assert.equal(notifications,1,'already settled loads send no event: the subscription must recheck');assert.equal(ctx.read('chess'),true);
 cleanup();assert.equal(listener,null);
});

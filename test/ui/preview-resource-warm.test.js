import {normalizeResourceSelection,selectedResources,readResourceSelection} from '../../shared/resourceSelection.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('preview uses the served full catalogue and downloads model files without a patch endpoint',async()=>{
 const handlers={},asked=[],stored=new Map(),messages=[];let task;
 const ctx={setInterval,clearInterval,AbortSignal,normalizeResourceSelection,selectedResources,readResourceSelection,URL,Promise,Set,Number,Error,Response,performance:{now:()=>Date.now()},setTimeout:fn=>{queueMicrotask(fn);},
  self:{location:{origin:'https://preview.test'},addEventListener:(type,fn)=>handlers[type]=fn,clients:{matchAll:async()=>[{postMessage:m=>messages.push(m)}]}},
  caches:{keys:async()=>['stronghold-ursus-preview-assets-v1'],open:async()=>({match:async k=>stored.get(k),keys:async()=>[...stored.keys()].map(k=>({url:'https://preview.test'+k})),put:async(k,v)=>stored.set(k,v)}),match:async k=>stored.get(k)},
  fetch:async path=>{asked.push(path);if(path==='/dev/patch-resources.json')return {ok:false,status:404};if(path==='/vendor/browser-resources.json')return {ok:true,json:async()=>({files:[{path:'/assets/custom/skins/optional.png',bytes:1000000},{path:'/assets/audio/z.mp3',bytes:5000},{path:'/assets/char_a.skel',bytes:100},{path:'/assets/char_a.png',bytes:100}]})};return new Response('asset');}};
 vm.runInNewContext(readFileSync(new URL('../../public/dev/ursus-resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),ctx);
 handlers.message({data:{type:'warmPatch'},waitUntil:p=>task=p});await task;
 assert.equal(asked[0],'/vendor/browser-resources.json');assert.ok(!asked.includes('/dev/patch-resources.json'));
 assert.ok(asked.indexOf('/assets/char_a.skel')<asked.indexOf('/assets/audio/z.mp3'));
 assert.equal(asked.at(-1),'/assets/custom/skins/optional.png','optional skins follow basic models and audio');
 assert.ok(messages.some(m=>m.bytesTotal===1005200&&m.bytesDone===1005200));
 assert.ok(stored.has('/assets/char_a.skel'));assert.ok(stored.has('/assets/char_a.png'));
 assert.ok(messages.some(m=>m.total===4&&m.done===4));assert.equal(messages.at(-1).active,false);
});

test('a completed resource version needs no inventory scan or asset download on the next visit',async()=>{
 const handlers={},asked=[],messages=[];let task,scans=0;
 const ctx={setInterval,clearInterval,AbortSignal,normalizeResourceSelection,selectedResources,readResourceSelection,URL,Promise,Set,Number,Error,Response,performance:{now:()=>Date.now()},
  self:{location:{origin:'https://preview.test'},addEventListener:(t,fn)=>handlers[t]=fn,clients:{matchAll:async()=>[{postMessage:m=>messages.push(m)}]}},
  caches:{keys:async()=>{scans++;return [];},open:async()=>({match:async key=>key==='/__preview_resources_ready__'?new Response('cached-version-kr-simple'):null})},
  fetch:async path=>{asked.push(path);return {ok:true,json:async()=>({version:'cached-version',files:[{path:'/assets/already.png'}]})};}};
 vm.runInNewContext(readFileSync(new URL('../../public/dev/ursus-resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),ctx);
 handlers.message({data:{type:'warmPatch'},waitUntil:p=>task=p});await task;
 assert.equal(scans,0);assert.deepEqual(asked,['/vendor/browser-resources.json']);
 const metrics=messages.find(m=>m.type==='resourceWarmMetrics');assert.equal(metrics.cached,1);assert.equal(metrics.missing,0);
});

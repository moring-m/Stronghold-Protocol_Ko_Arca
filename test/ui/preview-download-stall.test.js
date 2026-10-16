import {normalizeResourceSelection,selectedResources,readResourceSelection} from '../../shared/resourceSelection.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('stalled preview downloads time out, continue later files, and expose failed paths without false completion',async()=>{
 const handlers={},messages=[],saved=new Map(),paths=Array.from({length:8},(_,i)=>`/assets/test/${i}.bin`);
 const cache={match:async()=>null,keys:async()=>[],put:async(k,v)=>saved.set(k,v)};
 const catalogue={version:'stall',files:paths.map(path=>({path,bytes:4}))};
 runInNewContext(readFileSync(new URL('../../public/dev/ursus-resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),{
  normalizeResourceSelection,selectedResources,readResourceSelection,URL,Response,performance,setInterval,clearInterval,AbortSignal:{timeout:()=>AbortSignal.timeout(15)},
  caches:{open:async()=>cache,match:cache.match,keys:async()=>['stronghold-ursus-preview-assets-v1']},
  self:{location:{origin:'https://test.local'},clients:{matchAll:async()=>[{postMessage:m=>messages.push(m)}]},addEventListener:(type,fn)=>handlers[type]=fn},
  fetch:async(path,{signal}={})=>{
   if(path==='/vendor/browser-resources.json')return Response.json(catalogue);
   if(path===paths[0])return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));
   return new Response('data');
  }
 });
 let work;handlers.message({data:{type:'warmPatch'},waitUntil:p=>work=p});
 // Keep the event loop alive for the synthetic AbortSignal timer.
 let timer;await Promise.race([work,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('download hung')),1000);})]);clearTimeout(timer);
 assert.ok(saved.has(paths[7]),'later files continue despite a stuck request');
 assert.equal(saved.has('/__preview_resources_ready__'),false);
 const error=messages.find(m=>m.type==='resourceWarmError');assert.ok(error.message.includes(paths[0]));assert.match(error.message,/요청 시간 초과/);
 const metrics=messages.find(m=>m.type==='resourceWarmMetrics');assert.equal(metrics.failed,1);
 assert.ok(messages.some(m=>m.type==='resourceProgress'&&m.bytesTotal===32));
 assert.ok(messages.filter(m=>m.type==='resourceProgress'&&m.active).every(m=>m.bytesDone<=28),'failed bytes never count as received');
});

test('the page wakes a stopped preview worker and resumes without clearing received files',async()=>{
 const source=readFileSync(new URL('../../public/js/resource-bootstrap.js',import.meta.url),'utf8');
 const start=source.indexOf('function warmPreview('),end=source.indexOf('\nasync function boot()',start);
 let receive,tick,now=0,posts=0,cleared=0;const scope={readResourceSelection,
  Date:{now:()=>now},setInterval:fn=>{tick=fn;return 1;},clearInterval:()=>cleared++,
  navigator:{serviceWorker:{controller:{postMessage:()=>posts++},addEventListener:(_type,fn)=>receive=fn,removeEventListener:()=>{receive=null;}}}
 };
 runInNewContext(source.slice(start,end)+'\nglobalThis.run=warmPreview;',scope);
 const progress=[],done=scope.run(p=>progress.push(p));assert.equal(posts,1);
 now=11000;tick();assert.equal(posts,2,'silent worker receives a resume request');
 receive({data:{type:'resourceProgress',id:'preview',done:5,total:8,bytesDone:20,bytesTotal:32,active:true}});
 receive({data:{type:'resourceProgress',id:'preview',active:false}});await done;
 assert.equal(progress[0].done,5);assert.equal(cleared,1);assert.equal(receive,null);
});

test('a full cache resumes without enumerating the oversized Cache.keys response',async()=>{
 const handlers={},messages=[],total=30631;let reads=0,active=0,maxActive=0,downloads=0;
 const catalogue={version:'large',files:Array.from({length:total},(_,i)=>({path:`/assets/full/${i}.png`,bytes:2}))};
 const cache={match:async()=>null,keys:async()=>{throw Error("Failed to execute 'keys' on 'Cache': Operation too large.");},put:async()=>{}};
 runInNewContext(readFileSync(new URL('../../public/dev/ursus-resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),{
  normalizeResourceSelection,selectedResources,readResourceSelection,URL,Response,performance,setInterval,clearInterval,AbortSignal,
  caches:{open:async()=>cache,match:async()=>{reads++;active++;maxActive=Math.max(maxActive,active);await Promise.resolve();active--;return {body:{cancel:async()=>{}}};}},
  self:{location:{origin:'https://test.local'},clients:{matchAll:async()=>[{postMessage:m=>messages.push(m)}]},addEventListener:(type,fn)=>handlers[type]=fn},
  fetch:async path=>{if(path==='/vendor/browser-resources.json')return Response.json(catalogue);downloads++;throw Error('cached files must not download');}
 });
 let work;handlers.message({data:{type:'warmPatch'},waitUntil:p=>work=p});await work;
 assert.equal(reads,total);assert.ok(maxActive<=6);assert.equal(downloads,0);
 assert.equal(messages.some(m=>m.type==='resourceWarmError'),false);
 const metrics=messages.find(m=>m.type==='resourceWarmMetrics');assert.equal(metrics.cached,total);assert.equal(metrics.missing,0);
 assert.ok(messages.some(m=>m.type==='resourceProgress'&&m.bytesDone===total*2));
});

import {normalizeResourceSelection,selectedResources,readResourceSelection} from '../../shared/resourceSelection.js';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
test('future assets are cached automatically; metadata refreshes and falls back offline',async()=>{
 const handlers={},saved=new Map();let calls=0,offline=false;
 const cache={match:async key=>saved.get(key)?.clone(),put:async(key,response)=>saved.set(key,response.clone())};
 const caches={open:async()=>cache,match:cache.match};
 runInNewContext(readFileSync(new URL('../../public/dev/ursus-resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),{
  normalizeResourceSelection,selectedResources,readResourceSelection,URL,caches,self:{location:{origin:'https://example.test'},addEventListener:(k,fn)=>handlers[k]=fn},
  fetch:async request=>{calls++;if(offline)throw Error('offline');return new Response(String(calls));}
 });
 const get=async path=>{let promise;handlers.fetch({request:{url:'https://example.test'+path,method:'GET'},respondWith:p=>promise=p});return(await promise).text();};
 assert.equal(await get('/assets/custom/new-skin.png'),'1');
 assert.equal(await get('/assets/custom/new-skin.png'),'1');assert.equal(calls,1);
 assert.equal(await get('/data/assets.json'),'2');assert.equal(await get('/data/assets.json'),'3');
 offline=true;assert.equal(await get('/data/assets.json'),'3');
 assert.equal(await get('/assets/custom/new-skin.png'),'1');
});

test('production background warming serves fonts before completion and fills missing resources from mirrors on demand',async()=>{
 const handlers={},saved=new Map();let release;const slow=new Promise(resolve=>release=resolve);
 const file={path:'/assets/local/map/original/test-v1.json.gz',local:true,sources:['https://raw.githubusercontent.com/example/game/master/map.gz']};
 const index={version:'test',files:[file],fontCss:'@font-face{font-family:test}',estimatedBytes:8};
 const cache={match:async key=>saved.get(typeof key==='string'?key:key.url)?.clone(),put:async(key,response)=>saved.set(key,response.clone()),delete:async key=>saved.delete(key),keys:async()=>[...saved.keys()].map(path=>({url:'https://example.test'+path}))};
 const script=readFileSync(new URL('../../public/resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
 let mirrorCalls=0;
 runInNewContext(script,{normalizeResourceSelection,selectedResources,readResourceSelection,URL,Response,TextDecoder,DataView,AbortSignal,setTimeout,clearTimeout,caches:{open:async()=>cache,match:cache.match,keys:async()=>['stronghold-resources-test']},self:{location:{origin:'https://example.test'},addEventListener:(k,fn)=>handlers[k]=fn},normalizeAtlas:()=>{throw Error('no atlas expected');},fetch:async request=>{
  const url=typeof request==='string'?request:request.url;
  if(url==='/vendor/browser-resources.json')return new Response(JSON.stringify(index));
  if(url===file.sources[0]){mirrorCalls++;await slow;return new Response(new Uint8Array([1,2,3]));}
  throw Error('Unexpected fetch '+url);
 }});
 const get=async path=>{let p;handlers.fetch({request:{url:'https://example.test'+path,method:'GET'},respondWith:r=>p=r});return p;};
 const received=[];let background;
 handlers.message({data:{type:'preparePatch'},ports:[{postMessage:m=>received.push(m)}],waitUntil:p=>background=p});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(await(await get('/fonts/fonts.css')).text(),index.fontCss,'fonts usable while optional map is still downloading');
 assert.equal(received.some(m=>m.type==='ready'),false);
 const foreground=get(file.path);
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(mirrorCalls,1,'on-demand and background requests share the same download');
 release();await background;await foreground;
 assert.ok(received.some(m=>m.type==='ready'));
 const before=mirrorCalls;assert.deepEqual([...new Uint8Array(await(await get(file.path)).arrayBuffer())],[1,2,3]);assert.equal(mirrorCalls,before,'completed file served from cache');
 saved.delete(file.path);assert.deepEqual([...new Uint8Array(await(await get(file.path)).arrayBuffer())],[1,2,3],'a missing requested file is fetched from its configured mirror');
});

test('a manifest exceeding 4000 files resumes across worker restarts without a final atlas rewrite',async()=>{
 const png=new Uint8Array(24);new DataView(png.buffer).setUint32(0,0x89504e47);new DataView(png.buffer).setUint32(16,1);new DataView(png.buffer).setUint32(20,1);
 const files=Array.from({length:4100},(_,i)=>({path:`/assets/large/${i}.bin`,sources:[`https://cdn.jsdelivr.net/${i}.bin`]}));
 files.push({path:'/assets/large/page.png',sources:['https://cdn.jsdelivr.net/page.png']});
 files.push({path:'/assets/large/page.atlas',sources:['https://cdn.jsdelivr.net/page.atlas'],atlas:{textures:['/assets/large/page.png'],pma:true}});
 const index={version:'large',files,fontCss:'body{}'};
 const saved=new Map(files.slice(0,4000).map(f=>[f.path,new Response('cached')]));
 let network=0,normalized=0,atlasWrites=0,pathListBuilds=0;
 const mapFiles=files.map.bind(files);
 files.map=(...args)=>{pathListBuilds++;return mapFiles(...args);};
 const cache={match:async key=>saved.get(key)?.clone(),put:async(key,r)=>{saved.set(key,r.clone());if(key.endsWith('.atlas'))atlasWrites++;},delete:async key=>saved.delete(key),keys:async()=>[...saved.keys()].map(path=>({url:'https://example.test'+path}))};
 const script=readFileSync(new URL('../../public/resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
 const worker=()=>{
  const handlers={};
  runInNewContext(script,{normalizeResourceSelection,selectedResources,readResourceSelection,URL,Response,TextDecoder,DataView,AbortSignal,setTimeout,clearTimeout,caches:{open:async()=>cache,match:cache.match,keys:async()=>['stronghold-resources-large']},self:{location:{origin:'https://example.test'},addEventListener:(k,fn)=>handlers[k]=fn},normalizeAtlas:()=>{normalized++;return {text:'normalized',missingSize:[]};},fetch:async url=>{
   if(url==='/vendor/browser-resources.json')return {ok:true,json:async()=>index};
   network++;return new Response(url.endsWith('.png')?png:'fixture');
  }});return handlers;
 };
 const counts=[];let resume,reply,slices=0;
 do {
  // Fresh JS globals each slice simulate termination/restart; persisted cache and
  // the page's resume token are the only retained state.
  const handlers=worker();let pending;
  handlers.message({data:{type:'preparePatch',resume},ports:[{postMessage:m=>{if(m.type==='progress')counts.push(m.done);else reply=m;}}],waitUntil:p=>pending=p});
  await pending;slices++;
  assert.notEqual(reply.type,'error',reply.message);
  if(reply.type==='continue'){assert.ok(reply.resume.cursor>0);resume=reply.resume;}
 } while(reply.type==='continue');
 assert.equal(reply.type,'ready');assert.ok(slices>1);
 assert.equal(counts.at(-1),files.length);assert.ok(counts.includes(4000));assert.ok(counts.includes(4001));
 assert.ok(counts.every((n,i)=>i===0||n>=counts[i-1]),'progress never goes backwards across slices');
 assert.equal(network,102,'cached files stay cached, only 102 missing files downloaded');
 assert.ok(pathListBuilds<=slices*2,'the complete path list is built per slice, never per cached file');
 assert.equal(normalized,1,'normalize the atlas only on its first download');assert.equal(atlasWrites,1);
 assert.ok(saved.has('/__resources_ready__'));
});

test('sliced retries report each missing file and never mark an incomplete cache ready',async()=>{
 const handlers={},saved=new Map(),files=[{path:'/assets/missing.bin',sources:['https://cdn.jsdelivr.net/missing.bin']}];let requests=0;
 const cache={match:async k=>saved.get(k),put:async(k,r)=>saved.set(k,r),delete:async()=>{},keys:async()=>[]};
 const script=readFileSync(new URL('../../public/resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
 runInNewContext(script,{normalizeResourceSelection,selectedResources,readResourceSelection,URL,Response,TextDecoder,DataView,AbortSignal,setTimeout,clearTimeout,caches:{open:async()=>cache,match:cache.match},self:{location:{origin:'https://example.test'},addEventListener:(k,fn)=>handlers[k]=fn},normalizeAtlas:()=>{},fetch:async url=>{
  if(url==='/vendor/browser-resources.json')return new Response(JSON.stringify({version:'failed',files,fontCss:''}));requests++;return new Response('',{status:404});
 }});
 let pending;const replies=[];handlers.message({data:{type:'preparePatch'},ports:[{postMessage:m=>replies.push(m)}],waitUntil:p=>pending=p});await pending;
 assert.equal(requests,3);assert.equal(replies.at(-1).type,'error');assert.match(replies.at(-1).message,/missing.bin: cdn\.jsdelivr\.net: HTTP 404/);
 assert.equal(saved.has('/__resources_ready__'),false);assert.ok(replies.filter(m=>m.type==='progress').every(m=>m.done===1));
});

test('the page reconnects after a lost worker response using its last resume token',async()=>{
 const source=readFileSync(new URL('../../public/js/resource-bootstrap.js',import.meta.url),'utf8').split('\nasync function boot()')[0].replace(/^import .*;\n/gm,'');
 const timers=new Map();let timerId=0,calls=0,closed=0;
 class Channel {
  constructor(){this.port1={onmessage:null,close:()=>closed++};this.port2={postMessage:data=>queueMicrotask(()=>this.port1.onmessage?.({data}))};}
 }
 const context={readResourceSelection,MessageChannel:Channel,setTimeout:(fn,delay)=>{const id=++timerId;if(delay===0)queueMicrotask(fn);else {assert.equal(delay,60000);timers.set(id,fn);}return id;},clearTimeout:id=>timers.delete(id),navigator:{serviceWorker:{controller:{postMessage:(request,[port])=>{
  calls++;
  if(calls===1)port.postMessage({type:'continue',resume:{version:'fixture',cursor:4000,done:4000}});
  else {
   assert.equal(request.resume.cursor,4000,'restart preserves completed cursor');
   if(calls===2)queueMicrotask(()=>[...timers.values()][0]());
   else port.postMessage({type:'ready',version:'fixture'});
  }
 }}}}};
 runInNewContext(source+'\nglobalThis.download=message;',context);
 assert.equal((await context.download('preparePatch')).type,'ready');
 assert.equal(calls,3);assert.equal(closed,3);assert.equal(timers.size,0);
});

test('one stalled file does not block later parallel downloads across slice boundaries',async()=>{
 const handlers={},saved=new Map();let releaseSlow;const slow=new Promise(resolve=>releaseSlow=resolve);
 const files=Array.from({length:140},(_,i)=>({path:`/assets/parallel/${i}.bin`,sources:[`https://cdn.jsdelivr.net/parallel/${i}.bin`]}));
 const cache={match:async k=>saved.get(k)?.clone(),put:async(k,r)=>saved.set(k,r.clone()),delete:async()=>{},keys:async()=>[]};
 let slowRequests=0,active=0,maxActive=0;
 const script=readFileSync(new URL('../../public/resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,'');
 runInNewContext(script,{normalizeResourceSelection,selectedResources,readResourceSelection,URL,Response,TextDecoder,DataView,AbortSignal,setTimeout:(fn,ms)=>setTimeout(fn,ms===5000?50:ms),clearTimeout,caches:{open:async()=>cache,match:cache.match},self:{location:{origin:'https://example.test'},addEventListener:(k,fn)=>handlers[k]=fn},normalizeAtlas:()=>{},fetch:async url=>{
  if(url==='/vendor/browser-resources.json')return new Response(JSON.stringify({version:'parallel',files,fontCss:''}));
  active++;maxActive=Math.max(maxActive,active);
  try {if(url.endsWith('/0.bin')){slowRequests++;await slow;}else await new Promise(resolve=>setTimeout(resolve,1));return new Response('downloaded');}
  finally {active--;}
 }});
 const request=async resume=>{let pending,reply;handlers.message({data:{type:'preparePatch',resume},ports:[{postMessage:m=>{if(m.type==='continue'||m.type==='ready'||m.type==='error')reply=m;}}],waitUntil:p=>pending=p});await pending;return reply;};
 let reply,resume;
 for(let i=0;i<20;i++){
  reply=await request(resume);assert.equal(reply.type,'continue');resume=reply.resume;
  if(files.slice(1).every(f=>saved.has(f.path)))break;
 }
 assert.ok(files.slice(1).every(f=>saved.has(f.path)),'all 139 later files finish while the first is stalled');
 assert.equal(saved.has(files[0].path),false);assert.equal(saved.has('/__resources_ready__'),false);
 assert.equal(slowRequests,1,'the stalled file is rejoined, not restarted on every slice');
 assert.ok(maxActive>=2&&maxActive<=6,'six independent download slots');
 releaseSlow();
 do {reply=await request(resume);resume=reply.resume;} while(reply.type==='continue');
 assert.equal(reply.type,'ready');assert.ok(saved.has('/__resources_ready__'));
});

test('storage exhaustion stops retries and reports quota rather than a mirror error',async()=>{
 const handlers={},saved=new Map();let calls=0;
 const file={path:'/assets/quota.bin',sources:['https://cdn.jsdelivr.net/file.bin','https://raw.githubusercontent.com/file.bin']};
 const index={version:'quota',files:[file],fontCss:''};
 const cache={match:async key=>saved.get(key)?.clone(),put:async(key,r)=>{if(key===file.path){const e=new Error('quota');e.name='QuotaExceededError';throw e;}saved.set(key,r.clone());},delete:async key=>saved.delete(key)};
 runInNewContext(readFileSync(new URL('../../public/resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),{
  normalizeResourceSelection,selectedResources,readResourceSelection,URL,Response,TextDecoder,DataView,AbortSignal,setTimeout,clearTimeout,caches:{open:async()=>cache,match:cache.match},self:{location:{origin:'https://example.test'},addEventListener:(k,fn)=>handlers[k]=fn},fetch:async url=>{if(url==='/vendor/browser-resources.json')return new Response(JSON.stringify(index));calls++;return new Response('valid');}
 });
 let job;const messages=[];handlers.message({data:{type:'preparePatch'},ports:[{postMessage:m=>messages.push(m)}],waitUntil:p=>job=p});await job;
 assert.equal(calls,1,'storage failure cannot be fixed by alternate mirrors or repeated attempts');
 assert.match(messages.find(m=>m.type==='error')?.message,/브라우저 저장 공간이 부족/);
 assert.equal(messages.some(m=>m.type==='ready'),false);
});

test('all failed sources retain their HTTP and timeout causes',async()=>{
 const handlers={},saved=new Map();
 const file={path:'/assets/broken.bin',sources:['https://cdn.jsdelivr.net/file.bin','https://raw.githubusercontent.com/file.bin']};const index={version:'errors',files:[file],fontCss:''};
 const cache={match:async key=>saved.get(key)?.clone(),put:async(key,r)=>saved.set(key,r.clone()),delete:async key=>saved.delete(key)};
 runInNewContext(readFileSync(new URL('../../public/resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),{
  normalizeResourceSelection,selectedResources,readResourceSelection,URL,Response,TextDecoder,DataView,AbortSignal,setTimeout,clearTimeout,caches:{open:async()=>cache,match:cache.match},self:{location:{origin:'https://example.test'},addEventListener:(k,fn)=>handlers[k]=fn},fetch:async url=>{if(url==='/vendor/browser-resources.json')return new Response(JSON.stringify(index));if(url===file.sources[0])return new Response('',{status:404});const e=new Error('timeout');e.name='TimeoutError';throw e;}
 });
 let job;const messages=[];handlers.message({data:{type:'preparePatch'},ports:[{postMessage:m=>messages.push(m)}],waitUntil:p=>job=p});await job;
 const message=messages.find(m=>m.type==='error')?.message;
 assert.match(message,/cdn.jsdelivr.net: HTTP 404/);assert.match(message,/raw.githubusercontent.com: 요청 시간 초과·중단/);
});

test('resource redownload deletes resource caches only and prevents pending old downloads from writing back',async()=>{
 const handlers={},stores=new Map([['stronghold-resources-old',new Map()],['user-history',new Map([['history','keep']])]]);
 let release;const slow=new Promise(r=>release=r);
 const file={path:'/assets/reset-test.bin',sources:['https://raw.githubusercontent.com/example/main/reset.bin']};
 const index={version:'old',files:[file],fontCss:''};
 const caches={keys:async()=>[...stores.keys()],delete:async key=>stores.delete(key),open:async name=>{
   if(!stores.has(name))stores.set(name,new Map());const saved=stores.get(name);
   return {match:async key=>saved.get(key)?.clone(),put:async(key,r)=>saved.set(key,r.clone()),keys:async()=>[...saved.keys()].map(key=>({url:'https://example.test'+key}))};
 },match:async()=>undefined};
 runInNewContext(readFileSync(new URL('../../public/resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),{
  normalizeResourceSelection,selectedResources,readResourceSelection,URL,Response,TextDecoder,DataView,AbortSignal,setTimeout,clearTimeout,caches,
  self:{location:{origin:'https://example.test'},addEventListener:(k,fn)=>handlers[k]=fn},
  fetch:async url=>{if(url==='/vendor/browser-resources.json')return Response.json(index);await slow;return new Response('asset');}
 });
 const send=(type,replies)=>{let pending;handlers.message({data:{type},ports:[{postMessage:m=>replies.push(m)}],waitUntil:p=>pending=p});return pending;};
 const old=send('preparePatch',[]);await new Promise(r=>setTimeout(r,10));
 const replies=[];await send('resetResources',replies);assert.equal(replies[0].type,'reset');
 release();await old;
 assert.deepEqual([...stores.keys()],['user-history']);assert.equal(stores.get('user-history').get('history'),'keep');
});

test('rolling release pins reuse cached art and font keys while data stays isolated by release',async()=>{
 const handlers={},saved=new Map([['/assets/char/test.skel',new Response('cached-model')]]),calls=[];
 const index={version:'rolling',files:[{path:'/assets/char/test.skel',sources:['https://cdn.test/model']}],fontCss:'cached-fonts'};let offline=false;
 const cache={match:async key=>saved.get(typeof key==='string'?key:key.url)?.clone(),put:async(key,response)=>saved.set(key,response.clone())};
 runInNewContext(readFileSync(new URL('../../public/resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),{normalizeResourceSelection,selectedResources,readResourceSelection,URL,Response,AbortSignal,setTimeout,clearTimeout,normalizeAtlas(){},caches:{open:async()=>cache,match:cache.match},self:{location:{origin:'https://example.test'},addEventListener:(k,fn)=>handlers[k]=fn},fetch:async request=>{const url=typeof request==='string'?request:request.url;calls.push(url);if(url==='/vendor/browser-resources.json')return new Response(JSON.stringify(index));if(offline)throw Error('offline');if(url.includes('/data/config.json'))return new Response(new URL(url).searchParams.get('release'));throw Error('art should already be cached: '+url);}});
 const get=async path=>{let response;handlers.fetch({request:{url:'https://example.test'+path,method:'GET'},respondWith:p=>response=p});return(await response).text();};
 for(const path of ['/assets/char/test.skel?release=111111111111','/assets/char/test.skel?release=222222222222','/assets/~abc123/char/test.skel?release=222222222222'])assert.equal(await get(path),'cached-model');
 assert.equal(await get('/fonts/fonts.css?release=111111111111'),'cached-fonts');assert.ok(!calls.some(url=>url.includes('/assets/')||url.includes('cdn.test')));
 assert.equal(await get('/data/config.json?release=111111111111'),'111111111111');assert.equal(await get('/data/config.json?release=222222222222'),'222222222222');offline=true;
 assert.equal(await get('/data/config.json?release=111111111111'),'111111111111');assert.equal(await get('/data/config.json?release=222222222222'),'222222222222');
});

test('completed resource status uses constant-size checks and missing assets still download on demand',async()=>{
 const handlers={},saved=new Map([['/__resources_ready__',new Response('fast-kr-simple')],['/fonts/fonts.css',new Response('fonts')]]);let scans=0,downloads=0;
 const file={path:'/assets/test/evicted.bin',sources:['https://raw.githubusercontent.com/example/game/master/mirror.bin']},index={version:'fast',files:[file],fontCss:'fonts'};
 const cache={match:async k=>saved.get(k)?.clone(),put:async(k,r)=>saved.set(k,r.clone()),keys:async()=>{scans++;throw Error('must not scan thousands of cached assets on entry');}};
 runInNewContext(readFileSync(new URL('../../public/resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),{normalizeResourceSelection,selectedResources,readResourceSelection,URL,Response,TextDecoder,DataView,AbortSignal,setTimeout,clearTimeout,normalizeAtlas(){},caches:{open:async()=>cache,match:cache.match,keys:async()=>[]},self:{location:{origin:'https://example.test'},addEventListener:(k,fn)=>handlers[k]=fn},fetch:async request=>{const url=typeof request==='string'?request:request.url;if(url==='/vendor/browser-resources.json')return new Response(JSON.stringify(index));downloads++;return new Response(new Uint8Array([1,2,3]));}});
 const status=async()=>{let pending,reply;handlers.message({data:{type:'status'},ports:[{postMessage:m=>reply=m}],waitUntil:p=>pending=p});await pending;return reply;};
 assert.equal((await status()).ready,true);assert.equal(scans,0);assert.equal(downloads,0);
 let response;handlers.fetch({request:{method:'GET',url:'https://example.test'+file.path},respondWith:p=>response=p});assert.deepEqual([...new Uint8Array(await(await response).arrayBuffer())],[1,2,3]);assert.equal(downloads,1);
 saved.set('/__resources_ready__',new Response('old-version'));assert.equal((await status()).ready,false);
});

test('display metadata never waits for the art catalogue; pinned code and data reuse cache by release',async()=>{
 const handlers={},stores=new Map(),calls=[];let artReads=0;
 const caches={open:async name=>{if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);return {match:async k=>map.get(k)?.clone(),put:async(k,r)=>map.set(k,r.clone())};},match:async key=>{for(const map of stores.values())if(map.has(key))return map.get(key).clone();}};
 runInNewContext(readFileSync(new URL('../../public/resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),{normalizeResourceSelection,selectedResources,readResourceSelection,URL,Response,AbortSignal,setTimeout,clearTimeout,normalizeAtlas(){},caches,self:{location:{origin:'https://example.test'},addEventListener:(k,fn)=>handlers[k]=fn},fetch:async request=>{const url=typeof request==='string'?request:request.url;calls.push(url);if(url==='/vendor/browser-resources.json'){artReads++;throw Error('display metadata must not request the art catalogue');}return new Response(url);}});
 const get=async path=>{let response;const pending=[];handlers.fetch({request:{url:'https://example.test'+path,method:'GET'},respondWith:p=>response=p,waitUntil:p=>pending.push(p)});const text=await(await response).text();await Promise.all(pending);return text;};
 assert.match(await get('/i18n/ko/compiled.json'),/compiled.json/);assert.equal(artReads,0);
 for(const path of ['/js/main.js','/shared/constants.js','/sim/spec.js','/data/config.json','/i18n/ko/compiled.json']){
  const before=calls.length;await get(path+'?release=111111111111');await get(path+'?release=111111111111');assert.equal(calls.length,before+1,'same release uses cached '+path);await get(path+'?release=222222222222');assert.equal(calls.length,before+2,'another release fetches isolated '+path);
 }
 const before=calls.length;await get('/data/config.json');await get('/data/config.json');assert.equal(calls.length,before+2,'unversioned local development stays fresh');assert.equal(artReads,0);
});

test('hashed imported-art cache misses retain the mirror pipeline and canonical cache',async()=>{
 const handlers={},stores=new Map(),calls=[];
 const mirror='https://raw.githubusercontent.com/example/game/master/test.skel';
 const index={version:'hashed-mirror',files:[{path:'/assets/spine/test.skel',sources:[mirror]}],fontCss:''};
 const caches={open:async name=>{if(!stores.has(name))stores.set(name,new Map());const map=stores.get(name);return {match:async k=>map.get(k)?.clone(),put:async(k,r)=>map.set(k,r.clone())};},match:async key=>{for(const map of stores.values())if(map.has(key))return map.get(key).clone();}};
 runInNewContext(readFileSync(new URL('../../public/resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),{normalizeResourceSelection,selectedResources,readResourceSelection,URL,Response,AbortSignal,setTimeout,clearTimeout,normalizeAtlas(){},caches,self:{location:{origin:'https://example.test'},addEventListener:(k,fn)=>handlers[k]=fn},fetch:async request=>{const url=typeof request==='string'?request:request.url;calls.push(url);if(url==='/vendor/browser-resources.json')return new Response(JSON.stringify(index));assert.equal(url,mirror);return new Response('mirror-model');}});
 const get=async()=>{let response;handlers.fetch({request:{url:'https://example.test/assets/~0123456789abcdef/spine/test.skel?release=111111111111',method:'GET',headers:new Headers()},respondWith:p=>response=p});return(await response).text();};
 assert.equal(await get(),'mirror-model');assert.equal(await get(),'mirror-model');assert.equal(calls.filter(url=>url===mirror).length,1);
 stores.get('sp-imported-assets-v1').set('https://example.test/assets/~0123456789abcdef/spine/test.skel',new Response('imported-model'));
 const before=calls.length;assert.equal(await get(),'imported-model');assert.equal(calls.length,before);
});

test('cached production art is served before any catalogue request, including release-pinned paths',async()=>{
 const handlers={};let requests=0;
 runInNewContext(readFileSync(new URL('../../public/resource-worker.js',import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),{
  normalizeResourceSelection,selectedResources,URL,Response,
  self:{location:{origin:'https://example.test'},addEventListener:(type,fn)=>handlers[type]=fn},
  caches:{open:async()=>({match:async()=>null}),match:async path=>path==='/assets/unit.png'?new Response('cached art'):null},
  fetch:async()=>{requests++;throw Error('Catalogue must not be needed for cached art');}
 });
 for(const path of ['/assets/unit.png','/assets/~1234567890abcdef/unit.png?release=1234567890abcdef']){
  let response;handlers.fetch({request:{url:'https://example.test'+path,method:'GET',headers:new Headers()},respondWith:p=>response=p});
  assert.equal(await(await response).text(),'cached art');
 }
 assert.equal(requests,0);
});

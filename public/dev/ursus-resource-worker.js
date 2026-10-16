import {normalizeResourceSelection,selectedResources} from '../../shared/resourceSelection.js';
// Cache every synchronized resource, including future costumes and audio, across test sessions.
const CACHE='stronghold-ursus-preview-assets-v1';
let generation=0;
self.addEventListener('install',e=>e.waitUntil(self.skipWaiting()));
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin||event.request.method!=='GET')return;
 const metadata=/^\/(data|i18n)\//.test(url.pathname)||url.pathname==='/vendor/browser-resources.json';
 if(!metadata&&!/^\/(assets|fonts|media)\//.test(url.pathname))return;
 event.respondWith((async()=>{
  const startedGeneration=generation,cache=await caches.open(CACHE),key=url.pathname+url.search;
  if(metadata){
   try{const response=await fetch(event.request);if(response.ok&&startedGeneration===generation)await cache.put(key,response.clone());return response;}
   catch(error){const old=await cache.match(key);if(old)return old;throw error;}
  }
  const old=await caches.match(key);if(old)return old;
  const response=await fetch(event.request);if(response.ok&&startedGeneration===generation)await cache.put(key,response.clone());return response;
 })());
});

let warming=null,selection=normalizeResourceSelection(null);
let lastProgressAt=0;
const progress=async(done,total,active=true,extra={})=>{if(active&&done<total&&Date.now()-lastProgressAt<100)return;lastProgressAt=Date.now();for(const client of await self.clients.matchAll({includeUncontrolled:true}))client.postMessage({type:'resourceProgress',id:'preview',done,total,active,...extra});};
self.addEventListener('message',event=>{
 if(event.data?.type==='resetResources'){generation++;event.waitUntil((async()=>{for(const name of await caches.keys())if(name.startsWith('stronghold-resources-')||name.startsWith('stronghold-ursus-preview-assets-'))await caches.delete(name);event.ports[0]?.postMessage({type:'reset'});})());return;}
 if(event.data?.type!=='warmPatch')return;
 const next=event.data.selection?normalizeResourceSelection(event.data.selection):selection;
 if(JSON.stringify(next)!==JSON.stringify(selection)){generation++;selection=next;warming=null;}
 if(!warming){const startedGeneration=generation;const job=(async()=>{
  let r=await fetch('/vendor/browser-resources.json',{cache:'no-store'});
  if(!r.ok)r=await fetch('/dev/patch-resources.json',{cache:'no-store'});
  if(!r.ok)throw Error('리소스 목록 HTTP '+r.status);
  const catalogue=selectedResources(await r.json(),selection);
  const paths=catalogue.paths||catalogue.files?.map(f=>f.path);
  if(!Array.isArray(paths))throw Error('리소스 목록에 파일 경로가 없습니다.');
  const cache=await caches.open(CACHE),queue=[...new Set(paths.filter(p=>/^\/(assets|fonts|media)\//.test(p)))];
  // Artwork and model files precede bulk audio; current roster requests remain on demand.
  const priority=path=>path.startsWith('/assets/custom/skins/')?3:/\/audio\//.test(path)?2:0;
  queue.sort((a,b)=>priority(a)-priority(b));
  const sizes=new Map((catalogue.files||[]).map(f=>[f.path,Math.max(0,Number(f.bytes)||0)]));
  const bytesTotal=queue.reduce((n,path)=>n+(sizes.get(path)||0),0);
  let bytesDone=0;
  const status=path=>({bytesDone,bytesTotal,path:path||null,phase:path?.startsWith('/assets/custom/skins/')?'추가 스킨':/\/audio\//.test(path||'')?'음성·효과음':'기본 리소스'});
  const started=performance.now();
  const marker=catalogue.version&&await cache.match('/__preview_resources_ready__');
  if(marker&&await marker.text()===catalogue.version){
    bytesDone=bytesTotal;await progress(queue.length,queue.length,true,status());
    for(const client of await self.clients.matchAll())client.postMessage({type:'resourceWarmMetrics',cached:queue.length,total:queue.length,missing:0,lookupMs:performance.now()-started,downloadMs:0,failed:0});
    return;
  }
  const cached=new Set();
  // Cache.keys() can exceed Chromium's response-size limit with a full resource
  // bank. Check individual known paths with bounded concurrency instead.
  let lookupCursor=0;
  async function lookup(){while(lookupCursor<queue.length&&startedGeneration===generation){
    const path=queue[lookupCursor++],saved=await caches.match(path);
    if(saved){cached.add(path);bytesDone+=sizes.get(path)||0;saved.body?.cancel?.().catch(()=>{});}
    await progress(cached.size,queue.length,true,{...status(path),phase:'캐시 확인'});
  }}
  await Promise.all(Array.from({length:6},lookup));
  if(startedGeneration!==generation)return;
  const total=queue.length,missing=queue.filter(path=>!cached.has(path));
  const missingCount=missing.length,cachedCount=total-missingCount;
  let done=cachedCount,failed=0;
  bytesDone=queue.reduce((n,path)=>n+(cached.has(path)?sizes.get(path)||0:0),0);
  await progress(done,total,true,status());
  const lookupMs=performance.now()-started;
  const downloadStart=performance.now();
  const active=new Set(),errors=[];
  // A stalled source must not occupy every download slot indefinitely.
  const heartbeat=setInterval(()=>progress(done,total,true,status([...active][0])),1000);
  async function worker(){while(missing.length&&startedGeneration===generation){
    const path=missing.shift();
    active.add(path);
    try{
      const response=await fetch(path,{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error('HTTP '+response.status);
      // Consume the body under the request's timeout, before writing to CacheStorage.
      const body=await response.arrayBuffer();
      if(startedGeneration===generation){await cache.put(path,new Response(body,{headers:response.headers}));bytesDone+=sizes.get(path)||body.byteLength;done++;}
    }catch(error){failed++;if(errors.length<3)errors.push(path+': '+(error.name==='TimeoutError'||error.name==='AbortError'?'요청 시간 초과':error.message));}
    finally{active.delete(path);}
    await progress(done,total,true,status(path));
  }}
  try{await Promise.all(Array.from({length:6},worker));}finally{clearInterval(heartbeat);}
  for(const client of await self.clients.matchAll())client.postMessage({type:'resourceWarmMetrics',cached:cachedCount,total,missing:missingCount,lookupMs,downloadMs:performance.now()-downloadStart,failed});
  if(failed)throw Error(failed+'개 리소스 다운로드 실패. 받은 파일은 유지됩니다.\n'+errors.join('\n'));
  if(startedGeneration===generation&&catalogue.version)await cache.put('/__preview_resources_ready__',new Response(catalogue.version));

 })().catch(async error=>{if(startedGeneration!==generation)return;for(const client of await self.clients.matchAll())client.postMessage({type:'resourceWarmError',message:error.message});}).finally(async()=>{if(warming===job)warming=null;if(startedGeneration===generation)await progress(0,0,false);});
 warming=job;}
 event.waitUntil(warming);
});

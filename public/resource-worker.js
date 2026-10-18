import {normalizeResourceSelection,selectedResources} from '../shared/resourceSelection.js';
import { normalizeAtlas } from './vendor/resource-atlas.mjs';

const PREFIX = 'stronghold-resources-';
let indexPromise;
let preparing;
let generation=0,selection=normalizeResourceSelection(null);
const downloads = new Map();
const listeners = new Set();
const contentType = path => path.endsWith('.png') ? 'image/png' : path.endsWith('.atlas') ? 'text/plain' :
  path.endsWith('.mp3') ? 'audio/mpeg' : path.endsWith('.ogg') ? 'audio/ogg' :
  path.endsWith('.wav') ? 'audio/wav' : path.endsWith('.ttf') ? 'font/ttf' :
  path.endsWith('.otf') ? 'font/otf' : 'application/octet-stream';

async function index() {
  indexPromise ||= fetch('/vendor/browser-resources.json', { cache: 'no-store' }).then(async response => {
    if (!response.ok) throw new Error('리소스 목록을 불러오지 못했습니다.');
    return response.json();
  }).catch(error => { indexPromise = undefined; throw error; });
  return indexPromise;
}
const send = message => { for (const port of listeners) port.postMessage(message); };
async function complete(cache, resources) {
  // Written only after every download succeeds. Avoid enumerating thousands of
  // cache keys before showing the page on every visit; missing files heal on demand.
  const [marker,fonts]=await Promise.all([cache.match('/__resources_ready__'),cache.match('/fonts/fonts.css')]);
  return !!fonts && !!marker && await marker.text()===resources.version;
}

function download(file, cache, resources) {
  const key = (resources.sourceVersion||resources.version) + ':' + file.path;
  if (downloads.has(key)) return downloads.get(key);
  const job = downloadOne(file, cache, resources).finally(() => {if(downloads.get(key)===job)downloads.delete(key);});
  downloads.set(key, job);
  return job;
}

async function downloadOne(file, cache, resources) {
  const startedGeneration=generation;
  if (await cache.match(file.path)) return;
  const previous=await caches.match(file.path);
  if(previous)return; // Reuse previous assets without duplicating gigabytes on every patch.
  let lastError;
  const sourceErrors = [];
  for (const source of file.sources) {
    const url = new URL(source, self.location.origin);
    const local = file.local && source === file.path && url.origin === self.location.origin && /^\/assets\//.test(url.pathname);
    if (!local && (url.protocol !== 'https:' || !['cdn.jsdelivr.net', 'raw.githubusercontent.com'].includes(url.hostname))) throw new Error('허용되지 않은 리소스 출처');
    try {
      send({type:'activity', path:file.path});
      const response = await fetch(source, { mode: 'cors', credentials: 'omit', signal: AbortSignal.timeout(30000) });
      if (!response.ok || response.type === 'opaque') throw new Error(`HTTP ${response.status}`);
      if ((response.headers.get('content-type') || '').includes('text/html')) throw new Error('리소스 대신 HTML 응답');
      const body = await response.arrayBuffer();
      if(startedGeneration!==generation)throw new Error('리소스 재다운로드로 작업이 초기화되었습니다.');
      if (!body.byteLength) throw new Error('빈 파일');
      if (file.path.endsWith('.png') && new DataView(body).getUint32(0) !== 0x89504e47) throw new Error('잘못된 PNG');
      let payload = body;
      if (file.atlas) {
        const sizes = new Map();
        for (const path of file.atlas.textures) {
          const texture = resources.files.find(f => f.path === path);
          if (!texture) throw new Error('Missing atlas texture: ' + path);
          await download(texture, cache, resources);
          const png = await (await cache.match(path) || await caches.match(path)).arrayBuffer();
          const view = new DataView(png);
          sizes.set(path.split('/').at(-1), {width:view.getUint32(16),height:view.getUint32(20)});
        }
        const normalized = normalizeAtlas(new TextDecoder().decode(body), {pma:file.atlas.pma, renamePage:name=>name.replace(/[^A-Za-z0-9._-]/g,'_'), pageSize:name=>sizes.get(name.replace(/[^A-Za-z0-9._-]/g,'_'))});
        if (normalized.missingSize.length) throw new Error('Missing atlas texture dimensions');
        payload = normalized.text;
      }
      if(startedGeneration!==generation)throw new Error('리소스 재다운로드로 작업이 초기화되었습니다.');
      await cache.put(file.path, new Response(payload, { headers: { 'Content-Type': contentType(file.path) } }));
      return;
    } catch (error) {
      if(startedGeneration!==generation)throw error;
      if (error.name === 'QuotaExceededError') {
        throw new Error(`${file.path}: 브라우저 저장 공간이 부족합니다. 공간을 확보한 뒤 다시 시도해 주세요.`, {cause:error});
      }
      lastError = error;
      sourceErrors.push(`${url.hostname}: ${error.name === 'TimeoutError' || error.name === 'AbortError' ? '요청 시간 초과·중단' : error.message}`);
    }
  }
  throw new Error(`${file.path}: ${sourceErrors.join(' / ') || lastError?.message || '다운로드 실패'}`);
}

// Keep each message event short: browsers may terminate a worker kept alive by one
// multi-minute waitUntil. The page requests the next slice and can resume after restart.
async function prepare(background = false, resume = {}) {
  const startedGeneration=generation;
  const resources = selectedResources(await index(),selection);
  if(startedGeneration!==generation)throw new Error('리소스 재다운로드로 작업이 초기화되었습니다.');
  const cache = await caches.open(PREFIX + resources.version);
  const valid = resume.version === resources.version;
  let cursor = valid ? Math.max(0, Math.min(resources.files.length, resume.cursor || 0)) : 0;
  let attempt = valid ? resume.attempt || 0 : 0;
  let failed = valid ? resume.failed || [] : [];
  let retryFiles = valid ? resume.retryFiles || null : null;
  let done = valid ? resume.done || 0 : 0;
  let bytesDone = valid ? resume.bytesDone || 0 : 0;
  const bytesTotal=resources.estimatedBytes||resources.files.reduce((n,f)=>n+(f.bytes||0),0);
  if (!background && !valid) await cache.delete('/__resources_ready__');
  await cache.put('/fonts/fonts.css', new Response(resources.fontCss, {headers:{'Content-Type':'text/css'}}));
  const started = Date.now(), byPath = new Map(resources.files.map(file => [file.path, file]));
  // Build once per slice, rather than rebuilding a 30,000-file list for every
  // completed cache lookup. Retry queues still replace it when a pass finishes.
  const allPaths = resources.files.map(file => file.path);
  const active = new Map();
  const limit = 6;
  let processed = 0, timer;
  const deadline = new Promise(resolve => { timer = setTimeout(() => resolve(null), 5000); });
  const launch = path => {
    const file = byPath.get(path);
    const job = file ? download(file, cache, resources) : Promise.reject(new Error('목록에서 사라진 파일: ' + path));
    active.set(path, job.then(() => ({path}), error => ({path, error: error.message, storageFull:error.cause?.name === 'QuotaExceededError'})));
  };
  // Detached slow requests remain part of the resume token. A subsequent message
  // rejoins their download promises, or reuses the cache after a worker restart.
  for (const path of valid ? resume.pending || [] : []) if (byPath.has(path)) launch(path);
  const continuation = () => ({type:'continue', done, total:resources.files.length,bytesDone,bytesTotal,
    resume:{version:resources.version, cursor, attempt, failed, retryFiles, done,bytesDone, pending:[...active.keys()]}});
  try {
    while (true) {
      if(startedGeneration!==generation)throw new Error('리소스 재다운로드로 작업이 초기화되었습니다.');
      const queue = retryFiles || allPaths;
      while (active.size < limit && cursor < queue.length && processed < 64 && Date.now() - started < 5000) launch(queue[cursor++]);
      if (active.size) {
        const result = await Promise.race([...active.values(), deadline]);
        if (!result) return continuation();
        active.delete(result.path); processed++;
        if (result.storageFull) throw new Error(result.error);
        if (result.error) failed.push({path:result.path, message:result.error});
        else bytesDone+=byPath.get(result.path)?.bytes||0;
        if (!retryFiles) done++;
        send({type:'progress', done, total:resources.files.length,bytesDone,bytesTotal, phase:attempt ? 'retry' : 'download', attempt, path:result.error ? null : result.path});
        if (processed >= 64 || Date.now() - started >= 5000) return continuation();
        continue;
      }
      if (cursor < queue.length) return continuation();
      if (!failed.length) break;
      if (attempt >= 2) throw new Error(`${failed.length}개 파일을 받지 못했습니다.\n${failed.slice(0,3).map(item=>item.message).join('\n')}`);
      retryFiles = failed.map(item=>item.path); failed = []; cursor = 0; attempt++;
    }
  } finally { clearTimeout(timer); }
  // downloadOne already normalizes each atlas before storing it. Rewriting every
  // cached atlas here used to leave the counter at 100% with no progress for minutes.
  if(startedGeneration!==generation)throw new Error('리소스 재다운로드로 작업이 초기화되었습니다.');
  await cache.put('/__resources_ready__', new Response(resources.version));
  return {type:'ready', version:resources.version};
}

self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('message', event => {
  const port = event.ports[0];
  if (!port) return;
  event.waitUntil((async () => {
    try {
      const next=event.data.selection?normalizeResourceSelection(event.data.selection):selection;
      if(JSON.stringify(next)!==JSON.stringify(selection)){generation++;selection=next;preparing=undefined;downloads.clear();}
      if(event.data.type==='resetResources'){
        generation++;downloads.clear();preparing=undefined;indexPromise=undefined;
        for(const name of await caches.keys())if(name.startsWith(PREFIX)||name.startsWith('stronghold-ursus-preview-assets-'))await caches.delete(name);
        port.postMessage({type:'reset'});
      } else if (event.data.type === 'status') {
        indexPromise = undefined;
        const resources = selectedResources(await index(),selection);
        const cache = await caches.open(PREFIX + resources.version);
        const current=await complete(cache,resources);
        let reusable=false;
        if(!current)for(const name of await caches.keys()){if(!name.startsWith(PREFIX))continue;const old=await caches.open(name);if(await old.match('/__resources_ready__') && await old.match('/fonts/fonts.css')){reusable=true;break;}}
        port.postMessage({type:'status',ready:current||reusable,patch:!current&&reusable});
      } else if (event.data.type === 'prepare' || event.data.type === 'preparePatch') {
        listeners.add(port);
        try {
          if(!preparing){const job=prepare(event.data.type === 'preparePatch', event.data.resume).finally(()=>{if(preparing===job)preparing=undefined;});preparing=job;}
          port.postMessage(await preparing);
        } finally { listeners.delete(port); }
      }
    } catch (error) { port.postMessage({ type: 'error', message: error.message }); }
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET') return;
  // Version-pinned modules cannot change during a release. Reuse their bytes
  // directly, without a network round trip for every import on every visit.
  const release=url.searchParams.get('release');
  if(/^\/(js|shared|sim|vendor|css|data|i18n)\//.test(url.pathname)&&/^[a-f0-9]{12,40}$/.test(release||'')){
    event.respondWith((async()=>{
      const cache=await caches.open('stronghold-release-code-v1'),key=url.pathname+url.search;
      const saved=await cache.match(key);if(saved)return saved;
      const response=await fetch(event.request);if(response.ok){const save=cache.put(key,response.clone()).catch(()=>{});event.waitUntil?.(save);}return response;
    })());return;
  }
  if(!/^\/(assets|fonts|media|data|i18n)\//.test(url.pathname)&&url.pathname!=='/vendor/browser-resources.json')return;
  // Display metadata must not wait for the multi-megabyte art manifest or its
  // cache. Keep release-qualified keys and refresh from the network as before.
  if(/^\/(data|i18n)\//.test(url.pathname)||url.pathname==='/vendor/browser-resources.json'){
    event.respondWith((async()=>{
      try{const response=await fetch(event.request);if(response.ok){const copy=response.clone(),save=caches.open(PREFIX+'metadata').then(cache=>cache.put(url.pathname+url.search,copy)).catch(()=>{});event.waitUntil?.(save);}return response;}
      catch(error){const saved=await caches.match(url.pathname+url.search);if(saved)return saved;throw error;}
    })());return;
  }
  event.respondWith((async () => {
    // Imported art wins when present; a miss must still use the regular cache/mirror path.
    if(/^\/(?:assets|fonts|media)\/~[0-9a-f]{16}\//.test(url.pathname)&&!event.request.headers.has('range')){
      const imported=await caches.open('sp-imported-assets-v1');
      const hit=await imported.match(url.origin+url.pathname);if(hit)return hit;
    }
    // Cached files must not wait for the multi-megabyte download catalogue.
    // Keep the same normalized path used by the regular manifest lookup below.
    const earlyQuery=new URL(url.href).searchParams;earlyQuery.delete('release');
    const earlyPath=url.pathname.replace(/^\/(assets|fonts|media)\/~[a-f0-9]+\//,'/$1/')+(earlyQuery.toString()?'?'+earlyQuery.toString():'');
    const existing=await caches.match(earlyPath);
    if(existing)return existing;
    const resources = await index();
    const cache = await caches.open(PREFIX + resources.version);
    const assetPath = url.pathname.replace(/^\/(assets|fonts|media)\/~[a-f0-9]+\//, '/$1/');
    const assetQuery = new URL(url.href).searchParams;
    // Release pins isolate game code/data, but do not change downloaded art bytes.
    // Reuse manifest cache keys instead of downloading a copy for every release.
    assetQuery.delete('release');
    let path = assetPath + (assetQuery.toString() ? '?'+assetQuery.toString() : '');
    if (path === '/fonts/fonts.css') { const response = new Response(resources.fontCss,{headers:{'Content-Type':'text/css'}}); await cache.put(path,response.clone()); return response; }
    if (path.startsWith('/media/')) {
      const stem = '/assets/audio/' + path.slice('/media/'.length);
      path = resources.files.find(f => ['.mp3', '.ogg', '.wav'].some(ext => f.path === stem + ext))?.path || path;
    }
    const cached = await cache.match(path) || await caches.match(path) || await caches.match(url.pathname);
    if(cached)return cached;
    const file = resources.files.find(f => f.path === path);
    if (file) { await download(file, cache, resources); return await cache.match(path) || caches.match(path); }
    const response=await fetch(event.request);
    if(response.ok)await cache.put(path,response.clone());
    return response;
  })());
});

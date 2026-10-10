import { normalizeAtlas } from './vendor/resource-atlas.mjs';

const PREFIX = 'stronghold-resources-';
let indexPromise;
let preparing;
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
  const keys = new Set((await cache.keys()).map(key => new URL(key.url).pathname));
  const marked = keys.has('/fonts/fonts.css') && keys.has('/__resources_ready__');
  if (!marked) return false;
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX) || name === PREFIX + resources.version) continue;
    for (const key of await (await caches.open(name)).keys()) keys.add(new URL(key.url).pathname);
  }
  return resources.files.every(file => keys.has(file.path));
}

function download(file, cache, resources) {
  const key = resources.version + ':' + file.path;
  if (downloads.has(key)) return downloads.get(key);
  const job = downloadOne(file, cache, resources).finally(() => downloads.delete(key));
  downloads.set(key, job);
  return job;
}

async function downloadOne(file, cache, resources) {
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
      await cache.put(file.path, new Response(payload, { headers: { 'Content-Type': contentType(file.path) } }));
      return;
    } catch (error) {
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
  const resources = await index();
  const cache = await caches.open(PREFIX + resources.version);
  const valid = resume.version === resources.version;
  let cursor = valid ? Math.max(0, Math.min(resources.files.length, resume.cursor || 0)) : 0;
  let attempt = valid ? resume.attempt || 0 : 0;
  let failed = valid ? resume.failed || [] : [];
  let retryFiles = valid ? resume.retryFiles || null : null;
  let done = valid ? resume.done || 0 : 0;
  if (!background && !valid) await cache.delete('/__resources_ready__');
  await cache.put('/fonts/fonts.css', new Response(resources.fontCss, {headers:{'Content-Type':'text/css'}}));
  const started = Date.now(), byPath = new Map(resources.files.map(file => [file.path, file]));
  const active = new Map();
  const limit = background ? 4 : 6;
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
  const continuation = () => ({type:'continue', done, total:resources.files.length,
    resume:{version:resources.version, cursor, attempt, failed, retryFiles, done, pending:[...active.keys()]}});
  try {
    while (true) {
      const queue = retryFiles || resources.files.map(file => file.path);
      while (active.size < limit && cursor < queue.length && processed < 64 && Date.now() - started < 5000) launch(queue[cursor++]);
      if (active.size) {
        const result = await Promise.race([...active.values(), deadline]);
        if (!result) return continuation();
        active.delete(result.path); processed++;
        if (result.storageFull) throw new Error(result.error);
        if (result.error) failed.push({path:result.path, message:result.error});
        if (!retryFiles) done++;
        send({type:'progress', done, total:resources.files.length, phase:attempt ? 'retry' : 'download', attempt, path:result.error ? null : result.path});
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
      if (event.data.type === 'status') {
        indexPromise = undefined;
        const resources = await index();
        const cache = await caches.open(PREFIX + resources.version);
        const current=await complete(cache,resources);
        let reusable=false;
        if(!current)for(const name of await caches.keys()){if(!name.startsWith(PREFIX))continue;const old=await caches.open(name);if(await old.match('/__resources_ready__') && await old.match('/fonts/fonts.css')){reusable=true;break;}}
        port.postMessage({type:'status',ready:current||reusable,patch:!current&&reusable});
      } else if (event.data.type === 'prepare' || event.data.type === 'preparePatch') {
        listeners.add(port);
        try {
          preparing ||= prepare(event.data.type === 'preparePatch', event.data.resume).finally(() => { preparing = undefined; });
          port.postMessage(await preparing);
        } finally { listeners.delete(port); }
      }
    } catch (error) { port.postMessage({ type: 'error', message: error.message }); }
  })());
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin || event.request.method !== 'GET' ||
      (!/^\/(assets|fonts|media|data|i18n)\//.test(url.pathname) && url.pathname !== '/vendor/browser-resources.json')) return;
  event.respondWith((async () => {
    const resources = await index();
    const cache = await caches.open(PREFIX + resources.version);
    let path = url.pathname + url.search;
    if(/^\/(data|i18n)\//.test(url.pathname)||url.pathname==='/vendor/browser-resources.json'){
      try{const response=await fetch(event.request);if(response.ok)await cache.put(path,response.clone());return response;}
      catch(error){const old=await cache.match(path);if(old)return old;throw error;}
    }
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

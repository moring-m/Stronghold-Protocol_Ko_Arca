// Stable loopback gateway. Workers keep their own in-memory rooms until drained.
import http from "node:http";
import { createHash } from "node:crypto";
import { bootstrap } from "./bootstrap.js";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from 'node:stream';
import { authorized, json, body } from './runtime.js';
import { RELEASE_RETENTION_MS } from '../../shared/releaseRetirement.js';
import { transform } from './transform.js';
export async function startGateway({
  port = 3000,
  host = "127.0.0.1",
  stateFile,
  token,
  log = console,
  now = Date.now,
} = {}) {
  if (!stateFile || !token)
    throw Error("Gateway requires a state file and private token");
  let state = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
    : { current: null, releases: {} };
  const transformed = new Map(),
    transforming = new Map(),
    lookupRates = new Map();
  const releaseSockets = new Map(), expiring = new Set();
  let cachedBytes = 0;
  const cacheLimit = 16 * 1024 * 1024;
  const validId = (id) => /^[a-f0-9]{12,40}$/.test(id || "");
  for (const [id, r] of Object.entries(state.releases))
    if (
      !validId(id) ||
      !Number.isInteger(r.port) ||
      r.port < 1024 ||
      r.port > 65535 ||
      !/^[AB]$/.test(r.prefix)
    )
      throw Error("Invalid gateway state");
  for(const r of Object.values(state.releases))delete r.deadlineSynced;
  const save = () => {
    fs.mkdirSync(path.dirname(stateFile), { recursive: true });
    const temp = stateFile + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(state), { mode: 0o600 });
    fs.renameSync(temp, stateFile);
  };
  async function control(id, action = "status", input) {
    const r = state.releases[id];
    if (!r) throw Error("Unknown release");
    const response = await fetch(
      `http://127.0.0.1:${r.port}/__release/${action}`,
      {
        method: input ? "POST" : "GET",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: input ? JSON.stringify(input) : undefined,
        signal: AbortSignal.timeout(5000),
      },
    );
    if (!response.ok) throw Error("Worker control failed");
    const result = await response.json();
    if (result.release && result.release !== id)
      throw Error("Worker release mismatch");
    return result;
  }
  let statusCache = null, statusAt = 0, statusPending = null;
  const expired = id => id!==state.current && Number.isSafeInteger(state.releases[id]?.expiresAt) && state.releases[id].expiresAt<=now();
  async function ensureDeadlines(){
    let changed=false;
    for(const [id,r] of Object.entries(state.releases))if(id!==state.current&&!r.expiresAt){r.expiresAt=now()+RELEASE_RETENTION_MS;changed=true;}
    if(changed)save();
    for(const [id,r] of Object.entries(state.releases))if(id!==state.current&&r.expiresAt&&!r.deadlineSynced){
      try{const status=await control(id);r.retirementNotices=!!status.retirementNotices;await control(id,'drain',{draining:true,expiresAt:r.expiresAt});r.deadlineSynced=true;save();}catch{}
    }
  }
  async function expireRetained(){
    for(const id of Object.keys(state.releases))if(expired(id)&&!expiring.has(id)){
      expiring.add(id);
      for(const socket of releaseSockets.get(id)||[])socket.destroy();
      try{await control(id,'shutdown',{});}catch{}
    }
  }
  async function publicStatus() {
    if (statusCache && Date.now() - statusAt < 4000) return statusCache;
    if (statusPending) return statusPending;
    statusPending = (async () => {
      const workers = await Promise.all(Object.keys(state.releases).map(async release => {
        try {
          const r = state.releases[release];
          const response = await fetch(`http://127.0.0.1:${r.port}/healthz`, {signal:AbortSignal.timeout(2500)});
          if (!response.ok) throw Error('Unavailable worker');
          const h = await response.json();
          // Only existing public health fields; never publish room codes or control data.
          const row = {release, expiresAt:r.expiresAt??null, available:true, draining:release!==state.current, app:h.app, build:h.build, uptimeSec:h.uptimeSec};
          for (const key of ['rooms','matches','humans','bots','spectators','sockets']) row[key] = Number.isFinite(h[key]) ? h[key] : 0;
          return row;
        } catch { return {release, available:false, draining:release!==state.current}; }
      }));
      const totals = Object.fromEntries(['rooms','matches','humans','bots','spectators','sockets'].map(key=>[key,workers.reduce((n,w)=>n+(w[key]||0),0)]));
      statusCache = {ok:workers.length>0&&workers.every(w=>w.available), rolling:true, current:state.current, totals, workers};
      statusAt = Date.now(); return statusCache;
    })();
    try { return await statusPending; } finally { statusPending = null; }
  }
  async function owner(code) {
    const candidate = Object.entries(state.releases).find(
      ([id, r]) => r.prefix === code[0] && !expired(id),
    );
    if (!candidate) return null;
    const [id] = candidate;
    const status = await control(id);
    return status.codes.includes(code) ? id : null;
  }
  function route(req) {
    const url = new URL(req.url, "http://gateway");
    let id = url.searchParams.get("release"),
      pathname = url.pathname;
    const match = /^\/r\/([a-f0-9]{12,40})(\/.*)$/.exec(pathname);
    if (match) {
      id = match[1];
      pathname = match[2];
    }
    if (!id) {
      try {
        const ref = new URL(req.headers.referer);
        id =
          ref.searchParams.get("release") ||
          /^\/r\/([a-f0-9]{12,40})\//.exec(ref.pathname)?.[1];
      } catch {}
    }
    return { id: id || state.current, pathname, search: url.search, url };
  }
  async function admin(req, res, url) {
    if (!authorized(req, token)) {
      json(res, 403, { error: "Forbidden" });
      return;
    }
    if (url.pathname === "/__roll/admin/status" && req.method === "GET") {
      await ensureDeadlines();await expireRetained();
      const workers = {};
      for (const id of Object.keys(state.releases)) {
        try{
          const status=await control(id);
          // Older workers expose sockets only on healthz. A failed/missing metric is never zero.
          if(!Number.isFinite(status.sockets)){
            try{const response=await fetch(`http://127.0.0.1:${state.releases[id].port}/healthz`,{signal:AbortSignal.timeout(2500)});if(response.ok){const health=await response.json();if(Number.isFinite(health.sockets))status.sockets=health.sockets;}}catch{}
          }
          workers[id]={...status,...state.releases[id]};
        }
        catch{workers[id]={...state.releases[id],unavailable:true};}
      }
      json(res, 200, { current: state.current, workers });
      return;
    }
    if (req.method !== "POST") {
      json(res, 405, { error: "POST required" });
      return;
    }
    const input = await body(req),
      id = input.id;
    if (!validId(id)) {
      json(res, 400, { error: "Invalid release ID" });
      return;
    }
    if (url.pathname === "/__roll/admin/register") {
      if (!state.releases[id] && Object.keys(state.releases).length >= 2) {
        json(res, 409, {
          error: "A previous release is still retained; defer deployment",
        });
        return;
      }
      if (
        !Number.isInteger(input.port) ||
        input.port < 1024 ||
        input.port > 65535 ||
        !/^[AB]$/.test(input.prefix) ||
        Object.entries(state.releases).some(
          ([other, r]) =>
            other !== id &&
            (r.port === input.port || r.prefix === input.prefix),
        )
      ) {
        json(res, 400, { error: "Invalid or occupied worker port/prefix" });
        return;
      }
      if (state.releases[id]) {
        json(res, 200, { registered: id });
        return;
      }
      state.releases[id] = { port: input.port, prefix: input.prefix };
      try {
        const worker = await control(id);
        if (worker.roomPrefix !== input.prefix)
          throw Error("Worker prefix mismatch");
        state.releases[id].retirementNotices=!!worker.retirementNotices;
        save();
      } catch (e) {
        delete state.releases[id];
        throw e;
      }
      json(res, 200, { registered: id });
      return;
    }
    if (url.pathname === "/__roll/admin/activate") {
      const old = state.current;
      if (old === id) {
        await control(id, "drain", { draining: false });
        json(res, 200, { current: id });
        return;
      }
      if (!state.releases[id]) {
        json(res, 404, { error: "Register worker first" });
        return;
      }
      const status = await control(id);
      if (!status.draining) {
        json(res, 409, { error: "New worker must start draining" });
        return;
      }
      const previousOldDeadline=old?state.releases[old]?.expiresAt:null;
      const deadline=previousOldDeadline||now()+RELEASE_RETENTION_MS;
      if (old) await control(old, "drain", { draining: true, expiresAt:deadline });
      try {
        await control(id, "drain", { draining: false });
        state.current = id;
        delete state.releases[id].expiresAt;delete state.releases[id].deadlineSynced;
        if(old){state.releases[old].expiresAt=deadline;state.releases[old].deadlineSynced=true;}
        expiring.delete(id);
        save();
        statusCache=null;
      } catch (e) {
        state.current = old;
        if(old){if(previousOldDeadline)state.releases[old].expiresAt=previousOldDeadline;else delete state.releases[old].expiresAt;}
        await control(id, "drain", { draining: true }).catch(() => {});
        if (old)
          await control(old, "drain", { draining: false }).catch(() => {});
        throw e;
      }
      json(res, 200, { current: id, retained: old });
      return;
    }
    if (url.pathname === "/__roll/admin/retire" || url.pathname === "/__roll/admin/force-retire") {
      if (id === state.current) {
        json(res, 409, { error: "Cannot retire current release" });
        return;
      }
      if(!state.releases[id]){json(res,404,{error:'Unknown release'});return;}
      const forced=url.pathname.endsWith('/force-retire');
      if(forced){for(const socket of releaseSockets.get(id)||[])socket.destroy();await control(id,'shutdown',{}).catch(()=>{});}
      const status = forced?{draining:true,rooms:0,matches:0}:await control(id);
      if (!status.draining || status.rooms || status.matches) {
        json(res, 409, { error: "Release still owns rooms; never stop it" });
        return;
      }
      const original = state.releases[id];
      delete state.releases[id];
      for (const [key, value] of transformed)
        if (key.startsWith(id + ":")) {
          cachedBytes -= value.content.length;
          transformed.delete(key);
        }
      try {
        save();
      } catch (e) {
        state.releases[id] = original;
        throw e;
      }
      releaseSockets.delete(id);expiring.delete(id);statusCache=null;
      json(res, 200, { retired: id });
      return;
    }
    json(res, 404, { error: "Unknown administrative action" });
  }
  async function handle(req, res) {
    const url = new URL(req.url, "http://gateway");
    if (
      url.pathname.startsWith("/__roll/room/") ||
      (url.pathname === "/" && url.searchParams.has("room"))
    ) {
      const key = String(
          req.headers["x-forwarded-for"] || req.socket.remoteAddress,
        )
          .split(",")[0]
          .trim(),
        now = Date.now();
      let rate = lookupRates.get(key);
      if (!rate || now - rate.at > 60000) {
        rate = { at: now, count: 0 };
        if (lookupRates.size >= 2048)
          lookupRates.delete(lookupRates.keys().next().value);
        lookupRates.set(key, rate);
      }
      if (++rate.count > 120) {
        json(res, 429, { error: "Too many room lookups" });
        return;
      }
    }
    res.setHeader("x-content-type-options", "nosniff");
    if(url.pathname==='/__roll/retirement-monitor.js'){
      res.writeHead(200,{'content-type':'text/javascript; charset=utf-8','cache-control':'no-store'});
      res.end(fs.readFileSync(new URL('./retirement-browser.js',import.meta.url),'utf8'));return;
    }
    if (url.pathname.startsWith("/__roll/admin/")) {
      await admin(req, res, url);
      return;
    }
    if (url.pathname === "/__roll/status.json" && req.method === "GET") {
      json(res, 200, await publicStatus());
      return;
    }
    if(url.pathname==='/__roll/retirement'){
      const id=url.searchParams.get('id');if(!validId(id)){json(res,400,{error:'Invalid release'});return;}
      await ensureDeadlines();const r=state.releases[id];json(res,200,{current:state.current,expiresAt:id!==state.current?r?.expiresAt??null:null,expired:!r||expired(id),serverNotices:!!r?.retirementNotices,serverNow:now()});return;
    }
    if (url.pathname === "/__roll/latest") {
      json(res, state.current ? 200 : 503, { build: state.current });
      return;
    }
    const room = /^\/__roll\/room\/([A-Z]{4})$/.exec(url.pathname);
    if (room) {
      const id = await owner(room[1]);
      json(
        res,
        id ? 200 : 404,
        id ? { release: id } : { error: "Room not found" },
      );
      return;
    }
    if (url.pathname === "/") {
      const code = (url.searchParams.get("room") || "").toUpperCase();
      const id = /^[A-Z]{4}$/.test(code) ? await owner(code) : state.current;
      if (!id) {
        json(res, 503, { error: "No release is available" });
        return;
      }
      // Only tabs in a room resume their release; lobby reloads select the latest.
      // Room invites explicitly choose their owner; a retired version falls back to current.
      const available=Object.keys(state.releases).filter(id=>!expired(id)),invited=/^[A-Z]{4}$/.test(code);
      const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>위수 프로토콜</title><style>html,body{margin:0;background:#0c0f0e;color-scheme:dark}</style><script>(()=>{const releases=${JSON.stringify(available)},current=${JSON.stringify(id)},invited=${invited};let remembered,inRoom=false;try{remembered=sessionStorage.getItem('sp.activeRelease');inRoom=sessionStorage.getItem('sp.roomRelease')===remembered;}catch{}const navigation=performance.getEntriesByType('navigation')[0]?.type,resuming=navigation==='reload'||navigation==='back_forward';const release=!invited&&resuming&&inRoom&&releases.includes(remembered)?remembered:current;const url=new URL(location.href);url.pathname='/r/'+release+'/';url.searchParams.delete('release');location.replace(url.pathname+url.search+url.hash);})();</script></head><body></body></html>`;
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      res.end(req.method==='HEAD'?undefined:html);
      return;
    }
    const target = route(req);
    let decoded;
    try {
      decoded = decodeURIComponent(target.pathname);
    } catch {
      json(res, 400, { error: "Invalid path" });
      return;
    }
    if (decoded.startsWith("/__release/") || decoded.startsWith("/__roll/")) {
      json(res, 403, { error: "Private worker controls" });
      return;
    }
    const worker = state.releases[target.id];
    if (!worker || expired(target.id)) {
      if (req.headers.accept?.includes("text/html")) {
        res.writeHead(302, { location: "/", "cache-control": "no-store" });
        res.end();
      } else
        json(res, 410, {
          error: "This release has ended; return to the main screen",
        });
      return;
    }
    const headers = { ...req.headers, host: `127.0.0.1:${worker.port}` };
    // JSON, model/texture and font bodies are forwarded unchanged. Preserve their
    // compression and validators; only text rewritten below needs identity bytes.
    const passthrough=/\.(?:json|skel|atlas|png|jpe?g|webp|gif|svg|woff2?|ttf|otf|mp3|ogg|wav|gz)$/i.test(target.pathname);
    if(!passthrough){
      delete headers["accept-encoding"];
      delete headers["if-none-match"];
      delete headers["if-modified-since"];
    }
    const pinned=target.url.searchParams.has('release')||/^\/r\/[a-f0-9]{12,40}\//.test(target.url.pathname);
    const clientHeaders=out=>{
      const type=String(out['content-type']||'');
      return type.includes('javascript')||type.includes('text/css')?{...out,'cache-control':pinned?'public, max-age=31536000, immutable':'no-store'}:out;
    };
    const cacheKey = target.id + ":" + target.pathname;
    if (
      req.method === "GET" &&
      !req.headers.range &&
      transformed.has(cacheKey)
    ) {
      const hit = transformed.get(cacheKey);
      transformed.delete(cacheKey);
      transformed.set(cacheKey, hit);
      res.writeHead(200, clientHeaders(hit.headers));
      res.end(hit.content);
      return;
    }
    // Coalesce module loads during join/reconnect bursts. Otherwise every browser
    // allocates and parses another copy of the same source before it enters cache.
    const shareTransform = req.method === "GET" && !req.headers.range &&
      (/\.(?:js|css|html)$/.test(target.pathname) || target.pathname === "/");
    if (shareTransform && transforming.has(cacheKey)) {
      const shared = await transforming.get(cacheKey);
      if (shared) {
        if (!res.destroyed) { res.writeHead(200, clientHeaders(shared.headers)); res.end(shared.content); }
        return;
      }
    }
    let completeTransform;
    if (shareTransform) {
      const pending = new Promise(resolve => { completeTransform = resolve; });
      transforming.set(cacheKey, pending);
      const resolve = completeTransform;
      completeTransform = value => {
        if (transforming.get(cacheKey) === pending) transforming.delete(cacheKey);
        resolve(value);
      };
    }
    const proxy = http.request(
      {
        host: "127.0.0.1",
        port: worker.port,
        path: target.pathname + target.search,
        method: req.method,
        headers,
      },
      async (upstream) => {
        // Response callbacks run after the request handler has returned. A browser
        // may have cancelled meanwhile; piping to its destroyed response can throw
        // synchronously, outside pipeline's completion callback.
        if (res.destroyed || res.writableEnded) {
          completeTransform?.(null);
          upstream.destroy();
          return;
        }
        const type = String(upstream.headers["content-type"] || "");
        const rewrite =
          type.includes("javascript") ||
          type.includes("text/html") ||
          type.includes("text/css");
        const out = { ...upstream.headers, "referrer-policy": "same-origin" };
        if (req.method === "HEAD") {
          completeTransform?.(null);
          res.writeHead(upstream.statusCode, out);
          upstream.resume();
          res.end();
          return;
        }
        if (!rewrite) {
          completeTransform?.(null);
          try {
            res.writeHead(upstream.statusCode, out);
            pipeline(upstream, res, () => {});
          } catch (error) {
            upstream.destroy();
            res.destroy();
            if (error.code !== 'ERR_STREAM_UNABLE_TO_PIPE' && error.code !== 'ERR_STREAM_DESTROYED') log.error(error);
          }
          return;
        }
        try {
          const chunks = [];
          let bytes = 0;
          for await (const chunk of upstream) {
            bytes += chunk.length;
            if (bytes > 16 * 1024 * 1024)
              throw Error("Static text response too large");
            chunks.push(chunk);
          }
          const content = Buffer.from(
            await transform(Buffer.concat(chunks).toString(), type, target.id, {cleanUrls:true}),
          );
          // Workers and the retained router can run different bootstrap revisions.
          // Authorize exactly the script this router injected, not the worker's version.
          if (type.includes('text/html') && out['content-security-policy']) {
            const hash = "'sha256-" + createHash('sha256').update(bootstrap(target.id,{cleanUrls:true})).digest('base64') + "'";
            out['content-security-policy'] = out['content-security-policy'].replace(/(^|;\s*)script-src\s+([^;]*)/, (_,prefix,sources) => prefix+'script-src '+sources+' '+hash);
          }
          delete out["content-encoding"];
          delete out["transfer-encoding"];
          delete out.etag;
          out["content-length"] = content.length;
          out["cache-control"] = "no-store";
          if (
            upstream.statusCode === 200 &&
            req.method === "GET" &&
            !req.headers.range &&
            content.length <= cacheLimit
          ) {
            while (
              cachedBytes + content.length > cacheLimit &&
              transformed.size
            ) {
              const key = transformed.keys().next().value;
              cachedBytes -= transformed.get(key).content.length;
              transformed.delete(key);
            }
            if (transformed.has(cacheKey))
              cachedBytes -= transformed.get(cacheKey).content.length;
            transformed.set(cacheKey, { headers: out, content });
            cachedBytes += content.length;
          }
          completeTransform?.(upstream.statusCode === 200 ? {headers:out, content} : null);
          if (!res.destroyed) { res.writeHead(upstream.statusCode, clientHeaders(out)); res.end(content); }
        } catch (e) {
          completeTransform?.(null);
          log.error(e);
          if (!res.headersSent)
            json(res, 502, { error: "Cannot serve release asset" });
          else res.destroy();
        }
      },
    );
    proxy.on("error", () => {
      completeTransform?.(null);
      if (res.destroyed || res.writableEnded) return;
      if (!res.headersSent)
        json(res, 502, {
          error: "Worker unavailable; room ownership retained",
        });
      else res.destroy();
    });
    req.pipe(proxy);
  }
  const server = http.createServer((req, res) =>
    handle(req, res).catch((e) => {
      log.error(e.message);
      if (!res.headersSent)
        json(res, 503, { error: "Release operation unavailable" });
      else res.destroy();
    }),
  );
  server.on("upgrade", (req, socket, head) => {
    // A client can reset the TCP connection before the worker accepts the upgrade.
    // Register handlers immediately: an unhandled socket error exits the router.
    let request, upstreamSocket;
    const cancel = () => { request?.destroy(); upstreamSocket?.destroy(); };
    socket.on("error", cancel);
    socket.on("close", cancel);
    socket.setTimeout(0);
    const target = route(req),
      worker = state.releases[target.id];
    if (
      target.pathname !== "/ws" ||
      !worker || expired(target.id) ||
      !target.url.searchParams.has("release")
    ) {
      socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n");
      return;
    }
    if(!releaseSockets.has(target.id))releaseSockets.set(target.id,new Set());
    releaseSockets.get(target.id).add(socket);
    socket.on('close',()=>releaseSockets.get(target.id)?.delete(socket));
    request = http.request({
      host: "127.0.0.1",
      port: worker.port,
      path: "/ws",
      headers: { ...req.headers, host: `127.0.0.1:${worker.port}` },
    });
    request.on("upgrade", (response, upstream, extra) => {
      upstreamSocket = upstream;
      upstream.on("error", () => socket.destroy());
      upstream.on("close", () => socket.destroy());
      upstream.setTimeout(0);
      if (socket.destroyed) { upstream.destroy(); return; }
      socket.write(
        `HTTP/1.1 ${response.statusCode} Switching Protocols\r\n` +
          Object.entries(response.headers)
            .map(([k, v]) => `${k}: ${v}\r\n`)
            .join("") +
          "\r\n",
      );
      if (extra.length) socket.write(extra);
      if (head.length) upstream.write(head);
      socket.pipe(upstream).pipe(socket);
    });
    request.on("response", (response) => {
      response.resume();
      socket.end("HTTP/1.1 502 Bad Gateway\r\nConnection: close\r\n\r\n");
    });
    request.on("error", () => socket.destroy());
    request.end();
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const expiryTimer=setInterval(()=>expireRetained().catch(e=>log.error(e)),1000);expiryTimer.unref();
  return {
    expireRetained,
    server,
    port: server.address().port,
    state: () => structuredClone(state),
    close: () =>
      new Promise((resolve) => {
        clearInterval(expiryTimer);
        server.close(resolve);
        server.closeIdleConnections();
      }),
  };
}
if (process.argv[1]?.endsWith("/release/gateway.js")) {
  const token = fs
    .readFileSync(process.env.SP_RELEASE_TOKEN_FILE, "utf8")
    .trim();
  const gateway = await startGateway({
    port: Number(process.env.PORT || 3000),
    stateFile: process.env.SP_RELEASE_STATE_FILE,
    token,
  });
  console.log("Release gateway listening on loopback port", gateway.port);
}

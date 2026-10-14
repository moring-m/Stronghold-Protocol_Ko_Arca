// Stable loopback gateway. Workers keep their own in-memory rooms until drained.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream";
import { authorized, json, body } from "./runtime.js";
import { transform } from "./transform.js";
export async function startGateway({
  port = 3000,
  host = "127.0.0.1",
  stateFile,
  token,
  log = console,
} = {}) {
  if (!stateFile || !token)
    throw Error("Gateway requires a state file and private token");
  let state = fs.existsSync(stateFile)
    ? JSON.parse(fs.readFileSync(stateFile, "utf8"))
    : { current: null, releases: {} };
  const transformed = new Map(),
    lookupRates = new Map();
  let cachedBytes = 0;
  const cacheLimit = 32 * 1024 * 1024;
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
          const row = {release, available:true, draining:release!==state.current, app:h.app, build:h.build, uptimeSec:h.uptimeSec};
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
      ([, r]) => r.prefix === code[0],
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
      const workers = {};
      for (const id of Object.keys(state.releases))
        workers[id] = { ...state.releases[id], ...(await control(id)) };
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
      if (old) await control(old, "drain", { draining: true });
      try {
        await control(id, "drain", { draining: false });
        state.current = id;
        save();
      } catch (e) {
        state.current = old;
        await control(id, "drain", { draining: true }).catch(() => {});
        if (old)
          await control(old, "drain", { draining: false }).catch(() => {});
        throw e;
      }
      json(res, 200, { current: id, retained: old });
      return;
    }
    if (url.pathname === "/__roll/admin/retire") {
      if (id === state.current) {
        json(res, 409, { error: "Cannot retire current release" });
        return;
      }
      const status = await control(id);
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
    if (url.pathname.startsWith("/__roll/admin/")) {
      await admin(req, res, url);
      return;
    }
    if (url.pathname === "/__roll/status.json" && req.method === "GET") {
      json(res, 200, await publicStatus());
      return;
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
      res.writeHead(302, {
        location: `/r/${id}/${url.search}`,
        "cache-control": "no-store",
      });
      res.end();
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
    if (!worker) {
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
    delete headers["accept-encoding"];
    delete headers["if-none-match"];
    delete headers["if-modified-since"];
    const cacheKey = target.id + ":" + target.pathname;
    if (
      req.method === "GET" &&
      !req.headers.range &&
      transformed.has(cacheKey)
    ) {
      const hit = transformed.get(cacheKey);
      transformed.delete(cacheKey);
      transformed.set(cacheKey, hit);
      res.writeHead(200, hit.headers);
      res.end(hit.content);
      return;
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
        const type = String(upstream.headers["content-type"] || "");
        const rewrite =
          type.includes("javascript") ||
          type.includes("text/html") ||
          type.includes("text/css");
        const out = { ...upstream.headers, "referrer-policy": "same-origin" };
        if (req.method === "HEAD") {
          res.writeHead(upstream.statusCode, out);
          upstream.resume();
          res.end();
          return;
        }
        if (!rewrite) {
          res.writeHead(upstream.statusCode, out);
          pipeline(upstream, res, () => {});
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
            await transform(Buffer.concat(chunks).toString(), type, target.id),
          );
          delete out["content-encoding"];
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
          res.writeHead(upstream.statusCode, out);
          res.end(content);
        } catch (e) {
          log.error(e);
          if (!res.headersSent)
            json(res, 502, { error: "Cannot serve release asset" });
          else res.destroy();
        }
      },
    );
    proxy.on("error", () => {
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
    const target = route(req),
      worker = state.releases[target.id];
    if (
      target.pathname !== "/ws" ||
      !worker ||
      !target.url.searchParams.has("release")
    ) {
      socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\n\r\n");
      return;
    }
    const request = http.request({
      host: "127.0.0.1",
      port: worker.port,
      path: "/ws",
      headers: { ...req.headers, host: `127.0.0.1:${worker.port}` },
    });
    request.on("upgrade", (response, upstream, extra) => {
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
      socket.on("error", () => upstream.destroy());
      upstream.on("error", () => socket.destroy());
      socket.on("close", () => upstream.destroy());
      upstream.on("close", () => socket.destroy());
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
  return {
    server,
    port: server.address().port,
    state: () => structuredClone(state),
    close: () =>
      new Promise((resolve) => {
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

import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { startGateway } from "../../server/release/gateway.js";
const run = process.env.SP_RELEASE_BROWSER === "1";
test(
  "browser modules, deferred imports, fetches, workers, CSS and preferences remain pinned across a release switch",
  { skip: !run },
  async (t) => {
    const { default: P } = await import("puppeteer-core");
    const browser = await P.launch({
      executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
      args: ["--no-sandbox"],
    });
    t.after(() => browser.close());
    const dir = await mkdtemp(join(tmpdir(), "release-browser-"));
    t.after(() => rm(dir, { recursive: true, force: true }));
    const token = "browser-control",
      old = "111111111111",
      next = "222222222222";
    async function worker(id) {
      let draining = true;
      const server = http.createServer(async (req, res) => {
        const path = new URL(req.url, "http://worker").pathname;
        if (path === "/__release/status") {
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              release: id,
              roomPrefix: id === old ? "A" : "B",
              draining,
              rooms: 0,
              matches: 0,
              codes: [],
            }),
          );
          return;
        }
        if (path === "/__release/drain") {
          let text = "";
          for await (const chunk of req) text += chunk;
          draining = JSON.parse(text).draining;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ draining }));
          return;
        }
        const files = {
          "/": [
            "text/html",
            `<html><head><link rel="stylesheet" href="/css/theme.css"></head><body><script type="module" src="/js/main.js"></script></body></html>`,
          ],
          "/js/main.js": [
            "text/javascript",
            `import {value}from '../../shared/value.js';globalThis.value=value;globalThis.getData=()=>fetch('/data/version.json').then(r=>r.json());globalThis.late=()=>import('/js/late.js');globalThis.dynamic=()=>import(new URL('/js/other.js',location.origin).href);const worker=new Worker('/js/worker.js',{type:'module'});worker.onmessage=e=>globalThis.workerVersion=e.data;globalThis.workerRef=worker;const image=new Image();image.src='/image.svg';document.body.append(image);localStorage.setItem('release-test','preserved');`,
          ],
          "/js/worker.js": [
            "text/javascript",
            `import{value}from '../../shared/value.js';fetch('/data/version.json').then(r=>r.json()).then(data=>postMessage([value,data.value]));`,
          ],
          "/shared/value.js": [
            "text/javascript",
            `export const value=${JSON.stringify(id)};`,
          ],
          "/js/late.js": [
            "text/javascript",
            `export const value=${JSON.stringify(id)};`,
          ],
          "/js/other.js": [
            "text/javascript",
            `export const value=${JSON.stringify(id)};`,
          ],
          "/css/theme.css": [
            "text/css",
            `body{background-image:url('/image.svg');}`,
          ],
          "/image.svg": [
            "image/svg+xml",
            '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>',
          ],
          "/data/version.json": [
            "application/json",
            JSON.stringify({ value: id }),
          ],
        };
        const [type, text] = files[path] || ["text/plain", "missing"];
        res.writeHead(files[path] ? 200 : 404, { "content-type": type });
        res.end(text);
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      t.after(() => new Promise((resolve) => server.close(resolve)));
      return server.address().port;
    }
    const gateway = await startGateway({
      port: 0,
      stateFile: join(dir, "state"),
      token,
    });
    t.after(() => gateway.close());
    const base = `http://127.0.0.1:${gateway.port}`;
    const admin = async (action, input) => {
      const response = await fetch(base + "/__roll/admin/" + action, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      });
      assert.equal(response.status, 200);
    };
    await admin("register", { id: old, port: await worker(old), prefix: "A" });
    await admin("activate", { id: old });
    const page = await browser.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(base);
    await page.waitForFunction(() => !!window.workerVersion);
    assert.equal(await page.evaluate(() => value), old);
    assert.equal(new URL(page.url()).pathname,'/');
    assert.deepEqual(await page.evaluate(() => workerVersion), [old, old]);
    await admin("register", {
      id: next,
      port: await worker(next),
      prefix: "B",
    });
    await admin("activate", { id: next });
    assert.equal((await page.evaluate(() => getData())).value, old);
    assert.equal(await page.evaluate(async () => (await late()).value), old);
    assert.equal(await page.evaluate(async () => (await dynamic()).value), old);
    const css = await page.$eval(
      "body",
      (el) => getComputedStyle(el).backgroundImage,
    );
    assert.ok(css.includes("release=" + old));
    assert.ok((await page.$eval('img',img=>img.src)).includes('release='+old));
    await page.evaluate(id=>sessionStorage.setItem('sp.roomRelease',id),old);
    await page.reload();await page.waitForFunction(()=>!!window.workerVersion);
    assert.equal(new URL(page.url()).pathname,'/');
    assert.equal(await page.evaluate(()=>value),old,'refresh in a room resumes its version');
    assert.deepEqual(await page.evaluate(()=>workerVersion),[old,old]);

    await page.evaluate(()=>sessionStorage.removeItem('sp.roomRelease'));
    await page.reload();await page.waitForFunction(()=>!!window.workerVersion);
    assert.equal(await page.evaluate(()=>value),next,'lobby reload selects the latest release');

    const second = await browser.newPage();
    await second.goto(base);
    await second.waitForFunction(() => !!window.workerVersion);
    assert.equal(await second.evaluate(() => value), next);
    assert.equal(
      await second.evaluate(() => localStorage.getItem("release-test")),
      "preserved",
    );

    await page.evaluate(()=>window.__SP_GO_LATEST());
    await page.waitForFunction(expected=>window.value===expected,{},next);
    assert.equal(new URL(page.url()).pathname,'/');
    const retired=await fetch(base+'/__roll/admin/retire',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({id:old})});assert.equal(retired.status,200);
    await second.evaluate(id=>sessionStorage.setItem('sp.activeRelease',id),old);
    await second.reload();await second.waitForFunction(expected=>window.value===expected,{},next);
    assert.equal(new URL(second.url()).pathname,'/');
    assert.deepEqual(errors, []);
  },
);

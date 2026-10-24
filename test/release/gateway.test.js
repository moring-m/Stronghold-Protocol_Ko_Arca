import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WebSocket } from "ws";
import { startServer } from "../../server/index.js";
import { startGateway } from "../../server/release/gateway.js";
import { transform } from "../../server/release/transform.js";
const OLD = "111111111111",
  NEW = "222222222222",
  THIRD = "333333333333",
  token = "test-control-token";
async function socket(port, id, resume) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws?release=${id}`),
    seen = [];
  let sequence = 1;
  ws.on("message", (data) => seen.push(JSON.parse(data)));
  await new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
  });
  const wait = (predicate) =>
    new Promise((resolve, reject) => {
      const deadline = Date.now() + 8000;
      const tick = () => {
        const found = seen.find(predicate);
        if (found) {
          resolve(found);
          return;
        }
        if (Date.now() > deadline) {
          reject(Error("Frame timeout " + JSON.stringify(seen.slice(-3))));
          return;
        }
        setTimeout(tick, 5);
      };
      tick();
    });
  ws.send(
    JSON.stringify({
      t: "hello",
      version: 1,
      name: "테스터",
      ...(resume ? { token: resume } : {}),
    }),
  );
  const welcome = await wait((x) => x.t === "welcome");
  return {
    ws,
    welcome,
    seen,
    request: async (t, fields = {}) => {
      const rid = sequence++;
      ws.send(JSON.stringify({ t, rid, ...fields }));
      return wait((x) => x.rid === rid);
    },
    wait,
  };
}
test("rollover retains rooms and websocket reconnects; only new rooms move to the new release", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "release-test-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const old = await startServer({
      port: 0,
      host: "127.0.0.1",
      quiet: true,
      releaseId: OLD,
      releaseToken: token,
      roomCodePrefix: "A",
    }),
    next = await startServer({
      port: 0,
      host: "127.0.0.1",
      quiet: true,
      releaseId: NEW,
      releaseToken: token,
      roomCodePrefix: "B",
    });
  t.after(() => Promise.all([old.close(), next.close()]));
  const gateway = await startGateway({
    port: 0,
    stateFile: join(dir, "state.json"),
    token,
    log: { error() {} },
  });
  t.after(() => gateway.close());
  const url = `http://127.0.0.1:${gateway.port}`,
    post = async (action, input) => {
      const r = await fetch(url + "/__roll/admin/" + action, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(input),
      });
      return { status: r.status, data: await r.json() };
    };
  assert.equal(
    (await post("register", { id: OLD, port: old.port, prefix: "A" })).status,
    200,
  );
  assert.equal((await post("activate", { id: OLD })).status, 200);
  const client = await socket(gateway.port, OLD);
  t.after(() => client.ws.close());
  assert.equal(
    (
      await client.request("room.create", {
        mode: "solo",
        difficulty: "NORMAL",
      })
    ).t,
    "ok",
  );
  const frame = await client.wait((x) => x.t === "room.state");
  const code = frame.code || frame.room?.code;
  assert.ok(code?.startsWith("A"), JSON.stringify(frame));
  const room = old.lobby.getRoom(code);
  assert.ok(room);
  assert.equal((await client.request("room.start")).t, "ok");
  assert.ok(room.match);
  assert.equal(
    (await post("register", { id: NEW, port: next.port, prefix: "B" })).status,
    200,
  );
  assert.equal((await post("activate", { id: NEW })).status, 200);
  assert.equal(old.lobby.getRoom(code), room);
  assert.ok(room.match);
  assert.equal(old.lobby.draining, true);
  assert.equal(next.lobby.draining, false);
  const entryHtml=await(await fetch(url+'/')).text();
  assert.ok(!entryHtml.includes('서버에 연결 중입니다.'));
  assert.match(entryHtml,/<body><\/body>/);
  assert.match(entryHtml,/sessionStorage.getItem/);
  assert.match(entryHtml,/location.replace/);
  assert.match(entryHtml,/background:#0c0f0e/);
  const statusResponse = await fetch(url + '/__roll/status.json');
  assert.equal(statusResponse.status,200);
  assert.equal(statusResponse.headers.get('cache-control'),'no-store');
  const status = await statusResponse.json();
  assert.equal(status.rolling,true);assert.equal(status.ok,true);assert.equal(status.workers.length,2);
  const controlStatus=await (await fetch(url+'/__roll/admin/status',{headers:{authorization:'Bearer '+token}})).json();assert.ok(Number.isInteger(controlStatus.workers[OLD].sockets));assert.ok(controlStatus.workers[OLD].sockets>0);
  assert.equal(status.totals.rooms,1);assert.equal(status.totals.matches,1);assert.equal(status.workers.find(w=>w.release===NEW).rooms,0);assert.equal(status.workers.find(w=>w.release===OLD).draining,true);
  assert.ok(!JSON.stringify(status).includes('codes'));assert.ok(!JSON.stringify(status).includes(token));

  assert.equal(
    (await fetch(url + "/__roll/room/" + code).then((r) => r.json())).release,
    OLD,
  );
  assert.equal((await post("retire", { id: OLD })).status, 409);
  assert.equal(
    (await post("register", { id: THIRD, port: 3019, prefix: "A" })).status,
    409,
  );
  const idle = await socket(gateway.port, OLD);
  t.after(() => idle.ws.close());
  assert.equal(
    (await idle.request("room.create", { mode: "solo", difficulty: "NORMAL" }))
      .t,
    "error",
  );
  const newer = await socket(gateway.port, NEW);
  t.after(() => newer.ws.close());
  assert.equal(
    (await newer.request("room.create", { mode: "solo", difficulty: "NORMAL" }))
      .t,
    "ok",
  );
  const newFrame = await newer.wait((x) => x.t === "room.state");
  assert.ok((newFrame.code || newFrame.room?.code).startsWith("B"));
  // The old room is retained, never copied into the new worker.
  assert.equal(old.lobby.rooms.size,1);assert.equal(next.lobby.rooms.size,1);
  assert.equal(old.lobby.getRoom(newFrame.code || newFrame.room?.code),null);
  assert.equal(next.lobby.getRoom(code),null);
  client.ws.close();
  await new Promise((resolve) => client.ws.once("close", resolve));
  const resumed = await socket(gateway.port, OLD, client.welcome.token);
  t.after(() => resumed.ws.close());
  assert.equal(resumed.welcome.playerId, client.welcome.playerId);
  assert.equal(old.lobby.getRoom(code), room);
  const privateResponse = await fetch(url + "/__release/status?release=" + OLD);
  assert.equal(privateResponse.status, 403);
  assert.equal((await fetch(url + "/__roll/admin/status")).status, 403);
  const response = await fetch(url + `/r/${OLD}/`);
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.ok(
    text.includes("globalThis.__SP_RELEASE=release"),
    text.slice(0, 1200),
  );
  assert.ok(text.includes("release=" + OLD));
  const js = await fetch(url + "/js/data.js?release=" + OLD).then((r) =>
    r.text(),
  );
  assert.ok(js.includes("../../shared/randomBand.js?release=" + OLD));
  old.lobby.disposeRoom(room, "test finished");
  assert.equal((await post("retire", { id: OLD })).status, 200);
  assert.equal((await fetch(url + "/js/data.js?release=" + OLD)).status, 410);
});
test("import rewriting preserves static, dynamic and commented text", async () => {
  const input = `// import './not-real.js'\nimport x from '../../shared/x.js';export {x} from './export.js';const d=import('./dynamic.js');const url=import.meta.url;`;
  const output = await transform(input, "text/javascript", OLD);
  assert.ok(output.includes("// import './not-real.js'"));
  assert.ok(output.includes("../../shared/x.js?release=" + OLD));
  assert.ok(output.includes(`import("./dynamic.js?release=${OLD}")`));
  assert.ok(output.includes("import.meta.url"));
});

 test("interpolated and computed dynamic imports preserve expressions and pin evaluated URLs",async()=>{
 const input='const a=import(`./ops/${file}`);const b=import(path);const c=import(`./fixed.js`);';
 const output=await transform(input,'text/javascript',OLD);
 assert.ok(!output.includes('./ops/*'));
 assert.ok(output.includes(')(`./ops/${file}`)'));
 assert.ok(output.includes(')(path)'));
 assert.ok(output.includes('import.meta.url'));
 assert.ok(output.includes('searchParams.set("release",'));
 assert.ok(output.includes('import("./fixed.js?release='+OLD+'")'));
 });

test('one-hour deadline and forced retirement close only the old release; active rooms are counted once',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'deadline-release-'));t.after(()=>rm(dir,{recursive:true,force:true}));let now=Date.now();
 const old=await startServer({port:0,host:'127.0.0.1',quiet:true,assetIndex:false,releaseId:OLD,releaseToken:token,roomCodePrefix:'A'}),next=await startServer({port:0,host:'127.0.0.1',quiet:true,assetIndex:false,releaseId:NEW,releaseToken:token,roomCodePrefix:'B'});t.after(()=>Promise.all([old.close(),next.close()]));
 const gateway=await startGateway({port:0,stateFile:join(dir,'state.json'),token,now:()=>now,log:{error(){}}});t.after(()=>gateway.close());const base=`http://127.0.0.1:${gateway.port}`;
 const post=async(action,input)=>fetch(base+'/__roll/admin/'+action,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input)});
 assert.equal((await post('register',{id:OLD,port:old.port,prefix:'A'})).status,200);await post('activate',{id:OLD});const a=await socket(gateway.port,OLD);t.after(()=>a.ws.close());await a.request('room.create',{mode:'solo',difficulty:'NORMAL'});await a.request('room.start');
 await post('register',{id:NEW,port:next.port,prefix:'B'});await post('activate',{id:NEW});const deadline=gateway.state().releases[OLD].expiresAt;assert.equal(deadline,now+3600000);assert.equal(gateway.state().releases[NEW].expiresAt,undefined);await post('activate',{id:NEW});assert.equal(gateway.state().releases[OLD].expiresAt,deadline);
 await a.wait(m=>m.t==='m.toast'&&m.text.includes('1시간'));const b=await socket(gateway.port,NEW);t.after(()=>b.ws.close());await b.request('room.create',{mode:'solo',difficulty:'NORMAL'});await b.request('room.start');
 const summary=await(await fetch(base+'/__roll/status.json')).json();assert.equal(summary.totals.rooms,2);assert.equal(summary.totals.matches,2);assert.equal((await post('force-retire',{id:NEW})).status,409);assert.equal(next.lobby.rooms.size,1);
 now=deadline-1;await gateway.expireRetained();assert.equal(old.lobby.rooms.size,1);now=deadline;await gateway.expireRetained();assert.equal(old.lobby.rooms.size,0);assert.equal(next.lobby.rooms.size,1);assert.equal(next.lobby.stats().matches,1);assert.equal((await fetch(base+`/r/${OLD}/`)).status,410);
 assert.equal((await post('force-retire',{id:OLD})).status,200);assert.deepEqual(Object.keys(gateway.state().releases),[NEW]);assert.equal((await b.request('ping',{c:Date.now()})).t,'pong');
});

test('router reconciliation shortens legacy deadlines from their original activation and leaves current intact',async t=>{
 const {createServer}=await import('node:http');const {writeFile}=await import('node:fs/promises');
 const dir=await mkdtemp(join(tmpdir(),'legacy-deadline-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const activated=Date.now()-45*60000,now=activated+45*60000,calls=[];
 async function worker(id,prefix){
  const server=createServer((req,res)=>{
   calls.push([id,req.url]);res.setHeader('content-type','application/json');
   res.end(JSON.stringify({release:id,roomPrefix:prefix,draining:id===OLD,rooms:1,matches:1,humans:1,sockets:1}));
  });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));return server.address().port;
 }
 const oldPort=await worker(OLD,'A'),newPort=await worker(NEW,'B'),stateFile=join(dir,'state.json');
 await writeFile(stateFile,JSON.stringify({current:NEW,releases:{[OLD]:{port:oldPort,prefix:'A',expiresAt:activated+7200000},[NEW]:{port:newPort,prefix:'B'}}}));
 const gateway=await startGateway({port:0,stateFile,token,now:()=>now,log:{error(){}}});t.after(()=>gateway.close());
 const response=await fetch(`http://127.0.0.1:${gateway.port}/__roll/admin/status`,{headers:{authorization:'Bearer '+token}});
 assert.equal(response.status,200);const state=gateway.state();assert.equal(state.releases[OLD].expiresAt,activated+3600000);
 assert.equal(state.releases[OLD].retiredAt,activated);assert.equal(state.releases[NEW].expiresAt,undefined);
 assert.ok(calls.some(([id,url])=>id===OLD&&url==='/__release/drain'));
 assert.ok(!calls.some(([id,url])=>id===NEW&&url==='/__release/shutdown'));
});

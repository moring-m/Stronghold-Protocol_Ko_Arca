#!/usr/bin/env bash
# Isolated Docker verification; never touches production container names/ports.
set -Eeuo pipefail
image=${1:?Pass the built image tag}
qa="stronghold-rolling-qa-$$"
d(){ env -u DOCKER_HOST -u DOCKER_CONTEXT -u DOCKER_TLS -u DOCKER_TLS_VERIFY -u DOCKER_CERT_PATH docker --host=unix:///var/run/docker.sock "$@"; }
cleanup(){ local status=$?;trap - EXIT;d rm -f "$qa-router" "$qa-old" "$qa-new" >/dev/null 2>&1 || true;d volume rm "$qa-state" >/dev/null 2>&1 || true;exit "$status"; }
trap cleanup EXIT
d volume create "$qa-state" >/dev/null
d run --rm --user 0 -v "$qa-state:/state" --entrypoint sh "$image" -c 'chown 1000:1000 /state; printf "%s" qa-control > /state/token; chmod 600 /state/token; chown 1000:1000 /state/token'
for suffix in old new;do
 release=111111111111;prefix=A;port=3038
 if [[ $suffix == new ]];then release=222222222222;prefix=B;port=3039;fi
 d run -d --name "$qa-$suffix" --memory=700m --memory-swap=700m -p "127.0.0.1:$port:3000" \
  -v "$qa-state:/state:ro" -e SP_RELEASE_TOKEN_FILE=/state/token -e SP_RELEASE_ID="$release" -e SP_ROOM_PREFIX="$prefix" -e SP_COMBAT=client "$image" >/dev/null
done
d run -d --name "$qa-router" --network host --memory=256m --memory-swap=256m -v "$qa-state:/state" \
 -e PORT=3037 -e SP_RELEASE_TOKEN_FILE=/state/token -e SP_RELEASE_STATE_FILE=/state/state.json --entrypoint node "$image" server/release/gateway.js >/dev/null
ready=0
for attempt in {1..30};do
 if d exec "$qa-router" node -e 'Promise.all([3038,3039].map(p=>fetch("http://127.0.0.1:"+p+"/healthz").then(r=>{if(!r.ok)throw Error("Not ready")}))).catch(()=>process.exit(1))' >/dev/null 2>&1;then ready=1;break;fi
 sleep 1
done
(( ready )) || { d logs "$qa-old";d logs "$qa-new";exit 1; }
d exec -i "$qa-router" node --input-type=module <<'JS'
import assert from 'node:assert/strict';import{WebSocket}from 'ws';
const base='http://127.0.0.1:3037',old='111111111111',next='222222222222';
async function admin(action,data){const r=await fetch(base+'/__roll/admin/'+action,{method:'POST',headers:{authorization:'Bearer qa-control','content-type':'application/json'},body:JSON.stringify(data)});assert.equal(r.status,200,await r.text());}
await admin('register',{id:old,port:3038,prefix:'A'});await admin('activate',{id:old});
async function client(id,token){const ws=new WebSocket('ws://127.0.0.1:3037/ws?release='+id),frames=[];let rid=1;ws.on('message',m=>frames.push(JSON.parse(m)));await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});const wait=pred=>new Promise((r,j)=>{const until=Date.now()+10000;function poll(){const hit=frames.find(pred);if(hit)return r(hit);if(Date.now()>until)return j(Error('Frames timed out'));setTimeout(poll,5);}poll();});ws.send(JSON.stringify({t:'hello',version:1,name:'검증',...(token?{token}:{})}));const welcome=await wait(f=>f.t==='welcome');return{ws,welcome,wait,request:async(t,fields={})=>{const id=rid++;ws.send(JSON.stringify({t,rid:id,...fields}));return wait(f=>f.rid===id);}};}
const before=await client(old);assert.equal((await before.request('room.create',{mode:'coop8',difficulty:'NORMAL'})).t,'ok');const room=await before.wait(f=>f.t==='room.state');assert.ok(room.code.startsWith('A'));assert.equal((await before.request('room.start')).t,'ok');await before.wait(f=>f.t==='m.public');
await admin('register',{id:next,port:3039,prefix:'B'});await admin('activate',{id:next});assert.equal((await fetch(base+'/__roll/room/'+room.code).then(r=>r.json())).release,old);
before.ws.close();await new Promise(r=>before.ws.once('close',r));const resumed=await client(old,before.welcome.token);assert.equal(resumed.welcome.playerId,before.welcome.playerId);await resumed.wait(f=>f.t==='room.state'&&f.code===room.code);await resumed.wait(f=>f.t==='m.public');
const fresh=await client(next);assert.equal((await fresh.request('room.create',{mode:'solo',difficulty:'NORMAL'})).t,'ok');assert.ok((await fresh.wait(f=>f.t==='room.state')).code.startsWith('B'));
const reply=await fetch(base+'/__roll/admin/retire',{method:'POST',headers:{authorization:'Bearer qa-control','content-type':'application/json'},body:JSON.stringify({id:old})});assert.equal(reply.status,409);
const html=await fetch(base+'/r/'+old+'/').then(r=>r.text());assert.ok(html.includes('__SP_RELEASE'));const module=await fetch(base+'/js/data.js?release='+old).then(r=>r.text());assert.ok(module.includes('?release='+old));
resumed.ws.close();fresh.ws.close();console.log('DOCKER_ROLLOVER_AND_EIGHT_PLAYER_RECONNECT_OK');
JS
d stats --no-stream --format '{{.Name}} {{.MemUsage}}' "$qa-router" "$qa-old" "$qa-new"

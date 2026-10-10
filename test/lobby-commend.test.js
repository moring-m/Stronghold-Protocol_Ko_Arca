import {test} from 'node:test';import assert from 'node:assert/strict';
import {startServer} from '../server/index.js';import {StubMatch} from '../server/match/StubMatch.js';import {TestClient} from './helpers/wsClient.js';
test('completed-match recommendations are authorized, idempotent, broadcast and restored on reconnect',async()=>{
 const srv=await startServer({port:0,host:'127.0.0.1',MatchClass:StubMatch,log:{info(){},warn(){},error(){}}});const clients=[];
 const connect=async name=>{const c=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);clients.push(c);c.welcome=await c.hello(name);return c;};
 const ok=async(c,msg)=>assert.equal((await c.request(msg)).t,'ok');
 try{
  const a=await connect('A'),b=await connect('B'),s=await connect('Spectator');
  await ok(a,{t:'room.create',mode:'coop',difficulty:'NORMAL'});const state=await a.waitFor('room.state');
  await ok(b,{t:'room.join',code:state.code});await ok(s,{t:'room.spectate',code:state.code});
  await ok(b,{t:'room.ready',ready:true});await ok(a,{t:'room.start'});
  assert.equal((await a.request({t:'room.commend',playerId:b.welcome.playerId,matchNo:1})).code,'WRONG_PHASE');
  await ok(a,{t:'g.infoReady'});await ok(b,{t:'g.infoReady'});const result=await a.waitFor('m.result');assert.equal(result.matchNo,1);
  const vote={t:'room.commend',playerId:b.welcome.playerId,matchNo:result.matchNo};
  assert.equal((await s.request(vote)).code,'BAD_TARGET');
  assert.equal((await a.request({...vote,playerId:a.welcome.playerId})).code,'BAD_TARGET');
  assert.equal((await a.request({...vote,matchNo:2})).code,'WRONG_PHASE');
  await ok(a,vote);const update=await b.waitFor('room.commended');assert.equal(update.counts[b.welcome.playerId],1);
  await ok(a,vote);const room=srv.lobby.rooms.get(state.code);assert.equal(room.resultFeedback.counts[b.welcome.playerId],1);
  const replay=JSON.parse(room.replay.frames.get(b.welcome.playerId));assert.equal(replay.players.find(p=>p.playerId===b.welcome.playerId).commendations,1);assert.deepEqual(replay.commendationsGiven[a.welcome.playerId],[b.welcome.playerId]);
  const token=b.welcome.token;await b.terminate();
  const resumed=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);clients.push(resumed);await resumed.hello('B',token);
  const restored=await resumed.waitFor('m.result');assert.equal(restored.players.find(p=>p.playerId===b.welcome.playerId).commendations,1);
 }finally{for(const c of clients)await c.terminate();await srv.close();}
});

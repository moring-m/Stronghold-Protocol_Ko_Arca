import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { StubMatch } from '../server/match/StubMatch.js';
import { TestClient } from './helpers/wsClient.js';

test('departed eliminated voter is removed during an active vote and can unblock unanimity',async()=>{
  const srv=await startServer({port:0,host:'127.0.0.1',MatchClass:StubMatch,log:{info(){},warn(){},error(){}}}),clients=[];
  const ok=async(c,msg)=>assert.equal((await c.request(msg)).t,'ok');
  try{
    const ids=[];for(let i=0;i<4;i++){const c=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);clients.push(c);ids.push((await c.hello('Voter '+i)).playerId);}
    await ok(clients[0],{t:'room.create',mode:'coop',difficulty:'NORMAL'});const initial=await clients[0].waitFor('room.state');
    for(const c of clients.slice(1)){await ok(c,{t:'room.join',code:initial.code});await ok(c,{t:'room.ready',ready:true});}
    await ok(clients[0],{t:'room.start'});const room=srv.lobby.rooms.get(initial.code);room.match.phase='PREP';room.match.players=new Map([[ids[3],{alive:false}]]);
    await ok(clients[0],{t:'room.requestRestart',matchNo:1});const frame=await clients[1].waitFor('room.restartVote',m=>!!m.vote);
    for(const c of clients.slice(1,3))await ok(c,{t:'room.answerRestart',matchNo:1,voteId:frame.vote.id,agree:true});
    assert.ok(room.match);await ok(clients[3],{t:'room.leave'});
    const result=await clients[0].waitFor('room.state',r=>!r.inMatch&&r.restartMatchNo===1);assert.equal(result.seats.filter(Boolean).length,3);assert.equal(room.match,null);
  }finally{for(const c of clients)await c.terminate();await srv.close();}
});

test('real websocket vote is anonymous, preserves the room, and allows a new match', async () => {
  const srv = await startServer({port:0,host:'127.0.0.1',MatchClass:StubMatch,log:{info(){},warn(){},error(){}}});
  let host, guest;
  const ok=async(c,msg)=>assert.equal((await c.request(msg)).t,'ok');
  try {
    host=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);await host.hello('Host');
    guest=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);await guest.hello('Guest');
    await ok(host,{t:'room.create',mode:'coop',difficulty:'NORMAL'});
    const initial=await host.waitFor('room.state');
    await ok(guest,{t:'room.join',code:initial.code});await ok(guest,{t:'room.ready',ready:true});await ok(host,{t:'room.start'});
    const room=srv.lobby.rooms.get(initial.code),old=room.match;old.phase='PREP';
    await ok(host,{t:'room.requestRestart',matchNo:1});
    const frame=await guest.waitFor('room.restartVote',f=>!!f.vote);
    assert.equal(frame.vote.yes,1);assert.equal(frame.vote.answered,false);
    assert.ok(!('playerId' in frame.vote));assert.ok(!('ids' in frame.vote));
    await ok(guest,{t:'room.answerRestart',matchNo:1,voteId:frame.vote.id,agree:true});
    const returned=await host.waitFor('room.state',f=>!f.inMatch&&f.restartMatchNo===1);
    assert.equal(returned.code,initial.code);assert.equal(returned.hostId,initial.hostId);
    assert.equal(old.disposed,true);assert.equal(returned.seats.filter(Boolean).length,2);
    assert.ok(returned.seats.filter(Boolean).every(s=>!s.ready));
    await ok(guest,{t:'room.ready',ready:true});await ok(host,{t:'room.start'});assert.equal(room.matchCount,2);
    assert.equal((await host.request({t:'room.answerRestart',matchNo:1,voteId:frame.vote.id,agree:true})).t,'error');
  } finally {await host?.terminate();await guest?.terminate();await srv.close();}
});

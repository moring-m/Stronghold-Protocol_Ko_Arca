import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startServer } from '../server/index.js';
import { TestClient } from './helpers/wsClient.js';

test('legacy reroll delegates to revision-checked setup voting and preserves the match', async () => {
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,heavyBurst:30}); let host;
 try {
  host=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);await host.hello('Host');
  assert.equal((await host.request({t:'room.create',mode:'solo',difficulty:'HARD'})).t,'ok');
  const state=await host.waitFor('room.state');
  await host.request({t:'room.setRerollLimit',limit:-1});
  await host.request({t:'room.start'});
  const room=srv.lobby.rooms.get(state.code),match=room.match;
  await host.waitFor('m.public',p=>p.phase==='INFO_CHECK');
  for(let i=0;i<7;i++){
   await new Promise(resolve=>setTimeout(resolve,350));
   const reply=await host.request({t:'room.reroll',matchNo:room.matchCount});assert.equal(reply.t,'ok',JSON.stringify(reply));
   assert.equal(room.match,match);assert.equal(match.setupRevision,i+1);
   assert.equal(room.rerollsUsed,i+1);assert.equal(match.deadline,0);
   assert.equal(match.order.find(p=>!p.isBot).infoReady,false);
  }
  assert.equal((await host.request({t:'room.reroll',matchNo:room.matchCount+1})).code,'BAD_TARGET');
  match.enterBandDraft();
  assert.equal((await host.request({t:'room.reroll',matchNo:room.matchCount})).code,'WRONG_PHASE');
 }finally{await host?.terminate();await srv.close();}
});

import {test} from 'node:test';import assert from 'node:assert/strict';
import {startServer} from '../server/index.js';import {StubMatch} from '../server/match/StubMatch.js';import {TestClient} from './helpers/wsClient.js';
test('host extension selection reaches the match and preserves both participants loadouts',async()=>{
 class Recording extends StubMatch {constructor(o){super(o);Recording.opts=o;}}
 const srv=await startServer({port:0,host:'127.0.0.1',MatchClass:Recording,log:{info(){},warn(){},error(){}}});let host,guest;
 const ok=async(c,m)=>assert.equal((await c.request(m)).t,'ok');
 try {
  host=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);await host.hello('Host');
  guest=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);await guest.hello('Guest');
  const prefs={chess_char_1_01_a:{skill:0,module:'none'}};
  await ok(host,{t:'room.loadout',entries:prefs});await ok(guest,{t:'room.loadout',entries:prefs});
  await ok(host,{t:'room.create',mode:'coop',difficulty:'NORMAL'});const room=await host.waitFor('room.state');
  await ok(guest,{t:'room.join',code:room.code});
  assert.equal((await guest.request({t:'room.setCustomExtensions',selection:{bonds:['ursus'],stages:[]}})).code,'NOT_HOST');
  for(const bonds of [['ursus'],[],['ursus']]) await ok(host,{t:'room.setCustomExtensions',selection:{bonds,stages:[]}});
  assert.equal((await host.request({t:'room.setCustomExtensions',selection:{stages:['custom_nonexistent']}})).t,'error');
  await ok(guest,{t:'room.ready',ready:true});await ok(host,{t:'room.start'});
  assert.deepEqual(Recording.opts.customExtensions,{bonds:['ursus'],stages:[]});
  for(const seat of Recording.opts.seats.filter(s=>s&&!s.isBot)) assert.deepEqual(seat.loadout,prefs);
 } finally {await host?.terminate();await guest?.terminate();await srv.close();}
});


test('creation restores selected extensions atomically and joining does not replace host settings',async()=>{
 const srv=await startServer({port:0,host:'127.0.0.1',MatchClass:StubMatch,log:{info(){},warn(){},error(){}}});let host,guest;
 try{
  host=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);await host.hello('Host');
  guest=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);await guest.hello('Guest');
  for(const mode of ['solo','coop']){
   assert.equal((await host.request({t:'room.create',mode,difficulty:'NORMAL',customExtensions:{bonds:['ursus'],stages:['custom_removed']}})).t,'ok');
   const room=await host.waitFor('room.state',r=>r.mode===mode && r.customFactions===true);
   assert.deepEqual(room.customExtensions,{bonds:['ursus'],stages:[]});
   if(mode==='coop'){
    assert.equal((await guest.request({t:'room.join',code:room.code})).t,'ok');
    const joined=await guest.waitFor('room.state',r=>r.code===room.code);assert.deepEqual(joined.customExtensions,room.customExtensions);
   }
  }
  assert.equal((await host.request({t:'room.create',mode:'solo',difficulty:'NORMAL',customExtensions:{bonds:[],stages:[]}})).t,'ok');
  const disabled=await host.waitFor('room.state',r=>r.mode==='solo'&&!r.customFactions);assert.deepEqual(disabled.customExtensions,{bonds:[],stages:[]});
 }finally{await host?.terminate();await guest?.terminate();await srv.close();}
});
test('minimum violations and addon exclusions are rejected without changing the host settings',async()=>{
 const srv=await startServer({port:0,host:'127.0.0.1',MatchClass:StubMatch,log:{info(){},warn(){},error(){}}});let host;
 try{
  host=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);await host.hello('Host');
  assert.equal((await host.request({t:'room.create',mode:'coop',difficulty:'NORMAL'})).t,'ok');
  const room=await host.waitFor('room.state');
  for(const disabled of [{disabledBonds:['swiftShip']},{disabledStages:room.customExtensionCatalog.disabledStages.map(e=>e.id)}])assert.equal((await host.request({t:'room.setCustomExtensions',selection:{bonds:[],stages:[],...disabled}})).t,'error');
  assert.equal((await host.request({t:'room.setCustomExtensions',selection:{bonds:[],stages:[],disabledBosses:['boss_1'],disabledBands:['band_bldsk']}})).t,'ok');
  const updated=await host.waitFor('room.state',r=>r.customExtensions?.disabledBosses?.includes('boss_1'));
  assert.deepEqual(updated.customExtensions.disabledBands,['band_bldsk']);
 }finally{await host?.terminate();await srv.close();}
});

test('eight-player room accepts eight human seats and rejects the ninth, preserving per-mode capacity',async()=>{
 const srv=await startServer({port:0,host:'127.0.0.1',MatchClass:StubMatch,log:{info(){},warn(){},error(){}}}),clients=[];
 try{
  for(let i=0;i<9;i++){const c=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);await c.hello(`Player${i}`);clients.push(c);}
  const host=clients[0];assert.equal((await host.request({t:'room.create',mode:'coop8',difficulty:'NORMAL'})).t,'ok');const room=await host.waitFor('room.state',r=>r.mode==='coop8');assert.equal(room.seats.length,8);
  for(const c of clients.slice(1,8))assert.equal((await c.request({t:'room.join',code:room.code})).t,'ok');
  assert.equal((await clients[8].request({t:'room.join',code:room.code})).code,'ROOM_FULL');
  for(const c of clients.slice(1,8))assert.equal((await c.request({t:'room.ready',ready:true})).t,'ok');assert.equal((await host.request({t:'room.start'})).t,'ok');
 }finally{for(const c of clients)await c.terminate();await srv.close();}
});

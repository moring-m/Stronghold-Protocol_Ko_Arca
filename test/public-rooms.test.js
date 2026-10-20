import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer} from '../server/index.js';
import {StubMatch} from '../server/match/StubMatch.js';
import {TestClient} from './helpers/wsClient.js';
test('private by default; host publishes fixed modes irreversibly; public list omits private rooms and reflects running state',async()=>{
 const server=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',MatchClass:StubMatch});let host,guest;
 try{host=await TestClient.connect(`ws://127.0.0.1:${server.port}/ws`);guest=await TestClient.connect(`ws://127.0.0.1:${server.port}/ws`);await host.hello('공개 방장');await guest.hello('목록 이용자');
 await host.request({t:'room.create',mode:'solo',difficulty:'NORMAL',gameplayMode:'classic'});assert.equal((await host.request({t:'room.publish'})).t,'error');assert.deepEqual((await guest.request({t:'room.list'})).rooms,[]);await host.request({t:'room.leave'});
 await host.request({t:'room.create',mode:'coop',difficulty:'NORMAL'});const room=await host.waitFor('room.state',r=>r.mode==='coop');assert.equal(room.isPublic,false);
 assert.deepEqual((await guest.request({t:'room.list'})).rooms,[]);
 assert.equal((await host.request({t:'room.publish'})).t,'error');
 await host.request({t:'room.setGameplayMode',gameplayMode:'classic'});
 await guest.request({t:'room.join',code:room.code});assert.equal((await guest.request({t:'room.publish'})).code,'NOT_HOST');
 assert.equal((await host.request({t:'room.publish'})).t,'ok');
 const list=(await guest.request({t:'room.list'})).rooms;assert.equal(list.length,1);assert.equal(list[0].code,room.code);assert.equal(list[0].players,2);assert.equal(list[0].started,false);assert.equal(list[0].hostName,'공개 방장');assert.equal('customExtensions' in list[0],false);
 assert.equal((await host.request({t:'room.setGameplayMode',gameplayMode:'custom'})).t,'error');assert.equal((await host.request({t:'room.setGameplayMode',gameplayMode:'augment'})).t,'ok');
 await guest.request({t:'room.ready',ready:true});await host.request({t:'room.start'});assert.equal((await guest.request({t:'room.list'})).rooms[0].started,true);
 assert.equal((await host.request({t:'room.publish'})).code,'ROOM_STARTED');
 }finally{host?.terminate();guest?.terminate();await server.close();}
});

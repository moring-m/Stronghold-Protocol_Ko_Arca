import {test} from 'node:test';
import assert from 'node:assert/strict';
import {startServer} from '../server/index.js';
import {StubMatch} from '../server/match/StubMatch.js';
import {TestClient} from './helpers/wsClient.js';
test('private by default; host toggles visibility and mode; public list omits private rooms and reflects running state',async()=>{
 const server=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',MatchClass:StubMatch});let host,guest;
 try{host=await TestClient.connect(`ws://127.0.0.1:${server.port}/ws`);guest=await TestClient.connect(`ws://127.0.0.1:${server.port}/ws`);await host.hello('공개 방장');await guest.hello('목록 이용자');
 await host.request({t:'room.create',mode:'solo',difficulty:'NORMAL',gameplayMode:'classic'});assert.equal((await host.request({t:'room.publish'})).t,'error');assert.deepEqual((await guest.request({t:'room.list'})).rooms,[]);await host.request({t:'room.leave'});
 await host.request({t:'room.create',mode:'coop',difficulty:'NORMAL'});const room=await host.waitFor('room.state',r=>r.mode==='coop');assert.equal(room.isPublic,false);assert.equal(room.title,'공개 방장 박사님의 4인 시뮬레이션');
 assert.deepEqual((await guest.request({t:'room.list'})).rooms,[]);
 await host.request({t:'room.setGameplayMode',gameplayMode:'classic'});
 await guest.request({t:'room.join',code:room.code});assert.equal((await guest.request({t:'room.publish'})).code,'NOT_HOST');
 assert.equal((await host.request({t:'room.publish'})).t,'ok');
 const list=(await guest.request({t:'room.list'})).rooms;assert.equal(list.length,1);assert.equal(list[0].code,room.code);assert.equal(list[0].players,2);assert.equal(list[0].started,false);assert.equal(list[0].hostName,'공개 방장');assert.equal((await host.request({t:'room.publish',isPublic:false})).t,'ok');assert.deepEqual((await guest.request({t:'room.list'})).rooms,[]);assert.equal((await host.request({t:'room.publish',isPublic:true})).t,'ok');assert.equal('customExtensions' in list[0],false);
 assert.equal((await host.request({t:'room.setGameplayMode',gameplayMode:'custom'})).t,'ok');assert.equal((await host.request({t:'room.setGameplayMode',gameplayMode:'augment'})).t,'ok');
 await guest.request({t:'room.ready',ready:true});await host.request({t:'room.start'});assert.equal((await guest.request({t:'room.list'})).rooms[0].started,true);
 assert.equal((await host.request({t:'room.publish'})).code,'ROOM_STARTED');
 }finally{host?.terminate();guest?.terminate();await server.close();}
});

test('public custom rooms expose only applied settings, accept host titles, and allow mode changes',async()=>{
 const server=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',MatchClass:StubMatch});let host,viewer;
 try{
  host=await TestClient.connect(`ws://127.0.0.1:${server.port}/ws`);viewer=await TestClient.connect(`ws://127.0.0.1:${server.port}/ws`);await host.hello('H');await viewer.hello('V');
  await host.request({t:'room.create',mode:'coop',difficulty:'NORMAL',title:'전략 연습 방',customExtensions:{rules:['augments'],ruleValues:{bossHpByAugment:1,augmentEnemyVote:2}}});
  const r=await host.waitFor('room.state',r=>r.mode==='coop');assert.equal(r.title,'전략 연습 방');
  assert.equal((await viewer.request({t:'room.inspect',code:r.code})).t,'error');
  assert.equal((await host.request({t:'room.publish'})).t,'ok');
  assert.equal((await host.request({t:'room.setGameplayMode',gameplayMode:'classic'})).t,'ok');
  assert.equal((await host.request({t:'room.setGameplayMode',gameplayMode:'augment'})).t,'ok');
  await host.request({t:'room.setGameplayMode',gameplayMode:'custom'});
  const inspected=(await viewer.request({t:'room.inspect',code:r.code})).room;assert.equal(inspected.title,'전략 연습 방');assert.equal(inspected.customExtensions.ruleValues.augmentEnemyVote,2);assert.equal(inspected.customExtensions.ruleValues.bossHpByAugment,1);assert.equal('seats' in inspected,false);
  await viewer.request({t:'room.join',code:r.code});assert.equal((await viewer.request({t:'room.setTitle',title:'무단 변경'})).code,'NOT_HOST');
  assert.equal((await host.request({t:'room.setTitle',title:'새로운 방 제목'})).t,'ok');assert.equal((await host.request({t:'room.setTitle',title:'x'.repeat(16)})).t,'error');await host.request({t:'room.setTitle',title:''});assert.equal((await viewer.request({t:'room.inspect',code:r.code})).room.title,'H 박사님의 4인 시뮬레이션');
  const list=(await viewer.request({t:'room.list'})).rooms;assert.equal(list[0].title,'H 박사님의 4인 시뮬레이션');assert.equal(list[0].gameplayMode,'custom');
  assert.equal((await host.request({t:'room.setCustomExtensions',selection:{rules:['augments'],ruleValues:{augmentEnemyVote:1}}})).t,'ok','public custom settings remain editable');
  assert.equal((await viewer.request({t:'room.inspect',code:r.code})).room.customExtensions.ruleValues.augmentEnemyVote,1);
 }finally{host?.terminate();viewer?.terminate();await server.close();}
});

test('localized default titles and atomic public creation preserve privacy of private rooms',async()=>{
 const server=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',MatchClass:StubMatch});let host,viewer;
 try{host=await TestClient.connect(`ws://127.0.0.1:${server.port}/ws`);viewer=await TestClient.connect(`ws://127.0.0.1:${server.port}/ws`);await host.hello('Mint');await viewer.hello('Viewer');
 for(const[locale,title]of [['en',"Mint's 4-Player Simulation"],['ja','Mintドクターの4人シミュレーション'],['zh','Mint博士的4人模拟'],['ko','Mint 박사님의 4인 시뮬레이션']]){
  assert.equal((await host.request({t:'room.create',mode:'coop',difficulty:'NORMAL',gameplayMode:'classic',titleLocale:locale,isPublic:true})).t,'ok');const state=await host.waitFor('room.state',r=>r.title===title);assert.equal(state.isPublic,true);assert.equal((await host.request({t:'room.setGameplayMode',gameplayMode:'custom'})).t,'ok');await host.request({t:'room.setTitle',title:''});assert.equal((await viewer.request({t:'room.list'})).rooms[0].title,title);await host.request({t:'room.leave'});
 }
 await host.request({t:'room.create',mode:'coop8',difficulty:'NORMAL',isPublic:false,title:'Private secret'});const list=await viewer.request({t:'room.list'});assert.deepEqual(list.rooms,[]);assert.equal(list.counts.total,1);assert.equal(list.counts.joinable,0);assert.equal(JSON.stringify(list).includes('Private secret'),false);assert.equal((await viewer.request({t:'room.create',mode:'solo',difficulty:'NORMAL',isPublic:true})).t,'error');await viewer.request({t:'room.create',mode:'solo',difficulty:'NORMAL'});assert.equal((await host.request({t:'room.list'})).counts.total,2);
 }finally{host?.terminate();viewer?.terminate();await server.close();}
});

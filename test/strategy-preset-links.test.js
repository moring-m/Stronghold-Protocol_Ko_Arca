import test from 'node:test';import assert from 'node:assert/strict';
import {bindPresetStrategy,normalizePresetStrategies,completedStrategy} from '../shared/recruitPresetLinks.js';
import {makeMatch} from './match/harness.js';
import {favoritesStore,normalizeFavorites} from '../public/js/ui/favorites.js';
import {store} from '../public/js/store.js';

test('strategy links are independent from factions, unique per strategy and migrate old presets',()=>{
 const p=[{id:'a',faction:'염국',strategy:'band_amiya'},{id:'b',faction:'우르수스',strategy:null}];
 assert.deepEqual(bindPresetStrategy(p,'b','band_amiya').map(p=>p.strategy),[null,'band_amiya']);
 assert.deepEqual(bindPresetStrategy(p,'missing','band_amiya'),p);assert.equal(bindPresetStrategy(p,'a',null)[0].faction,'염국');
 assert.deepEqual(normalizePresetStrategies([{id:'old'},{id:'a',strategy:'band_amiya'},{id:'b',strategy:'band_amiya'}]).map(p=>p.strategy),[null,null,'band_amiya']);
});
test('favorites activate at confirmed strategy completion, not preview or draft; later state pushes do not override manual changes',()=>{
 const previous=store.get(),old=favoritesStore.get();try{
  favoritesStore.set(normalizeFavorites({active:'normal',presets:[{id:'normal'},{id:'linked',strategy:'band_amiya'}]}));
  const base={room:{code:'TEST',inMatch:true},me:{playerId:'p_0'},match:{public:{phase:'BAND_DRAFT',seed:7,players:[{playerId:'p_0',bandId:'band_amiya'}]},private:{bandId:'band_amiya'}}};
  store.set(base);assert.equal(completedStrategy(base),null);assert.equal(favoritesStore.get().active,'normal');
  store.set({match:{...base.match,public:{...base.match.public,phase:'BATTLE_CHECK'}}});assert.equal(favoritesStore.get().active,'linked');
  favoritesStore.set({active:'normal'});store.set({conn:{...store.get().conn}});assert.equal(favoritesStore.get().active,'normal');
  store.set(base);store.set({match:{...base.match,public:{...base.match.public,phase:'BATTLE_CHECK'}}});assert.equal(favoritesStore.get().active,'linked','a new draft in the same room re-applies the link');
 }finally{store.set(previous);favoritesStore.set(old);}
});
for(const how of ['manual','timeout','random'])test(`recruit strategy preset applies before loadout lock (${how})`,t=>{
 const h=makeMatch({mode:'solo',humans:1,seed:71,instant:false}).start();t.after(()=>h.m.dispose());
 h.drive(()=>h.m.phase==='BAND_DRAFT',{ready:false});const m=h.m,ps=m.players.get('p_0');
 const recruit=Object.values(m.gd.raw.chess).find(c=>c.optionalRecruit&&c.visible&&!c.isGolden&&c.tier===6);assert.ok(recruit);
 const band=m.gd.bandIds().find(id=>id!=='band_random');
 const initial=ps.loadout;ps.strategyPresets=how==='random'?Object.fromEntries(m.gd.bandIds().filter(id=>id!=='band_random').map(id=>[id,{[recruit.chessId]:{selected:true}}])):{[band]:{[recruit.chessId]:{selected:true}}};
 assert.equal(ps.loadout,initial);
 if(how==='manual')assert.ok(m.handle(ps.playerId,{t:'g.band',bandId:band}).ok);
 else if(how==='random')assert.ok(m.handle(ps.playerId,{t:'g.band',bandId:'band_random'}).ok);
 else {m.draft.focus.set(ps.playerId,band);m.draft.untimed=false;m.startDraftTurn();}
 h.run(()=>m.phase==='BATTLE_CHECK',{maxSteps:1000});
 assert.equal(m.phase,'BATTLE_CHECK');assert.equal(ps.loadout[recruit.chessId]?.selected,true);assert.equal(ps.strategyPresetApplied,ps.bandId);
 assert.equal(m.setLoadout(ps.playerId,{}).error,'WRONG_PHASE','ordinary edits still lock after strategy selection');
});

test('strategy recruit links are validated, stored before joining and carried to the room seat',async t=>{
 const {startServer}=await import('../server/index.js'),{TestClient}=await import('./helpers/wsClient.js'),{getData}=await import('../server/data.js');
 const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,assetIndex:false,heavyBurst:20});t.after(()=>srv.close());
 const c=await TestClient.connect(`ws://127.0.0.1:${srv.port}/ws`);t.after(()=>c.terminate());const welcome=await c.hello('preset-test');
 const data=getData(),op=Object.values(data.chess).find(c=>c.optionalRecruit&&c.visible&&!c.isGolden&&c.tier===6),band=Object.keys(data.bands)[0];assert.ok(op);
 const linked={[band]:{[op.chessId]:{selected:true}}};
 assert.equal((await c.request({t:'room.loadout',entries:{},strategyPresets:linked})).t,'ok');
 const session=srv.registry.byId(welcome.playerId);assert.equal(session.strategyPresets[band][op.chessId].selected,true);
 assert.equal((await c.request({t:'room.create',mode:'solo',difficulty:'NORMAL'})).t,'ok');const seat=srv.lobby.roomOf(session).seatOf(welcome.playerId);
 assert.equal(seat.strategyPresets[band][op.chessId].selected,true);
 const regular=Object.values(data.chess).find(c=>!c.optionalRecruit&&c.visible&&!c.isGolden);
 assert.equal((await c.request({t:'room.loadout',entries:{},strategyPresets:{[band]:{[regular.chessId]:{selected:true}}}})).code,'BAD_TARGET');
 assert.equal(seat.strategyPresets[band][op.chessId].selected,true,'rejected data preserves the previous binding');
 assert.equal((await c.request({t:'room.loadout',entries:{},strategyPresets:{}})).t,'ok');assert.deepEqual(seat.strategyPresets,{});
});

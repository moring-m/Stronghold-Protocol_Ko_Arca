import{test}from'node:test';import assert from'node:assert/strict';import{PracticeMatch,PRACTICE_FUNDS}from'../../server/match/PracticeMatch.js';import{VirtualScheduler}from'../../server/match/scheduler.js';import{loadData}from'../../server/data.js';import{PHASE}from'../../shared/constants.js';
const data=loadData(new URL('../../content/production/data',import.meta.url).pathname);
function create(t,setup={}){const scheduler=new VirtualScheduler(),sent=[];const m=new PracticeMatch({practice:{stageId:'act1autochess_m01',round:4,bandId:'band_pith',factions:[],bannedBonds:[],...setup},difficulty:'NORMAL',data,seed:13,scheduler,seats:[{seat:0,playerId:'local',name:'박사'}],send:(_,msg)=>{sent.push(msg);return true;},broadcast:msg=>sent.push(msg),onEnd:()=>{}});t.after(()=>m.dispose());m.start();scheduler.advance(3000);return{m,ps:m.order[0],scheduler,sent};}
for(const round of [1,4,14,15])test(`practice starts at round ${round}, preserves first-round grants and uses the normal match`,t=>{const{m,ps}=create(t,{round});assert.equal(m.round,round);assert.equal(m.phase,PHASE.PREP);assert.ok(ps.hand.some(p=>p?.id==='chess_char_1_15_a'));assert.ok(ps.funds>=PRACTICE_FUNDS);assert.ok(!m.publicView().laboratory);assert.equal(m.publicView().practice.round,round);assert.equal(m.errorCount,0);});
test('normal shop purchase, refresh, freezing and level-up remain active with unlimited spending',t=>{const{m,ps}=create(t);const hooks=[];const dispatch=m.dispatch.bind(m);m.dispatch=(ps,hook,...rest)=>{hooks.push(hook);return dispatch(ps,hook,...rest);};const before=ps.stats.buys;assert.ok(m.handle('local',{t:'g.buy',slot:0}).ok);assert.equal(ps.stats.buys,before+1);assert.ok(hooks.includes('onBuy'));assert.ok(hooks.includes('onGain'));assert.ok(m.handle('local',{t:'g.refresh'}).ok);assert.ok(m.handle('local',{t:'g.freeze',frozen:true}).ok);const level=ps.shop.level;assert.ok(m.handle('local',{t:'g.levelUp'}).ok);assert.equal(ps.shop.level,level+1);for(let i=0;i<5;i++)assert.ok(ps.spend(PRACTICE_FUNDS*2));assert.ok(ps.funds>=PRACTICE_FUNDS);assert.ok(ps.stats.gold>=PRACTICE_FUNDS*10);assert.equal(m.errorCount,0);});
test('practice keeps selected bans and enemy training, and settlement advances normally',t=>{const types=Object.values(data.factions.types).filter(x=>x.involveRandom).slice(0,2).map(x=>x.type);const{m,scheduler}=create(t,{bannedBonds:['yanShip'],factions:types});assert.deepEqual(m.disabledBonds,['yanShip']);assert.deepEqual([...m.factions],types);assert.ok(m.bannedChess.length>0);assert.ok(m.bannedChess.every(id=>!m.pool.has(id)));for(const p of m.factions.schedule.picks.filter(Boolean))assert.ok(types.includes(p.type)||p.type==='SPECIAL');m.afterSettle();scheduler.advance(3000);assert.equal(m.round,5);assert.equal(m.errorCount,0);});
test('practice results use a distinct mode and retain normal result bookkeeping',t=>{const{m,sent}=create(t);m.finish({victory:false,reason:'abandoned'});const result=sent.find(x=>x.t==='m.result');assert.ok(result);assert.equal(result.roomMode,'practice');assert.equal(result.practice.round,4);assert.equal(m.errorCount,0);});
test('prep layer counters record actual gains per round, preserve sources and survive private resync',t=>{
 const {m,ps}=create(t);const bond=Object.keys(data.bonds).find(id=>m.gd.bond(id)&&!m.gd.bond(id).noStack);
 const piece=ps.hand.find(p=>p?.kind==='chess');ps.layers[bond]=997;
 const initial=ps.privateView().prepLayerMetrics.flatMap(r=>r.rows).reduce((n,r)=>n+r.layers,0);
 assert.equal(ps.addLayers(bond,7,{source:piece}),2);
 assert.equal(ps.addLayers(bond,7,{source:piece}),0);
 let view=ps.privateView();let current=view.prepLayerMetrics.find(r=>r.round===4);
 assert.ok(current.rows.some(r=>r.defId===piece.id&&r.layerBonds[bond]>=2));
 assert.equal(view.prepLayerMetrics.flatMap(r=>r.rows).reduce((n,r)=>n+r.layers,0),initial+2);
 assert.deepEqual(ps.privateView().prepLayerMetrics,view.prepLayerMetrics);
 m.round=5;ps.startRound(5);ps.layers[bond]=0;ps.addLayers(bond,3);
 view=ps.privateView();assert.ok(view.prepLayerMetrics.find(r=>r.round===4));
 assert.equal(view.prepLayerMetrics.find(r=>r.round===5).rows.find(r=>r.name==='맹약·기타').layerBonds[bond],3);
});

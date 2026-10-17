import {test} from 'node:test';import assert from 'node:assert/strict';
import {Match} from '../../server/match/Match.js';import {VirtualScheduler} from '../../server/match/scheduler.js';import {loadData} from '../../server/data.js';import {PHASE} from '../../shared/constants.js';
const data=loadData(new URL('../../content/production/data',import.meta.url).pathname);
function fixture(t,{bond='lateranoShip',band='band_paganini',difficulty='NORMAL',players=1}={}){
 const m=new Match({data,mode:players===1?'solo':'coop',difficulty,seed:41,customExtensions:{forcedBonds:[bond],protectedBonds:Object.keys(data.bonds),protectedAuxBonds:Object.keys(data.bonds)},seats:Array.from({length:players},(_,i)=>({seat:i,playerId:'p'+i,name:'박사'+i})),scheduler:new VirtualScheduler(),send:()=>true,broadcast:()=>{},onEnd:()=>{}});t.after(()=>m.dispose());m.round=4;m.phase=PHASE.PREP;
 const ps=m.order[0];ps.bandId=band;ps.funds=1000;const grants=[],acquire=ps.acquireChess.bind(ps);ps.acquireChess=(id,opts)=>{const result=acquire(id,opts);if(result)grants.push(id);return result;};
 assert.equal(m.bondLive(bond),false);return {m,ps,grants};
}
for(const players of [1,4])for(const difficulty of ['FUNNY','NORMAL'])test(`Paganini pays at exactly 55 despite inactive Laterano (${players} players, ${difficulty})`,t=>{
 const {m,ps,grants}=fixture(t,{players,difficulty});
 const spend=n=>{assert.ok(ps.spend(n));ps._afterSpend(n,'refresh');};spend(54);assert.equal(grants.length,0);spend(1);assert.equal(grants.length,1);
 const rec=m.gd.chess(grants[0]);assert.ok(rec.isGolden&&rec.tier>=4&&rec.bonds.includes('lateranoShip'));assert.ok(!m.bannedChess.includes(m.gd.baseIdOf(rec.chessId)));
 spend(100);assert.equal(grants.length,1);assert.equal(m.errorCount,0);
});
test('generic pools still reject inactive bonds; strategy opt-in never recruits banned or exhausted operators',t=>{
 const {m,ps}=fixture(t);assert.equal(m.rollPool('pool_char_later',{playerId:ps.playerId}),null);
 const candidates=Object.values(m.gd.data?.chess||data.chess).filter(c=>!c.isGolden&&c.tier>=4&&c.bonds?.includes('lateranoShip'));
 for(let i=0;i<40;i++){const r=m.rollPool('pool_char_later',{playerId:ps.playerId,allowInactiveBond:true});assert.ok(r);assert.ok(!m.bannedChess.includes(m.gd.baseIdOf(r.id)));}
 for(const c of candidates)if(m.pool.has(c.chessId))while(m.pool.left(c.chessId)>0)m.pool.take(c.chessId);
 assert.equal(m.rollPool('pool_char_later',{playerId:ps.playerId,allowInactiveBond:true}),null);
});
test('Harold round rewards can select surviving Victoria operators when Victoria is inactive',t=>{
 const {m,ps,grants}=fixture(t,{bond:'victoriaShip',band:'band_harold'});m.dispatch(ps,'onRoundStart',{round:4});assert.equal(grants.length,1);const c=m.gd.chess(grants[0]);assert.ok(c.bonds.includes('victoriaShip'));assert.ok(!m.bannedChess.includes(m.gd.baseIdOf(c.chessId)));assert.equal(m.errorCount,0);
});
for(const [band,bond]of [['band_pepe','sargonShip'],['band_duyaoy','yanShip']])test(`${band} shop guarantees still target surviving operators when ${bond} is inactive`,t=>{
 const {m,ps}=fixture(t,{bond,band});ps.shop.level=6;ps.round.refreshes=1;
 const other=Object.values(data.chess).find(c=>c.visible&&!c.isGolden&&!c.bonds.includes(bond)&&!m.bannedChess.includes(c.chessId)&&m.pool.has(c.chessId));assert.ok(other);
 ps.shop.slots=Array.from({length:5},()=>({kind:'chess',id:other.chessId,basePrice:1}));
 if(band==='band_pepe')m.dispatch(ps,'onLevelUp',{level:2});
 m.dispatch(ps,'onRefresh',{});
 const slots=ps.shop.slots.filter(s=>m.gd.chess(s.id)?.bonds.includes(bond));assert.ok(slots.length>0);assert.ok(slots.every(s=>!m.bannedChess.includes(m.gd.baseIdOf(s.id))));assert.equal(m.errorCount,0);
});

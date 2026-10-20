import {test} from 'node:test';import assert from 'node:assert/strict';
import {groupCombatReport} from '../../public/js/ui/combatReport.js';
import {groupLiveCombat,combatShares} from '../../public/js/ui/combatPresentation.js';
const defs={a:{charId:'same',name:'A',tier:3,profession:'CASTER'},b:{charId:'same',name:'A',tier:3,profession:'CASTER'},c:{charId:'other',name:'C',tier:4,profession:'TANK'}};
const rounds=[{playerId:'p1',playerName:'P1',units:[{uid:1,defId:'a',kind:'op',dmg:10,heal:2},{uid:2,defId:'b',kind:'op',dmg:20}]},{playerId:'p2',playerName:'P2',units:[{uid:1,defId:'c',kind:'op',dmg:30},{uid:3,defId:'t',kind:'token',dmg:40}]},{playerId:'p1',units:[{uid:1,defId:'a',kind:'op',dmg:5}]},{available:false,units:[{uid:9,defId:'a',dmg:999}]}];
test('every report merge conserves totals, excludes unavailable records, and isolates equal UIDs across players',()=>{
 for(const mode of ['unit','operator','profession','tier','kind','player']){
  const rows=groupCombatReport(rounds,mode,id=>defs[id]);assert.equal(rows.reduce((n,r)=>n+r.dmg,0),105);assert.equal(rows.reduce((n,r)=>n+r.heal,0),2);
 }
 assert.equal(groupCombatReport(rounds,'unit',id=>defs[id]).length,4);
 const op=groupCombatReport(rounds,'operator',id=>defs[id]);assert.equal(op.length,3);assert.equal(op.find(r=>r.name==='A').dmg,35);
 assert.equal(groupCombatReport(rounds,'kind').find(r=>r.name==='소환물').dmg,40);
 const ps=groupCombatReport(rounds,'player');assert.equal(ps.find(r=>r.name==='P1').dmg,35);assert.equal(ps.find(r=>r.name==='P2').dmg,70);
});
test('live grouping recomputes rates from elapsed combat time rather than adding denominators',()=>{
 const rows=[{defId:'a',kind:'op',damage:10,healing:5,layers:2,seconds:10,types:{arts:10},layerBonds:{a:2}},{defId:'b',kind:'op',damage:20,healing:5,layers:3,seconds:10,types:{arts:20},layerBonds:{a:3}}];
 const [r]=groupLiveCombat(rows,'profession',id=>defs[id]);assert.equal(r.damage,30);assert.equal(r.dps,3);assert.equal(r.hps,1);assert.equal(r.layers,5);assert.equal(r.lps,.5);assert.equal(r.types.arts,30);assert.equal(r.layerBonds.a,5);
});
test('contribution graph keeps all omitted rows as one remainder, without NaN or lost share',()=>{
 const rows=Array.from({length:12},(_,i)=>({name:String(i),dmg:i+1}));const shares=combatShares(rows,'dmg');assert.equal(shares.length,8);assert.equal(shares.at(-1).name,'기타');assert.ok(Math.abs(shares.reduce((n,r)=>n+r.share,0)-1)<1e-12);assert.deepEqual(combatShares([{dmg:0}], 'dmg'),[]);
});

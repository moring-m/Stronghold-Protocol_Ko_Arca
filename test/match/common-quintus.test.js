import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch} from './harness.js';
for(const [personal,common,expected] of [[true,true,2],[true,false,1],[false,true,1],[false,false,0]])test(`Quintus personal=${personal} common=${common}: grants ${expected} unmerged cells`,t=>{
 const h=makeMatch({mode:'coop8',humans:8,customExtensions:{bonds:[],stages:[],commonBands:common?['band_quintus']:[]}});t.after(()=>h.m.dispose());const m=h.m;
 for(const ps of m.order)ps.bandId=personal?'band_quintus':'band_amedic';
 m.round=2;for(const ps of m.order){m.dispatch(ps,'onRoundStart',{});assert.equal(ps._itemLocations('chess_item_5_08_e_a').length,0);}
 m.round=3;for(const ps of m.order){m.dispatch(ps,'onRoundStart',{});ps.checkItemMerges();assert.equal(ps._itemLocations('chess_item_5_08_e_a').length,expected);assert.equal(ps._itemLocations('chess_item_5_08_e_b').length,0);}
 m.round=4;for(const ps of m.order){m.dispatch(ps,'onRoundStart',{});assert.equal(ps._itemLocations('chess_item_5_08_e_a').length,expected);}
 assert.equal(m.errorCount,0);
});
test('identical personal and common Paganini retain independent one-time spending rewards',t=>{
 const h=makeMatch({humans:1,customExtensions:{bonds:[],stages:[],commonBands:['band_paganini']}});t.after(()=>h.m.dispose());const m=h.m,ps=m.order[0];ps.bandId='band_paganini';
 const pieces=()=>[...ps.hand,...ps.temp].filter(p=>p?.kind==='chess').length;
 const initial=pieces();m.dispatch(ps,'onSpend',{amount:54});assert.equal(pieces(),initial);
 m.dispatch(ps,'onSpend',{amount:1});assert.equal(pieces(),initial+2);assert.equal(ps.counters['band:paganini:done'],1);assert.equal(ps.counters['common:band_paganini:band:paganini:done'],1);
 m.dispatch(ps,'onSpend',{amount:55});assert.equal(pieces(),initial+2);assert.equal(m.errorCount,0);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeMatch,give} from './harness.js';
import {PHASE} from '../../shared/constants.js';
const data=loadData(new URL('../../content/production/data/',import.meta.url).pathname);
for(const mode of ['solo','coop'])for(const suffix of ['a','b'])for(const area of ['hand','board'])test(`Lappland ${mode}/${suffix}/${area} publishes refresh layers before battle`,t=>{
 const h=makeMatch({mode,data,fake:true}).start();t.after(()=>h.m.dispose());h.toPrep(1);
 const m=h.m,ps=h.ps('p_0');ps.board.clear();ps.hand.fill(null);ps.temp.fill(null);ps.bandId=null;ps.layers={};ps.funds=100;
 give(m,ps,'chess_char_2_16_'+suffix,area,area==='board'?[10,4]:null);
 ps.bondCountBonus.siracusaShip=20;ps.recompute();m.flush(true);h.sent.length=0;
 assert.deepEqual(m.handle('p_0',{t:'g.refresh'}),{ok:true});
 const expected=suffix==='b'?8:4;assert.equal(m.phase,PHASE.PREP);assert.equal(ps.layers.siracusaShip,expected);
 const snapshots=h.sent.filter(([pid,msg])=>pid==='p_0'&&msg.t==='m.private').map(([,msg])=>msg);
 assert.ok(snapshots.length);assert.equal(snapshots.at(-1).bonds.find(b=>b.bondId==='siracusaShip').layers,expected);
 assert.equal(m.publicView().players.find(p=>p.playerId==='p_0').bonds.find(b=>b.bondId==='siracusaShip').layers,expected);
 assert.deepEqual(m.handle('p_0',{t:'g.refresh'}),{ok:true});assert.equal(ps.layers.siracusaShip,expected,'first refresh only');
});

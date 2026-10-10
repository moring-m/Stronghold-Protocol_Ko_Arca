import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeMatch,give,giveItem} from './harness.js';
const data=loadData(new URL('../../content/production/data/',import.meta.url).pathname);
for(const elite of [false,true])test(`beacon rejects ${elite?'elite':'normal'} recruits without consuming either piece`,()=>{
 const h=makeMatch({mode:'solo',humans:1,fake:true,data}).start();h.toPrep(1);
 const m=h.m,ps=h.ps('p_0');ps.board.clear();ps.hand.fill(null);ps.temp.fill(null);
 const rec=Object.values(data.chess).find(c=>c.optionalRecruit&&!!c.isGolden===elite);
 assert.ok(rec);const target=give(m,ps,rec.chessId,'hand'),item=giveItem(m,ps,'chess_item_5_04_e_a');
 const result=m.handle('p_0',{t:'g.equip',itemUid:item.uid,targetUid:target.uid});
 assert.equal(result.error,'BAD_TARGET');assert.ok(ps.find(target.uid));assert.ok(ps.find(item.uid));
 assert.equal(ps.offers.length,0);assert.ok(!ps.effects.some(e=>e.key==='effect:builtin_gift'));m.dispose();
});

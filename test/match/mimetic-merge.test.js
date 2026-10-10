import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch,give,giveItem} from './harness.js';
for(const itemId of ['chess_item_5_05_e_a','chess_item_5_05_e_b'])test(`mimetic ${itemId} creates the third normal copy even when shared stock is exhausted`,()=>{
 const h=makeMatch({mode:'solo',humans:1,seed:3}).start();h.toPrep(1);const m=h.m,ps=h.ps('p_0');for(const p of ps.allChess())ps.returnCopies(p);ps.board.clear();ps.hand.fill(null);ps.temp.fill(null);ps.offers.length=0;
 const id='chess_char_1_02_a';give(m,ps,id);const target=give(m,ps,id);m.pool.take(id,m.pool.left(id));assert.equal(m.pool.left(id),0);const item=giveItem(m,ps,itemId);
 assert.deepEqual(m.handle('p_0',{t:'g.equip',itemUid:item.uid,targetUid:target.uid}),{ok:true});
 const elite=ps.allChess().find(p=>p.id==='chess_char_1_02_b');assert.ok(elite,'the two owned normals and the mimetic copy merge');assert.equal(ps.allChess().filter(p=>p.id===id).length,0);assert.equal(elite.poolCopies,2,'the synthetic third copy does not create shared-pool stock');assert.equal(m.pool.left(id),0);assert.equal(ps.find(item.uid),null,'consumed item');
});

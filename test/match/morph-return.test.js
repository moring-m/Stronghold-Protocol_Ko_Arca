import{test}from'node:test';import assert from'node:assert/strict';import{makeMatch}from'./harness.js';
const itemId='chess_item_6_09_e_a';
for(const area of ['hand','board','temp'])for(const full of [false,true])test(`morph equipment survives selling carrier in ${area}, bench ${full?'full':'free'}`,t=>{
 const h=makeMatch({mode:'solo',fake:true}).start();t.after(()=>h.m.dispose());h.toPrep(1);const ps=h.ps('p_0');ps.hand.fill(null);ps.temp.fill(null);ps.board.clear();ps.bandId=null;
 const op=ps.newPiece('chess','chess_char_1_01_a'),item=ps.newPiece('item',itemId);op.items.push(item);
 if(full)ps.hand=ps.hand.map(()=>ps.newPiece('chess','chess_char_1_01_a'));
 if(area==='board')ps.board.set('10,4',op);else ps[area][0]=op;
 ps.recompute();assert.deepEqual(ps.sell(op.uid),{ok:true});assert.equal(ps.find(item.uid)?.piece.id,itemId);assert.equal(ps.find(op.uid),null);const view=ps.privateView();assert.ok([...view.hand,...view.temp].some(p=>p?.uid===item.uid&&p.id===itemId));
});
for(const full of [false,true])test(`automatic temporary-carrier disposal returns morph equipment, bench ${full?'full':'free'}`,t=>{
 const h=makeMatch({mode:'solo',fake:true}).start();t.after(()=>h.m.dispose());h.toPrep(1);const ps=h.ps('p_0');ps.hand.fill(null);ps.temp.fill(null);ps.board.clear();ps.bandId=null;
 if(full)ps.hand=ps.hand.map(()=>ps.newPiece('chess','chess_char_1_01_a'));
 const op=ps.newPiece('chess','chess_char_1_01_a'),item=ps.newPiece('item',itemId);op.items=[item];ps._putTemp(0,op);ps.resolveTemp();
 assert.equal(ps.find(op.uid),null);assert.equal(ps.find(item.uid)?.piece.id,itemId);
 if(full){assert.equal(ps.find(item.uid).area,'temp');assert.ok(ps.tempDue(item)>ps.prepsEnded);}
});
test('automatic disposal defers the carrier instead of losing equipment when no return space exists',t=>{
 const h=makeMatch({mode:'solo',fake:true}).start();t.after(()=>h.m.dispose());h.toPrep(1);const ps=h.ps('p_0');ps.board.clear();ps.hand=ps.hand.map(()=>ps.newPiece('chess','chess_char_1_01_a'));ps.temp=ps.temp.map(()=>ps.newPiece('chess','chess_char_1_01_a'));ps.bandId=null;
 const op=ps.temp[0],items=[ps.newPiece('item',itemId),ps.newPiece('item',itemId)];op.items=items;
 for(const p of ps.temp.slice(1))ps._tempDue.set(p.uid,ps.prepsEnded+1);ps.resolveTemp();
 assert.equal(ps.find(op.uid)?.piece,op);assert.ok(items.every(it=>ps.find(it.uid)?.area==='equipped'));assert.ok(ps.tempDue(op)>ps.prepsEnded);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch} from './harness.js';

test('equipment selection rewards use free temporary slots; full benches retain the unclaimed reward', t => {
  const h=makeMatch({mode:'solo',fake:true}).start(); t.after(()=>h.m.dispose()); h.toPrep(1);
  const ps=h.ps('p_0');ps.board.clear();ps.hand.fill(null);ps.temp.fill(null);ps.offers.length=0;
  const fill=()=>ps.newPiece('chess','chess_char_1_01_a');
  ps.hand=ps.hand.map(fill);
  const id='chess_item_1_02_e_a';ps.pushItemOffer([id]);
  assert.deepEqual(ps.pickReward(0),{ok:true});
  assert.ok(ps.temp.some(p=>p?.id===id));assert.equal(ps.offers.length,0);
  ps.temp=ps.temp.map(fill);ps.pushItemOffer([id]);
  assert.equal(ps.pickReward(0).error,'HAND_FULL');assert.equal(ps.offers.length,1);
});

for (const suffix of ['a','b']) test(`Muelsyse ${suffix}: buying the last normal bench slot gives all trait equipment to temp and the client view`, t => {
  const h=makeMatch({mode:'solo',fake:true}).start();t.after(()=>h.m.dispose());h.toPrep(1);
  const ps=h.ps('p_0');ps.board.clear();ps.hand.fill(null);ps.temp.fill(null);ps.bandId=null;ps.funds=100;
  for(let i=0;i<ps.hand.length-1;i++)ps.hand[i]=ps.newPiece('chess','chess_char_1_01_a');
  ps.shop.slots[0]={kind:'chess',id:`chess_char_6_11_${suffix}`,price:6,sold:false};
  assert.deepEqual(ps.buy(0),{ok:true});assert.ok(ps.hand.every(Boolean));
  const expected=suffix==='b'?2:1;
  assert.equal(ps.temp.filter(p=>p?.id==='chess_item_6_09_e_a').length,expected);
  assert.equal(ps.privateView().temp.filter(p=>p?.id==='chess_item_6_09_e_a').length,expected);
});

for(const mode of ['solo','coop'])for(const suffix of ['a','b'])test(`Muelsyse ${mode} ${suffix}: guaranteed trait equipment ignores exhausted shop stock`,t=>{
 const h=makeMatch({mode,humans:mode==='coop'?2:1,fake:true}).start();t.after(()=>h.m.dispose());h.toPrep(1);
 const m=h.m,ps=h.ps('p_0'),stockOwner=mode==='coop'?h.ps('p_1'):ps,id='chess_item_6_09_e_a';
 for(const p of m.order){p.hand.fill(null);p.temp.fill(null);p.board.clear();p.bandId=null;}
 for(let i=0;i<m.itemPool.cap(id);i++)stockOwner.stow(stockOwner.newPiece('item',id));
 assert.equal(m.itemPool.canGain(id),false);
 for(let i=0;i<ps.hand.length;i++)if(!ps.hand[i])ps.hand[i]=ps.newPiece('chess','chess_char_1_01_a');
 const before=[...ps.hand,...ps.temp].filter(p=>p?.id===id).length;
 assert.ok(ps.acquireChess(`chess_char_6_11_${suffix}`,{fromPool:false}));
 assert.equal([...ps.hand,...ps.temp].filter(p=>p?.id===id).length-before,suffix==='b'?2:1);
 assert.ok(ps.temp.some(p=>p?.id===id));
 assert.equal(ps.acquireItem(id,{source:'buy'}),null,'ordinary stock limits still apply');
});

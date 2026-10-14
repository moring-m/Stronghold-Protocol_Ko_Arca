import{test}from'node:test';import assert from'node:assert/strict';import{makeMatch}from'./harness.js';import{loadData}from'../../server/data.js';import{isShopItem}from'../../server/sim/simdata.js';
const data=loadData('content/production/data');
test('Narantuya draws only persistent original combat equipment, at any shop level',t=>{
 const h=makeMatch({data,mode:'solo',humans:1,seed:11,fake:true}).start();t.after(()=>h.m.dispose());const pool=data.choices.pools.pool_equip_narant.items;
 const expected=Object.entries(data.items).filter(([id,i])=>/^chess_item_[1-6]_\d+_e_a$/.test(id)&&isShopItem(i)&&['passive','passive_counter'].includes(i.kind)).map(([id])=>id);assert.deepEqual(pool,expected);assert.ok(pool.length>30);assert.ok(!pool.includes('chess_item_2_05_e_a'));assert.ok(!pool.some(id=>id.includes('custom')));assert.ok(pool.some(id=>data.items[id].tier===6));
 for(const level of [1,3,6])for(let i=0;i<250;i++){const id=h.m.rollItemId({pool:'pool_equip_narant',shopLevel:level});assert.ok(pool.includes(id),id);assert.ok(!data.items[id].kind.startsWith('consume'));assert.notEqual(data.items[id].kind,'passive_player');}
});
test('Narantuya even-round offers contain two different eligible items; Catherine still allows dolls',t=>{
 const h=makeMatch({data,mode:'solo',humans:1,seed:13,fake:true}).start();t.after(()=>h.m.dispose());h.toPrep(2,{band:'band_narant'});const ps=h.ps('p_0'),offer=ps.offers.find(o=>o.slots?.length===2);assert.ok(offer);const ids=offer.slots.map(s=>s.id);assert.equal(new Set(ids).size,2);assert.ok(ids.every(id=>data.choices.pools.pool_equip_narant.items.includes(id)));
 h.m.itemPool.canGain=()=>true;let seen=false;for(let i=0;i<500;i++)if(h.m.rollItemId({pool:'pool_equip_kathe',shopLevel:6})==='chess_item_2_05_e_a')seen=true;assert.ok(seen,'Catherine retains her existing shop-equipment pool');
});

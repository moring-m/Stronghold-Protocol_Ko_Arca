import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeMatch,give} from './harness.js';
const data=loadData(new URL('../../content/production/data/',import.meta.url).pathname);
for(const suffix of ['a','b'])test(`Catherine ${suffix}: odd-round equipment grants require deployment and use tier I-IV non-financial equipment regardless of shop level`,()=>{
 const h=makeMatch({mode:'solo',humans:1,fake:true,data,seed:13}).start();h.toPrep(1);
 const m=h.m,ps=h.ps('p_0');ps.board.clear();ps.hand.fill(null);ps.temp.fill(null);
 give(m,ps,'chess_char_4_11_'+suffix,'hand');
 const obtained=[],acquire=ps.acquireItem.bind(ps);ps.acquireItem=(id,opts)=>{obtained.push(id);return acquire(id,opts)};
 m.round=3;m.dispatch(ps,'onRoundStart',{round:3});assert.equal(obtained.length,0,'bench does not trigger');
 const piece=ps.hand.find(p=>p?.id==='chess_char_4_11_'+suffix);ps.hand[ps.hand.indexOf(piece)]=null;ps.board.set('10,4',piece);ps.recompute();
 m.round=2;m.dispatch(ps,'onRoundStart',{round:2});assert.equal(obtained.length,0,'even round does not trigger');
 m.round=3;m.dispatch(ps,'onRoundStart',{round:3});assert.equal(obtained.length,suffix==='b'?2:1);
 assert.equal(ps.shop.level,1);const tiers=new Set();
 for(let i=0;i<300;i++){const reward=m.rollPool('pool_equip_cathy_garrison',{shopLevel:1,playerId:ps.playerId});const item=m.gd.item(reward.id);assert.ok(!item.isGolden&&!item.shopExcluded);tiers.add(item.tier);}
 assert.deepEqual([...tiers].sort(),[1,2,3,4]);
 const excluded=data.choices.pools.pool_equip_cathy_garrison.excluded;for(const id of obtained)assert.ok(!excluded.includes(id));
 const seen=new Set();for(let i=0;i<2000;i++)seen.add(m.rollPool('pool_equip_cathy_garrison',{shopLevel:1}).id);
 const expected=Object.entries(data.items).filter(([id,it])=>it.itemType==='EQUIP'&&!it.isGolden&&!it.hideInShop&&!it.shopExcluded&&it.tier<=4&&!excluded.includes(id)&&m.gd.shopItemsByTier[it.tier]?.includes(id)).map(([id])=>id);
 assert.deepEqual([...seen].sort(),expected.sort());assert.deepEqual(h.logs.error,[]);m.dispose();
});

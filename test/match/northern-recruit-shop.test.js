import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeMatch} from './harness.js';
import {PHASE} from '../../shared/constants.js';
const data=loadData(new URL('../../content/production/data/',import.meta.url).pathname);
for(const tier of [5,6])test(`each coop player can roll their selected tier-${tier} recruit without selecting Talulah`,()=>{
 const h=makeMatch({data,humans:4,bots:0,mode:'coop',seed:42}).start();
 try{
  h.m.phase=PHASE.BAND_DRAFT;h.m.bannedChess=[];
  const ids=['talulah','territoriya','toska','makoto'].map(name=>`chess_custom_recruit_${name}_${tier}_a`);
  const players=ids.map((id,i)=>{const ps=h.ps('p_'+i);assert.equal(h.m.setLoadout(ps.playerId,{[id]:{selected:true}}).ok,true);ps.recruitPicks=new Set([id]);ps.shop.level=tier;return ps;});
  const weights=[];
  for(const [i,ps]of players.entries()){
   for(const [j,id]of ids.entries())assert.equal(ps.pool.has(id),i===j);
   const eligible=ps.pool._eligible({maxTier:tier,filter:id=>ps.canRecruit(id)}),total=eligible.reduce((n,[,w])=>n+w,0),at=eligible.findIndex(([id])=>id===ids[i]);assert.ok(at>=0);
   const weight=eligible[at][1],offset=eligible.slice(0,at).reduce((n,[,w])=>n+w,0);weights.push(weight);
   const before=h.m.rngShop;h.m.rngShop=()=> (offset+weight/2)/total;
   assert.equal(ps._rollChessSlot().id,ids[i]);h.m.rngShop=before;
   ps.shop.level=tier-1;assert.ok(!ps.pool._eligible({maxTier:ps.shop.level,filter:id=>ps.canRecruit(id)}).some(([id])=>id===ids[i]));
  }
  assert.ok(weights.every(w=>w===weights[0]));
  players[0].pool.take(ids[0],1);assert.equal(players[1].pool.left(ids[1]),weights[1]);
 }finally{h.m.dispose();}
});

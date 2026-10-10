import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeBattle,chessRec,enemyRec,checkInvariants} from '../helpers/battleHarness.js';
import {setGameData} from '../../server/sim/content/support/index.js';
import {performAttack,effectiveProfile} from '../../server/sim/ai.js';
const data=loadData(new URL('../../.cache/ursus-data/',import.meta.url).pathname),ITEM='chess_item_custom_ursus_favor_a',CUTLASS='chess_item_custom_ursus_a',DRONE='token_custom_ursus_drone';
function setup(member=true,combo=true){
 const raw={...data,chess:{...data.chess,guard:chessRec({id:'guard',bonds:member?['ursusShip']:[],skill:null,stats:{maxHp:1000,atk:10,aspd:100}})},enemies:{...data.enemies,dummy:enemyRec({key:'dummy',hp:1e9,speed:0,atk:0,def:10000,res:100})}};
 const h=makeBattle({data:raw,captureNoisy:true,units:[{chessId:'guard',row:10,col:3,items:[ITEM,...combo?[CUTLASS]:[]]}],enemies:[{key:'dummy',route:{motion:'WALK',start:[10,4],end:[10,2],checkpoints:[]}}],bonds:{ursusShip:{active:false,count:1,layers:0,tier:0}},autoFinish:false});h.run(1);
 const u=h.unit('guard'),e=h.enemy(),d=h.b.spawnToken(u.ownerId,DRONE,11,5,{anySource:true});return {h,u,e,d};
}
for(const member of [false,true])test(`favor: universal stats; Ursus-only true damage (${member})`,()=>{
 setGameData(data);try{const {h,u,e,d}=setup(member,false),start=d.s.aspd,n0=h.hooksOf('damaged').length;
 assert.equal(u.s.maxHp,1300);assert.equal(u.s.aspd,130);
 performAttack(h.b,u,{...effectiveProfile(u),attack:'melee'},[e]);
 const procs=h.hooksOf('damaged').slice(n0).filter(c=>c.dmg.tags.includes('item:ursus_favor'));assert.equal(procs.length,member?1:0);if(member){assert.equal(procs[0].type,'true');assert.equal(procs[0].amount,65);}assert.equal(d.s.aspd,start);assert.equal(h.b.errorCount,0);checkInvariants(h.b);
 }finally{setGameData(null)}
});
test('favor + cutlass counts actual separate strikes, stops at 100, and never recursively procs',()=>{
 setGameData(data);try{const {h,u,e,d}=setup(true,true),start=d.s.aspd,n0=h.hooksOf('damaged').length;
 performAttack(h.b,u,{...effectiveProfile(u),attack:'melee',hits:4},[e]);assert.equal(d.s.aspd,start+4);
 for(let i=0;i<120;i++)performAttack(h.b,u,{...effectiveProfile(u),attack:'melee'},[e]);
 assert.equal(d.s.aspd,start+100);assert.equal(h.hooksOf('damaged').slice(n0).filter(c=>c.dmg.tags.includes('item:ursus_favor')).length,124);assert.equal(h.b.errorCount,0);checkInvariants(h.b);
 }finally{setGameData(null)}
});
test('updated roster uses new tiers and real trait blackboards, with existing elite multipliers',()=>{
 for(const [key,tier,n]of [['turdus',2,3],['brownb',3,5]])for(const suffix of ['a','b']){const c=data.chess[`chess_custom_ursus_${key}_${suffix}`];assert.equal(c.tier,tier);const g=data.garrisons[c.garrisonIds[0]];assert.equal(g.bb.count,n*(suffix==='b'?2:1));assert.match(g.desc,new RegExp(`\\+${n*(suffix==='b'?2:1)}`));}
 const bot=data.chess.chess_custom_ursus_botany_a;assert.deepEqual(bot.bonds,['ursusShip','miraShip']);const g=data.garrisons[bot.garrisonIds[0]];assert.equal(g.bbStr.bond_id,'ursusShip');assert.equal(g.bb.bond_add_count,7);assert.equal(g.bb.max_add_count_per_battle,7);assert.ok(!g.desc.includes('신속'));
 const item=data.items[ITEM];assert.equal(item.tier,6);assert.equal(item.price,4);assert.equal(data.items.chess_item_custom_ursus_favor_b.price,4);assert.equal(item.giveBondId,null);assert.equal(data.assets.items.ursus_favor,'/assets/custom/ursus/item/emperors-favor.png');
});

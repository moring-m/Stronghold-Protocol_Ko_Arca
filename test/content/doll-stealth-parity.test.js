import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
import {loadData} from '../../server/data.js';
import {setGameData} from '../../server/sim/content/support/index.js';
const data=loadData(new URL('../../content/production/data/',import.meta.url).pathname);
test('Makoto follows Kazemaru: persona entry clears Siracusa stealth without deployment or duration refresh',()=>{
 setGameData(data);try{for(const id of ['chess_char_2_11_a','chess_custom_recruit_makoto_6_a']){
  const rec={...data.chess[id],bonds:['siracusaShip']};
  const h=makeBattle({data:{...data,chess:{...data.chess,[id]:rec},enemies:{...data.enemies,dummy:enemyRec({key:'dummy',hp:1e9,atk:0,speed:0})}},units:[{chessId:id,row:10,col:3,skillIndex:0}],enemies:[{key:'dummy',pos:[10,9]}],bonds:{siracusaShip:{count:6,active:true,tier:2,layers:20}},autoFinish:false,timeLimit:100});
  h.step();h.run(1.1);const u=h.unit(id);if(u.skill)u.skill.rule='NEVER';assert.ok(u.s.flags.stealth);
  const deployments=h.hooksOf('deploy').filter(c=>c.unit===u).length,seq=u.deploySeq;
  h.b.loseHp(u,u.hp+100,{source:null});assert.ok(u.trait.doll);assert.equal(!!u.s.flags.stealth,false);
  assert.equal(h.hooksOf('deploy').filter(c=>c.unit===u).length,deployments);assert.equal(u.deploySeq,seq);
  h.run(24);assert.equal(u.trait.doll,false);assert.equal(!!u.s.flags.stealth,false);assert.equal(h.b.errorCount,0);
 }}finally{setGameData(null)}
});

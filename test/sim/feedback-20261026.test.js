import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeBattle} from '../helpers/battleHarness.js';
const data=loadData(new URL('../../content/production/data/',import.meta.url).pathname);
test('Exusiai S3 starts at full SP with no enemy',()=>{
 const h=makeBattle({data,units:[{chessId:'chess_char_3_01_a',row:10,col:3}],autoFinish:false});
 h.step();const u=h.unit('chess_char_3_01_a');u.skill.gainSp(1000);
 assert.ok(h.runUntil(()=>u.skill.active,2));assert.equal(u.skill.active,true);assert.equal(u.skill.rule,'SP_FULL');assert.equal(h.b.errors.length,0);
});
for(const [item,gift] of [['chess_item_3_05_e_a',3],['chess_item_3_05_e_b',6]])test(`Ulpianus S3 return re-deploys and grants ration SP (${item})`,()=>{
 const enemy={...data.enemies.enemy_1010_demon,stats:{...data.enemies.enemy_1010_demon.stats,maxHp:1e9,atk:0,moveSpeed:0}};
 const h=makeBattle({data:{...data,enemies:{...data.enemies,enemy_1010_demon:enemy}},units:[{chessId:'chess_char_5_05_a',row:10,col:3,items:[item]}],enemies:[{key:'enemy_1010_demon',pos:[10,6]}],hooks:['deploy'],autoFinish:false,timeLimit:120});
 h.step();const u=h.unit('chess_char_5_05_a');u.skill.gainSp(1000);assert.ok(h.runUntil(()=>u.skill.active,2));assert.equal(u.tileC,6);
 const seq=u.deploySeq;u.skill.sp=7;assert.ok(h.runUntil(()=>!u.skill.active,30));assert.equal(u.tileC,3);assert.ok(u.deploySeq>seq);assert.ok(Math.abs(u.skill.sp-gift)<.1,`${u.skill.sp} expected ${gift}`);
 assert.equal(h.hooksOf('deploy').filter(c=>c.unit===u).length,3);assert.equal(h.b.errors.length,0);
});

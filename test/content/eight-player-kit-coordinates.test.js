import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeBattle} from '../helpers/battleHarness.js';
import {eightUniteStage,EIGHT_UNITE_RECT} from '../../shared/cooperativeEight.js';
const data=loadData('content/production/data');
for(const colOffset of [0,8,16,24])test(`Saria S2 heals an adjacent ally on cooperative-defense field offset ${colOffset}`,()=>{
 const h=makeBattle({data,kind:'unite',stage:eightUniteStage(data.stages.act1autochess_m01),rect:EIGHT_UNITE_RECT,autoFinish:false,captureNoisy:true,players:[{playerId:'p',colOffset,units:[{uid:1,chessId:'chess_char_5_11_a',row:12,col:7,skillIndex:1},{uid:2,chessId:'chess_char_1_01_a',row:12,col:6}],bonds:{}}]});
 h.run(.2);const caster=h.b.allyUnits.find(u=>u.uid===1),target=h.b.allyUnits.find(u=>u.uid===2);assert.ok(caster&&target);
 target.hp=target.s.maxHp/2;caster.skill.gainSp(1000);caster.skill.activate('test');h.run(.3);
 assert.ok(h.hooksOf('heal').some(c=>c.source===caster&&c.target===target),'S2 must heal its adjacent ally');
 assert.equal(h.b.errorCount,0);
});

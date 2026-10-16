import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {makeBattle,flatStage} from '../helpers/battleHarness.js';
import {buildBattleSpec,createBattleFromSpec} from '../../server/sim/spec.js';
import {unitStatsEntry} from '../../shared/protocol.js';
const loaded=loadData('content/production/data'),data={...loaded,stages:{...loaded.stages,flat:flatStage()}};
const member='chess_char_1_14_a',neighbour='chess_char_1_01_a';
for(const kind of ['normal','unite','boss','hidden'])for(const serialized of [false,true])test(`production Skillful 200 layers ${kind}, client round-trip=${serialized}`,()=>{
 const h=makeBattle({data,kind,modeId:'mode_multi_hard',autoFinish:false,bonds:{skillfulShip:{active:true,tier:1,count:2,layers:200}},units:[{chessId:member,row:10,col:4},{chessId:neighbour,row:10,col:5}]});
 const b=serialized?createBattleFromSpec(JSON.parse(JSON.stringify(buildBattleSpec(h.b.opts))),data,{quiet:true}):h.b;
 for(let i=0;i<60;i++)b.step(1/30);
 const units=[...b.units.values()].filter(u=>u.kind==='op');assert.equal(units.length,2);
 for(const u of units){assert.equal(u.findBuff('bond:skillfulShip')?.mods.aspd,210);assert.equal(u.s.aspd,u.base.aspd+210);const view=unitStatsEntry(u,u.s);assert.ok(view.interval<view.base.interval,'live stat display includes the attack interval reduction');}
 assert.equal(b.errorCount,0);
});

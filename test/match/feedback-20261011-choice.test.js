import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeMatch} from './harness.js';
import {PHASE} from '../../shared/constants.js';
test('completed communal choice stays visible for one second, then enters preparation',()=>{
 const h=makeMatch({mode:'coop',humans:2,fake:true}).start().toPrep();const m=h.m;
 m.phase=PHASE.SP_DRAFT;m.sp={cards:['chess_item_1_01_e_a','chess_item_1_02_e_a'].map((id,idx)=>({id,idx,kind:'item'})),order:['p_0','p_1'],idx:0,picks:{},taken:{},untimed:true};
 assert.ok(m.pickCard(h.ps('p_0'),0).ok);assert.ok(m.pickCard(h.ps('p_1'),1).ok);
 assert.equal(m.phase,PHASE.SP_DRAFT);h.sched.advance(999);assert.equal(m.phase,PHASE.SP_DRAFT);h.sched.advance(1);assert.equal(m.phase,PHASE.PREP);m.dispose();
});

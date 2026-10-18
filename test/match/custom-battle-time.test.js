import {test} from 'node:test';import assert from 'node:assert/strict';
import {makeMatch,DATA} from './harness.js';
import {buildNormalWave} from '../../server/match/waves.js';
import {PHASE} from '../../shared/constants.js';
import {extensionSelectionCount,normalizeCustomExtensions,recordCustomExtensions,extensionSelectionShape} from '../../shared/customExtensions.js';

test('default times preserve each normal round and 120-second boss countdown',t=>{
 const h=makeMatch({fake:true});t.after(()=>h.m.dispose());const gd=h.m.gd;
 for(const [r,c] of Object.entries(gd.mode.rounds)){if(c.combatTimeLimit)assert.equal(gd.combatTimeLimitReal(Number(r)),c.combatTimeLimit);}
 assert.equal(gd.bossLevelTime(gd.bossRound),120);assert.equal(gd.bossOvertimeAfterReal,150);
 assert.equal(extensionSelectionCount({ruleValues:{normalBattleTime:0,bossBattleTime:120}}),0);
});
for(const mode of ['solo','coop','coop8'])for(const speed of [1,2])test(`${mode}: custom normal and boss times flow into specs and clocks (${speed}x boss)`,t=>{
 const h=makeMatch({mode,humans:mode==='coop8'?8:1,fake:true,instant:false,customExtensions:{ruleValues:{normalBattleTime:73,bossBattleTime:180,bossBattleSpeed:speed}}});t.after(()=>h.m.dispose());const m=h.m;
 m.round=2;m.wave=buildNormalWave(m.gd,m.rngWaves,m.factions,2);assert.equal(m.wave.timeLimit,146);assert.equal(m._normalOpts(m.order[0]).timeLimit,146);
 m.phase=PHASE.COMBAT;m.startCombat();assert.equal((m.deadline-h.sched.now())/1000,73);m.runner?.stop();
 const plan={helpers:m.order.slice(0,mode==='coop8'?4:1),leakers:[],leaked:[],notReentered:new Map()};m.startUnite(plan);assert.equal(m.fields[0].battle.opts.timeLimit,146);assert.equal((m.deadline-h.sched.now())/1000,73);m.runner?.stop();
 m.round=m.gd.bossRound;m.startFinalAssault(false);assert.equal((m.deadline-h.sched.now())/1000,180/speed);assert.equal((m.overtimeAt-h.sched.now())/1000,180/speed);m.runner?.stop();
 m.round=m.gd.hiddenRound;m.startFinalAssault(true);assert.equal((m.deadline-h.sched.now())/1000,180/speed);m.runner?.stop();
 assert.equal(m.gd.bossOvertimeAfterReal,210);assert.equal(m.errorCount,0);
});
test('time settings validate, persist and reset with ordinary custom settings',()=>{
 const value={bonds:[],stages:[],ruleValues:{normalBattleTime:90,bossBattleTime:240}};assert.ok(extensionSelectionShape(value));
 assert.equal(normalizeCustomExtensions(value,DATA).ruleValues.normalBattleTime,90);assert.deepEqual(recordCustomExtensions(value).ruleValues,{normalBattleTime:90,bossBattleTime:240});assert.equal(extensionSelectionCount(value),2);
 assert.equal(extensionSelectionShape({...value,ruleValues:{normalBattleTime:-1}}),false);
});

test('custom boss countdown retains the AI-team overtime grace',t=>{
 const h=makeMatch({mode:'coop',humans:1,bots:1,fake:true,instant:false,customExtensions:{ruleValues:{bossBattleTime:180}}});t.after(()=>h.m.dispose());const m=h.m;m.round=m.gd.bossRound;m.startFinalAssault(false);
 assert.equal((m.deadline-h.sched.now())/1000,180);assert.equal((m.overtimeAt-h.sched.now())/1000,210);m.runner?.stop();
});

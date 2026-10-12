import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DATA,makeMatch} from './match/harness.js';
import {GameData} from '../server/match/gamedata.js';
import {applyCustomExtensions,normalizeCustomExtensions,extensionSelectionShape,recordCustomExtensions} from '../shared/customExtensions.js';
import {setupMatchWaves,buildNormalWave,buildBossWave} from '../server/match/waves.js';
import {createRng} from '../server/sim/rng.js';
for(const n of [3,13,20])for(const modeId of ['mode_single_normal','mode_multi_normal','mode_multi_funny'])test(`${modeId}: ${n} ordinary rounds, followed by boss and optional hidden boss`,()=>{
 const selection=normalizeCustomExtensions({ruleValues:{roundCount:n}},DATA),gd=new GameData(applyCustomExtensions(DATA,selection),modeId);
 assert.equal(extensionSelectionShape(selection),true);assert.equal(gd.bossRound,n+1);assert.equal(gd.hiddenRound,modeId==='mode_multi_funny'?null:n+2);
 const rng=createRng(17),setup=setupMatchWaves(gd,rng);
 for(let r=1;r<=n;r++){const wave=buildNormalWave(gd,rng,setup,r);assert.ok(wave.spawns.length,`R${r} has enemies`);if(r>=14){assert.equal(wave.templateId,gd.roundCfg(13).template);assert.deepEqual(gd.enemyScale(r),gd.enemyScale(13));assert.deepEqual(wave.pick,setup.picks[13]);}}
 assert.ok(buildBossWave(gd,rng,setup,gd.bossRound,{bossId:setup.bossId,solo:gd.isSolo}).spawns.length);
 if(gd.hiddenRound)assert.ok(buildBossWave(gd,rng,setup,gd.hiddenRound,{bossId:setup.hiddenBossId,solo:gd.isSolo}).spawns.length);
});
test('default selection preserves ordinary modes, custom values are recorded and invalid counts rejected',()=>{
 const out=applyCustomExtensions(DATA,normalizeCustomExtensions({},DATA));for(const [id,m]of Object.entries(DATA.config.modes))assert.deepEqual(out.config.modes[id].rounds,m.rounds);
 assert.equal(recordCustomExtensions({ruleValues:{roundCount:20}}).ruleValues.roundCount,20);
 for(const count of[0,101,2.5])assert.equal(extensionSelectionShape({ruleValues:{roundCount:count}}),false);
});
test('match plans the new boss phase after the configured ordinary rounds',()=>{
 const h=makeMatch({mode:'coop8',humans:8,fake:true,customExtensions:{ruleValues:{roundCount:20}}});h.start();h.m.startRound(20);assert.ok(h.m.wave.spawns.length);assert.equal(h.m.bossWaves,null);h.m.startRound(21);assert.equal(h.m.wave,null);assert.equal(h.m.bossWaves.length,4);h.m.dispose();
});

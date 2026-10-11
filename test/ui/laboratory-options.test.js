import {test} from 'node:test';
import assert from 'node:assert/strict';
import {getData} from '../../server/data.js';
import {laboratoryOptions} from '../../shared/laboratoryOptions.js';
const raw=getData({dataDir:'content/production/data'});
for(const difficulty of ['FUNNY','NORMAL','HARD','ABYSS'])test(`laboratory pools match ${difficulty} solo mode`,()=>{
 const mode=Object.values(raw.config.modes).find(m=>m.type==='SINGLE'&&m.difficulty===difficulty);
 const options=laboratoryOptions(raw.config,raw.bosses,difficulty);
 assert.deepEqual(options.stageIds,mode.stages);
 assert.deepEqual(options.bossIds,Object.keys(mode.bossWeights).filter(id=>mode.bossWeights[id]>0));
 assert.deepEqual(options.hiddenBossIds,Object.keys(mode.hiddenBossWeights).filter(id=>mode.hiddenBossWeights[id]>0));
 if(difficulty==='FUNNY'){assert.equal(options.stageIds.length,1);assert.equal(options.hiddenBossIds.length,0);}
});

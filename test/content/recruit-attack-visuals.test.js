import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadData} from '../../server/data.js';
import {setGameData} from '../../server/sim/content/support/index.js';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
import {projectileStyle} from '../../public/js/render/projectileStyle.js';
const base=loadData(new URL('../../.cache/leithanien-data',import.meta.url).pathname);
const data={...base,enemies:{dummy:enemyRec({key:'dummy',hp:1e9,atk:0,speed:0,def:0,res:0})}};
for(const tier of [5,6])for(const golden of [false,true])for(const index of [0,1,2])test(`Angelina alter recruit tier ${tier} ${golden?'elite':'normal'} S${index+1} displays flight attacks without introducing damage travel time`,()=>{
 setGameData(data);const c=Object.values(data.chess).find(c=>c.optionalRecruit&&c.charId==='char_1015_aglna2'&&c.tier===tier&&c.isGolden===golden);assert.ok(c);
 const h=makeBattle({data,units:[{chessId:c.chessId,skillIndex:index,row:10,col:3}],enemies:[{key:'dummy',route:{motion:'WALK',start:[10,4],end:[10,4],checkpoints:[]}}],autoFinish:false,captureNoisy:true});
 h.run(.1);const u=h.unit(c.chessId);u.skill.gainSp(10000,'test');if(!u.skill.active)u.skill.activate('test');h.run(8);
 const kind=index===1?'bolt':'arrow';assert.ok(h.eventsOf('atk').some(e=>e[1]===u.id&&e[3]===kind));assert.ok(projectileStyle(kind,{charId:c.charId}));assert.equal(u.profile.projectile,'none');assert.ok(u.stats.dmg>0);assert.equal(h.b.errorCount,0);
});

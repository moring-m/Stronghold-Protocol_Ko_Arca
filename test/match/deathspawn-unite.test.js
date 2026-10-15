import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBattle } from '../helpers/battleHarness.js';
import { makeMatch, DATA } from './harness.js';
import { buildUniteWave } from '../../server/match/waves.js';

const gd = makeMatch({mode:'coop',humans:3,fake:true}).start().m.gd;
const parents = Object.entries(DATA.enemies).filter(([,e]) => e.talents?.bbStr?.['DeadSpawn.enemy_key'] && e.talents?.bb?.['DeadSpawn.cnt'] > 0);
for (const [key, def] of parents) {
  test(`${key}: death-spawned leaks re-enter united defense exactly once`, () => {
    const own = makeBattle({autoFinish:false});
    own.step();
    const parent = own.spawn(key, {pos:[9,7], mods:{speedMul:0}});
    own.b.kill(parent, null);
    const children = own.enemies().filter(e => e.alive);
    assert.ok(children.length > 0);
    for (const e of children) { own.b.leak(e); own.b.leak(e); }
    const leaks = Object.values(own.result().perPlayer).flatMap(p => p.leaked);
    assert.equal(leaks.length, children.length, 'one goal entry per child');
    assert.ok(leaks.every(l => l.enemyKey !== key), 'the killed parent is not transferred');
    for (const helpers of [1,2]) {
      const wave = buildUniteWave(gd, leaks, helpers, 60);
      assert.equal(wave.spawns.reduce((n,s)=>n+s.count,0), children.length);
      const united = makeBattle({kind:'unite',autoFinish:false,enemies:wave.spawns.map(s=>({key:s.enemyKey,count:s.count,sourcePlayerId:s.sourcePlayerId,mods:s.mods}))});
      united.step();
      assert.equal(united.enemies().filter(e=>e.alive).length, children.length, 'actual united spawns match escaped children');
    }
  });
}
test('loading a second URL for enemy content cannot duplicate death-spawned transfers', async () => {
 const duplicate = await import('../../server/sim/content/enemies.js?duplicate-release-test');
 const own = makeBattle({autoFinish:false});
 duplicate.install(own.b);
 own.step();
 const parent=own.spawn('enemy_1195_sfyin',{pos:[9,7],mods:{speedMul:0}});
 own.b.kill(parent,null);
 const children=own.enemies().filter(e=>e.alive);
 assert.equal(children.length,2,'one death hook even when the module is loaded twice');
 for(const child of children)own.b.leak(child);
 const leaks=Object.values(own.result().perPlayer).flatMap(p=>p.leaked);
 assert.equal(buildUniteWave(gd,leaks,2,60).spawns.length,2);
});

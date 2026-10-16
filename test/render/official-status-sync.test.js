import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FxWiring} from '../../public/js/render/vfx/wiring.js';
import {UF} from '../../shared/constants.js';
test('official shields and invulnerability are restored from flags even without status events',()=>{
 const spawned=[],ofx={active:true,lib:{has:key=>['common_shield_01','common_invincible_01'].includes(key)}};
 const w=new FxWiring(ofx);w.idx={generic:{status:{shield:'common_shield_01',invulnerable:'common_invincible_01'}}};
 w.skills.status=()=>{};w.playOn=key=>{const h={key,alive:true,stop(){this.alive=false;}};spawned.push(h);return h;};
 const v={id:1,alive:true,flags:UF.SHIELD|UF.INVULN,statuses:new Set()};
 w.syncStatuses(v);assert.deepEqual(spawned.map(h=>h.key),['common_shield_01','common_invincible_01']);
 w.syncStatuses(v);assert.equal(spawned.length,2,'no duplicate loops per frame');
 assert.equal(w.statusKey('invuln'),'common_invincible_01');assert.equal(w.statusKey('note'),null);
 v.flags=0;w.syncStatuses(v);assert.ok(spawned.every(h=>!h.alive));
 v.flags=UF.SHIELD;w.syncStatuses(v);assert.equal(spawned.length,3);assert.equal(spawned[2].alive,true);
 w.release(v);assert.equal(spawned[2].alive,false);assert.equal(w.statusSeen.size,0);
});

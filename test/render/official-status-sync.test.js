import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FxWiring} from '../../public/js/render/vfx/wiring.js';
import {UF} from '../../shared/constants.js';
test('official shields and invulnerability are restored from flags even without status events',()=>{
 const spawned=[],ofx={active:true,lib:{has:key=>['common_shield_01','common_invincible_01'].includes(key)}};
 const w=new FxWiring(ofx);w.idx={generic:{status:{shield:'common_shield_01',invulnerable:'common_invincible_01'}}};
 w.skills.status=()=>{};w.playOn=key=>{const h={key,alive:true,stop(){this.alive=false;}};spawned.push(h);return h;};
 const v={id:1,alive:true,flags:UF.SHIELD|UF.INVULN,statuses:new Set()};
 w.syncStatuses(v);assert.deepEqual(spawned.map(h=>h.key).sort(),['common_invincible_01','common_shield_01']);
 w.syncStatuses(v);assert.equal(spawned.length,2,'no duplicate loops per frame');
 assert.equal(w.statusKey('invuln'),'common_invincible_01');assert.equal(w.statusKey('note'),null);
 v.flags=0;w.syncStatuses(v);assert.ok(spawned.every(h=>!h.alive));
 v.flags=UF.SHIELD;w.syncStatuses(v);assert.equal(spawned.length,3);assert.equal(spawned[2].alive,true);
 w.release(v);assert.equal(spawned[2].alive,false);assert.equal(w.statusSeen.size,0);
});

test('보호막 shows only a unit\'s own effect; 쉴드 its own, else the generic loop; both may hold at once',()=>{
 const own=['common_shield_01','humus_buff_03','judge_shield_all_01'];
 const ofx={active:true,lib:{has:key=>own.includes(key)}};
 const w=new FxWiring(ofx);w.idx={generic:{status:{shield:'common_shield_01'}}};
 const spawned=[];w.skills.status=()=>{};w.playOn=key=>{const h={key,alive:true,stop(){this.alive=false;}};spawned.push(h);return h;};
 w.unitKeyOf=v=>v.key;w.unitOf=()=>null;
 const live=()=>spawned.filter(h=>h.alive).map(h=>h.key).sort();
 // a plain unit: its 보호막 shows nothing, its 쉴드 the generic loop
 const plain={id:1,key:'char_002_amiya',alive:true,flags:UF.SHIELD,barrier:true,shieldHp:300,layers:0,statuses:new Set()};
 w.syncStatuses(plain);assert.deepEqual(live(),[]);
 plain.barrier=false;plain.shieldHp=0;w.syncStatuses(plain);assert.deepEqual(live(),['common_shield_01']);
 plain.barrier=true;plain.shieldHp=100;plain.layers=1;w.syncStatuses(plain);assert.deepEqual(live(),['common_shield_01'],'both: the 쉴드 only');
 w.release(plain);
 // 休谟斯's 보호막: her own effect, no generic one
 const humus={id:2,key:'char_491_humus',alive:true,flags:UF.SHIELD,barrier:true,shieldHp:200,layers:0,statuses:new Set()};
 w.syncStatuses(humus);assert.deepEqual(live(),['humus_buff_03']);
 humus.flags=0;humus.barrier=false;humus.shieldHp=0;w.syncStatuses(humus);assert.deepEqual(live(),[]);
 // 斥罪: the skin variant is absent here → the base prefab
 const judge={id:3,key:'char_4065_judge',alive:true,flags:UF.SHIELD,barrier:true,shieldHp:500,layers:0,statuses:new Set()};
 w.syncStatuses(judge);assert.deepEqual(live(),['judge_shield_all_01']);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
import {showDamageNumber} from '../../shared/damageDisplay.js';
import {fallbackFloat} from '../../public/js/ui/fallbackField.js';

test('hits blocked by invulnerability are marked before and after hit hooks, without changing HP',()=>{
 for(const inHook of [false,true]) {
  const h=makeBattle({defs:{enemies:{dummy:enemyRec({key:'dummy',hp:10000,atk:0,speed:0})}},enemies:[{key:'dummy',pos:[10,5]}],autoFinish:false,content:'none'});
  h.step();const t=h.enemy(),hp=t.hp;
  const protect=()=>h.b.addBuff(t,{key:'test-invuln',duration:5,flags:{invulnerable:true}});
  if(inHook)h.b.on('hit',protect);else protect();
  const n=h.eventsOf('dmg').length;
  assert.equal(h.b.dealDamage(null,t,{amount:500,type:'true'}),0);assert.equal(t.hp,hp);
  const event=h.eventsOf('dmg').slice(n).find(e=>e[1]===t.id);assert.ok(event);
  assert.equal(event[4].blocked,'invulnerable');
  for(const damageNumberMode of ['sum','all','basic','none'])for(const officialDamageNumbers of [false,true]) {
   const settings={damageNumbers:true,damageNumberMode,officialDamageNumbers};
   assert.equal(showDamageNumber(settings,event[4]),false);
   assert.equal(fallbackFloat(event,settings),null);
  }
 }
});

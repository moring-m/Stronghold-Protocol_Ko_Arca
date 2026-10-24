import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FxWiring} from '../../public/js/render/vfx/wiring.js';

test('full effects keep known operators official and leave missing operators for simple rendering',()=>{
 const ofx={active:true,lib:{has:()=>true}},w=new FxWiring(ofx);
 w.idx={units:{char_known:{kind:'char',modes:[],skills:{}}},skins:{},generic:{}};
 const known={id:1,info:{id:1,spine:'char_known'}},missing={id:2,info:{id:2,spine:'char_499_kaitou'}};
 assert.equal(w.hasOfficialUnit(known),true);assert.equal(w.hasOfficialUnit(missing),false);
 const synced=[];w.syncStatuses=v=>synced.push(v.id);
 for(const part of [w.skills,w.talents,w.funnels])part.sync=()=>{};
 w.sync([known,missing]);assert.deepEqual(synced,[1],'unknown units do not receive official status loops');
 assert.equal(w.deploy(missing),false);assert.equal(w.death(missing),false);
 assert.equal(w.damage(known,'arts',missing,0),false,'unknown caster keeps its simple hit effect');
});

test('official status events and snapshot flags suppress invulnerability for summons only',async()=>{
 const {UF}=await import('../../shared/constants.js');
 const w=new FxWiring({active:true,lib:{has:()=>true}});w.idx={generic:{status:{invulnerable:'invuln_fx'}}};w.hasOfficialUnit=()=>true;
 const v={id:1,isToken:true,alive:true,flags:UF.INVULN,statuses:new Set(['invuln']),info:{kind:'token'}};
 assert.equal(w.status(v,'invuln',true),false);w.syncStatuses(v);assert.equal(w.statusSeen.size,0);assert.equal(w.loops.size,0);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {setRecruitSelection} from '../../public/js/ui/loadoutModel.js';
import {checkLoadout} from '../../shared/protocol.js';
import {makeBattle,enemyRec} from '../helpers/battleHarness.js';
import {storedEnergy,unitInfo} from '../../server/sim/snapshot.js';
import {effectiveProfile} from '../../server/sim/ai.js';
import {projectileStyle} from '../../public/js/render/projectileStyle.js';
const C=JSON.parse(readFileSync(new URL('../../content/production/data/chess.json',import.meta.url)));
const lookup=id=>C[id];
test('every visible recruit can toggle its active tier off or clear both tiers',()=>{
 let count=0;
 for(const c of Object.values(C).filter(c=>c.optionalRecruit&&c.visible&&!c.isGolden)){
  let entries=setRecruitSelection({},c,c.tier,lookup);assert.equal(entries[c.chessId]?.selected,true,c.chessId);
  const before=structuredClone(entries);entries=setRecruitSelection(entries,c,c.tier,lookup);
  assert.ok(!Object.values(entries).some(e=>e.selected),c.chessId);assert.deepEqual(before,{[c.chessId]:{selected:true}},'input is unchanged');
  entries=setRecruitSelection(before,c,0,lookup);assert.ok(!Object.values(entries).some(e=>e.selected));assert.ok(checkLoadout(entries,lookup).ok);count++;
 }
 assert.ok(count>100);
});
test('tier toggling preserves skin and skill settings; prototype tiers remain independent',()=>{
 const c=Object.values(C).find(c=>c.optionalRecruit&&c.visible&&!c.isGolden&&!c.recruitPrototype&&c.skins?.length&&c.skills.length>1&&c.tier===5);
 const config={selected:true,skin:c.skins[0].id,skill:c.skills.find(s=>!s.isDefault).index};const out=setRecruitSelection({[c.chessId]:config},c,5,lookup);
 assert.equal(out[c.chessId].skin,config.skin);assert.equal(out[c.chessId].skill,config.skill);assert.ok(!out[c.chessId].selected);
 const p=Object.values(C).find(c=>c.optionalRecruit&&c.visible&&c.recruitPrototype&&c.tier===5&&!c.isGolden&&C[c.chessId.replace('_5_a','_6_a')]?.visible);
 let e=setRecruitSelection({},p,5,lookup);e=setRecruitSelection(e,p,6,lookup);assert.equal(Object.keys(e).length,2);
 e=setRecruitSelection(e,p,5,lookup);assert.equal(Object.values(e).filter(e=>e.selected).length,1);assert.equal(e[p.chessId.replace('_5_a','_6_a')].selected,true);
 assert.ok(!Object.values(setRecruitSelection(e,p,0,lookup)).some(e=>e.selected));
});
test('all mystic identities expose their actual stores, including Ebenholz and Veen conversions',()=>{
 const records=[...new Map(Object.values(C).filter(c=>c.subProfessionId==='mystic'&&c.visible&&!c.isGolden).map(c=>[c.charId,c])).values()];assert.deepEqual(new Set(records.map(c=>c.charId)),new Set(['char_469_indigo','char_4046_ebnhlz','char_4226_veen']));
 for(const rec of records){const h=makeBattle({defs:{chess:{[rec.chessId]:rec}},units:[{chessId:rec.chessId,row:10,col:5}],autoFinish:false,timeLimit:100});h.run(1.2);const u=h.unit(rec.chessId);
  for(let i=0;i<3;i++)u.profile.storeEnergy(h.b,u);
  assert.ok(storedEnergy(u)>=3,rec.name);assert.equal(unitInfo(u).energy,storedEnergy(u));assert.ok(unitInfo(u).energyMax>=storedEnergy(u));assert.equal(h.b.snapshot().energy[u.id],storedEnergy(u));
  h.b.retreat(u);assert.ok(h.b.redeploy(u,{free:true}));assert.equal(storedEnergy(u),0,rec.name+' redeploy');assert.equal(h.b.errorCount,0);
 }
});
test('each recruit ranged profile has a renderable attack visual before and during its skills',()=>{
 let checked=0;
 for(const c of Object.values(C).filter(c=>c.optionalRecruit&&c.visible))for(const s of c.skills||[]){
  if(c.recruitPrototype&&!s.isDefault)continue;
  const h=makeBattle({defs:{chess:{[c.chessId]:c},enemies:{d:enemyRec({key:'d',hp:1e8,speed:0,atk:0})}},units:[{chessId:c.chessId,row:10,col:5,skillIndex:s.index}],enemies:[{key:'d',pos:[10,6]}],autoFinish:false,timeLimit:20});h.run(1.2);const u=h.unit(c.chessId);
  for(const active of [false,true]){if(active){u.skill.gainSp(1000,'test');u.skill.activate('test');}const p=effectiveProfile(u);if(p.attack!=='ranged'||p.noAttack)continue;
   const kind=p.projectile;if(['beam','chain','chainHeal','none'].includes(kind))continue;
   assert.ok(projectileStyle(kind,{charId:c.charId}),`${c.name} S${s.index+1} ${active?'active':'normal'}: ${kind}`);checked++;
  }
  assert.equal(h.b.errorCount,0,c.name);
 }
 assert.ok(checked>100);
});
test('Revenant shadow arts visual has a projectile without changing simulation speed',()=>{
 assert.ok(projectileStyle('arts',{attackType:'arts'}));assert.equal(projectileStyle('arts',{}).speed,projectileStyle('bolt',{}).speed);
});

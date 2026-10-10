import {test} from 'node:test';
import {NORMAL_ATTACK_BUFF_SKILLS} from '../shared/attackTiming.js';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
const root=new URL('../content/production/',import.meta.url).pathname;
const read=p=>JSON.parse(readFileSync(join(root,p),'utf8'));
test('prepared production catalogue includes every referenced asset and current local defaults',{skip:!existsSync(join(root,'resources.json'))},()=>{
 const assets=read('data/assets.json'),chess=read('data/chess.json'),bands=read('data/bands.json'),index=read('resources.json');
 const files=new Map(index.files.map(f=>[f.path,f]));assert.equal(files.size,index.files.length);
 const walk=v=>{if(typeof v==='string'&&v.startsWith('/assets/'))assert.ok(files.has(v),`not cached: ${v}`);else if(v&&typeof v==='object')Object.values(v).forEach(walk)};
 walk(assets);walk(read('data/local-assets.json'));
 for(const f of index.files.filter(f=>f.local)){
  assert.deepEqual(f.sources,[f.path]);assert.ok(existsSync(join(root,'assets',f.path.slice('/assets/'.length))),f.path);
 }
 assert.match(bands.band_custom_ursus_kaschey.desc,/^\[영광과 번영\]<우르수스>/);
 assert.equal(bands.band_custom_ursus_kaschey.totalHp,22);
 assert.match(bands.band_custom_ursus_kaschey.desc,/라운드당 최대 1회/);
 for(const [key,skill] of Object.entries({brownb:1,turdus:0,botany:0,glassb:1,leto:1,poca:1,helage:1,headb2:2}))for(const suffix of ['a','b'])assert.equal(chess[`chess_custom_ursus_${key}_${suffix}`].skill.index,skill);
 assert.ok(Object.keys(assets.audio.voice.kr).length>100);assert.ok(Object.keys(assets.audio.voice.jp).length>100);
});

test('production Ursus balance matches the release and custom operator definitions',()=>{
 const bonds=read('data/bonds.json'),chess=read('data/chess.json'),garrisons=read('data/garrisons.json');
 assert.equal(bonds.ursusShip.bb.base_bonus,.2);
 assert.equal(bonds.ursusShip.bb.atk_per_stack,.01);
 assert.equal(bonds.ursusShip.bb.hp_per_stack,.005);
 assert.equal(bonds.ursusShip.bb.donation_ratio,.1);
 assert.equal(bonds.ursusShip.bb.donation_per_stack,.00015);
 const definitions=JSON.parse(readFileSync(new URL('../content/custom/ursus/operators.json',import.meta.url)));
 for(const op of definitions)for(const suffix of ['a','b']){
  const rec=chess[`chess_custom_ursus_${op.key}_${suffix}`];
  assert.equal(rec.tier,op.tier,op.name);
  assert.equal(rec.skill.index,op.skillIndex,op.name);
 }
 assert.match(JSON.stringify(garrisons),/공격 속도/);
});

test('production attack timings agree with ordinary-attack buff roles',()=>{
 const chess=read('data/chess.json');
 for(const c of Object.values(chess)){
  const indices=NORMAL_ATTACK_BUFF_SKILLS.find(([id])=>c.charId===id)?.[1];
  if(!indices)continue;
  for(const face of ['front','back'])for(const index of indices){
   const timing=c.attackTiming?.[face];if(!timing)continue;
   assert.equal(timing.skills[index],undefined,`${c.chessId}/${face}/S${index+1}`);
   assert.ok(timing.attack.hit>=0&&timing.attack.dur>0);
  }
 }
});

test('Beehunter replaces Absinthe with complete resources and two independent trait effects',()=>{
 const chess=read('data/chess.json'),g=read('data/garrisons.json'),assets=read('data/assets.json');
 assert.ok(!Object.values(chess).some(c=>c.charId==='char_405_absin'));
 for(const suffix of ['a','b']){
  const c=chess[`chess_custom_ursus_brownb_${suffix}`];
  assert.deepEqual(c.bonds,['ursusShip','raidShip']);assert.equal(c.skill.index,1);
  if(suffix==='b')assert.ok(c.modules.some(m=>m.uniEquipId==='uniequip_002_brownb'));assert.ok(c.skins.length>0);
  assert.equal(c.garrisonIds.length,2);
  assert.match(g[c.garrisonIds[0]].description ?? JSON.stringify(g[c.garrisonIds[0]]),/맹약 활성화 불필요/);
  assert.match(JSON.stringify(g[c.garrisonIds[1]]),/act1autochess_gar_eff_chaos/);
  assert.ok(chess[`chess_custom_ursus_helage_${suffix}`].bonds.includes('indomShip'));
 }
 for(const lang of ['kr','jp'])assert.ok(assets.audio.voice[lang].char_137_brownb.place.length);
});

test('original five recruits retain every available named costume in every tier and promotion',()=>{
 const chess=read('data/chess.json'),assets=read('data/assets.json'),files=new Set(read('resources.json').files.map(f=>f.path));
 for(const [charId,count] of [['char_4182_oblvns',1],['char_1050_chen3',0],['char_1035_wisdel',2],['char_4138_narant',2],['char_4132_ascln',1]]){
  const forms=Object.values(chess).filter(c=>c.optionalRecruit&&c.charId===charId);assert.ok(forms.length>=2,charId);
  for(const c of forms){assert.equal(c.skins?.length??0,count,c.chessId);for(const skin of c.skins){assert.ok(!/[\u3400-\u9fff]/u.test(skin.name),skin.name);const a=assets.chars[skin.assets.spine];assert.ok(a);for(const path of [a.avatar,a.portrait,a.spine.front.skel,a.spine.front.atlas,...a.spine.front.textures])assert.ok(files.has(path),path);assert.ok(skin.attackTiming.front.attack.hit>=0);}}
 }
 for(const suffix of ['a','b'])assert.equal(read('data/items.json')['chess_item_custom_ursus_favor_'+suffix].price,4);
});

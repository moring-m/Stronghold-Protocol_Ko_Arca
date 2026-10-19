import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createAugmentCatalog,augmentView,recordAugments} from '../../shared/augments.js';
import {AUGMENT_ICON_ASSIGNMENTS} from '../../shared/augmentIcons.js';
const read=p=>JSON.parse(readFileSync(p));
const game=Object.fromEntries(['bonds','chess','items'].map(k=>[k,read('content/production/data/'+k+'.json')]));
const catalog=[...new Map([4,7,10].flatMap(r=>createAugmentCatalog(game,r)).map(a=>[a.id,a])).values()];
const assignments=read('content/custom/augments/icon-assignments.json');
const manifest=read('content/custom/augments/icons.json');

test('every curated family resolves for its actual names and every grade, without changing bond artwork',()=>{
 const byPath=new Map(manifest.map(i=>[i.path,i]));
 for(const entry of assignments){
  const rows=catalog.filter(a=>a.side===entry.side&&a.name.replace(/ (?:I|II|III)$/,'')===entry.name);
  assert.ok(rows.length,entry.name+' must exist in the game');
  assert.ok(rows.every(a=>!a.iconBond),entry.name+' must not override a named bond');
  assert.equal('/assets/custom/augments/'+AUGMENT_ICON_ASSIGNMENTS[entry.side][entry.name]+'.png',entry.path);
  for(const a of rows)assert.equal(augmentView(a).icon,entry.path,a.name);
  assert.ok(byPath.has(entry.path),entry.name);
 }
 for(const a of catalog.filter(a=>a.iconBond)){
  assert.ok(game.bonds[a.iconBond]);
  assert.equal(augmentView(a).iconBond,a.iconBond);
 }
 assert.equal(new Set(assignments.map(a=>a.path)).size,assignments.length,'different reviewed families have distinct artwork');
});

test('nonbond item rewards, recruitment, growth and healing no longer share their generic fallback',()=>{
 const families=['이샤믈라의 축복','뮤엘시스의 지원','박사의 머리','대발견','부재중 전화','캐서린의 지원','신병','인력사무소','페가수스'];
 const icons=families.map(name=>augmentView(catalog.find(a=>a.name.replace(/ (?:I|II|III)$/,'')===name)).icon);
 assert.equal(new Set(icons).size,families.length);
 for(const [first,second]of [['도박','알뜰살뜰'],['레벨 업','새로고침 지원'],['스타터 팩','헤드헌팅'],['소드마스터','강타'],['중첩','우리들의 빛']]){
  const icon=n=>augmentView(catalog.find(a=>a.name.replace(/ (?:I|II|III)$/,'')===n)).icon;
  assert.notEqual(icon(first),icon(second),first+' / '+second);
 }
 const heal=catalog.find(a=>a.effect.kind==='attackHeal'),regen=catalog.find(a=>a.effect.kind==='regen'),drain=catalog.find(a=>a.effect.kind==='alliedDrain');
 assert.equal(new Set([heal,regen,drain].map(a=>augmentView(a).icon)).size,3,'attack healing, enemy regeneration and allied HP drain are distinct');
});

test('prepared image and browser resource entries match pinned source checksums, including historical paths',()=>{
 const index=new Map(read('content/production/resources.json').files.map(f=>[f.path,f]));
 for(const entry of manifest){
  const body=readFileSync('content/production'+entry.path);
  assert.equal(createHash('sha1').update('blob '+body.length+'\0').update(body).digest('hex'),entry.gitBlob,entry.path);
  assert.equal(createHash('sha256').update(body).digest('hex'),entry.sha256,entry.path);
  assert.equal(index.get(entry.path)?.sha256,entry.sha256);
  assert.equal(index.get(entry.path)?.bytes,body.length);
  assert.equal(index.get(entry.path)?.local,true);
 }
 for(const path of ['/assets/custom/augments/g_char_atk_p1.png','/assets/custom/augments/g_extra_cost_1.png'])assert.ok(index.has(path),'keep historical record icons');
});

test('old and new match histories keep the exact selected icon and remain replayable',()=>{
 const current=augmentView(catalog.find(a=>a.name==='소드마스터 III'));
 for(const icon of ['/assets/custom/augments/g_char_atk_p1.png',current.icon]){
  const record=recordAugments({history:['prism'],picks:[{round:10,side:'ally',playerId:'p',augment:{...current,icon}}]});
  assert.equal(record.picks[0].augment.icon,icon);
  assert.equal(record.picks[0].augment.name,current.name);
 }
});


test('active augment artwork never uses equipment inventory pictures',()=>{
 const sources=new Map(manifest.map(i=>[i.path,i]));
 for(const a of catalog.filter(a=>!a.iconBond)){
  const entry=sources.get(augmentView(a).icon);
  assert.ok(entry,a.name);
  assert.ok(!entry.source.includes('shopitemicon'),a.name+' must use a symbol, not an equipment picture');
  assert.ok(!augmentView(a).icon.includes('/auto_'),a.name);
 }
});

import {existsSync} from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {costumeFor,costumeEffect,costumeProjectile,costumePreloadKeys} from '../public/js/render/vfx/costumes.js';
import {applyOrigin} from '../tools/resource-origin.mjs';
test('costume graphics preserve base projectile and use only available replacements',()=>{
 const original={main:'base',speed:4}, graphic={main:'base',speed:8,effects:['base']};
 const c={charId:'a',effects:{base:'skin',missing:'absent'},projectiles:{shot:{graphic:'graphic',mount:5}}};
 const idx={costumes:{outfit:c},prefabs:{skin:{}},projectiles:{graphic}};
 assert.equal(costumeFor(idx,{info:{skin:'outfit'}},'b'),null);
 assert.equal(costumeFor(idx,{info:{skin:'outfit'}},'a'),c);
 assert.equal(costumeFor(idx,{info:{skinId:'outfit'}},'a'),c);
 assert.equal(costumeFor(idx,{info:{spine:'outfit'}},'a'),c);
 assert.equal(costumeEffect(idx,c,'missing'),'missing');
 assert.deepEqual(costumeProjectile(idx,c,original,'shot'),{main:'skin',speed:8,effects:['skin'],costumeMount:5});
 assert.deepEqual(original,{main:'base',speed:4});assert.equal(graphic.main,'base');
 assert.deepEqual(costumePreloadKeys(idx,c),['skin']);
});
test('origin configuration preserves game paths and existing mirrors',()=>{
 const catalog={files:[{path:'/assets/a#b.json',local:true,sources:['/assets/a#b.json']},{path:'/assets/original',sources:['https://upstream.example/a']}]};
 assert.equal(applyOrigin(catalog,{baseUrls:[]}),catalog);
 const out=applyOrigin(catalog,{baseUrls:['https://raw.githubusercontent.com/owner/repo/COMMIT/public']});
 assert.equal(out.files[0].path,catalog.files[0].path);
 assert.equal(out.files[0].sources[0],'https://raw.githubusercontent.com/owner/repo/COMMIT/public/assets/a%23b.json');
 assert.deepEqual(out.files[1],catalog.files[1]);assert.equal(catalog.files[0].sources[0],'/assets/a#b.json');
 assert.throws(()=>applyOrigin(catalog,{baseUrls:['http://example.com']}));
});
test('a costume graphic keeps projectile impact hooks and permits explicit costume overrides',()=>{
 const base={main:'trail',onHit:['hit'],onReached:['explosion'],effects:['trail','hit','explosion']};
 const c={effects:{hit:'skin-hit',explosion:'skin-explosion'},projectiles:{shot:{graphic:'g'}}};
 const idx={prefabs:{'skin-hit':{},'skin-explosion':{}},projectiles:{g:{main:'skin-trail',effects:['skin-trail']}}};
 const out=costumeProjectile(idx,c,base,'shot');
 assert.equal(out.main,'skin-trail');assert.deepEqual(out.onHit,['skin-hit']);assert.deepEqual(out.onReached,['skin-explosion']);
 idx.projectiles.g.onReached=['explicit'];assert.deepEqual(costumeProjectile(idx,c,base,'shot').onReached,['explicit']);
 assert.deepEqual(base.onReached,['explosion']);
});
test('the recovered Horn skin retains its actual official attack explosion',{skip:!existsSync('public/assets/local/fx/index.json')},async()=>{
 const {readFile}=await import('node:fs/promises');
 const idx=JSON.parse(await readFile('public/assets/local/fx/index.json'));
 const costume=idx.costumes.skin_char_4039_horn_epoque_24,base=idx.projectiles.projectile_chr_horn;
 const projectile=costumeProjectile(idx,costume,base,'projectile_chr_horn');
 assert.ok(projectile.onReached.length>0);
 for(const key of projectile.onReached){assert.ok(idx.prefabs[key]);assert.equal(key,costume.effects.horn_attack_01_hit_02);}
 assert.equal(projectile.main,costume.effects.horn_attack_01_trail_02);
});

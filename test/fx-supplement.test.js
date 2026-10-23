import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {mergeMissingFx,installSupplement} from '../tools/fx-supplement.mjs';
test('FX supplement preserves all existing keys and adds only absent records',()=>{
 const base={version:3,generic:{hit:'original'},units:{kept:{x:1}},skills:{s:{x:1}},prefabs:{old:{file:'old.json'}}};
 const before=structuredClone(base),extra={generic:{hit:'changed'},units:{kept:{x:2},added:{x:3}},skills:{s:{x:2},newSkill:{x:3}},prefabs:{old:{file:'changed'},new:{file:'new.json'}}};
 const merged=mergeMissingFx(base,extra);
 assert.deepEqual(base,before);assert.equal(merged.units.kept,base.units.kept);assert.equal(merged.skills.s,base.skills.s);assert.equal(merged.prefabs.old,base.prefabs.old);assert.equal(merged.generic,base.generic);assert.deepEqual(merged.units.added,{x:3});assert.equal(merged.prefabs.new.file,'new.json');
});
test('installation is idempotent, registers downloads and refuses to overwrite different existing bytes',async t=>{
 const root=await mkdtemp(join(tmpdir(),'fx-supplement-'));t.after(()=>rm(root,{recursive:true,force:true}));
 const fx=join(root,'public/assets/local/fx'),pack=join(root,'pack');for(const p of [fx,join(root,'data'),join(root,'public/vendor'),join(pack,'files/prefabs')])await mkdir(p,{recursive:true});
 const json=async(p,v)=>writeFile(p,JSON.stringify(v));
 const original={version:3,units:{old:{name:'keep'}},prefabs:{old:{file:'prefabs/old.json'}}};
 await json(join(fx,'index.json'),original);await json(join(fx,'textures.json'),{textures:{old:{file:'old.webp'}}});
 await json(join(root,'data/local-fx.json'),{groups:{fx:{index:{path:'/assets/local/fx/index.json'},textures:{path:'/assets/local/fx/textures.json'}},'fx/prefabs':{old:{path:'/assets/local/fx/prefabs/old.json'}},'fx/tex':{},'fx/mesh':{}}});
 await json(join(root,'public/vendor/browser-resources.json'),{files:[]});
 const body='{"key":"new"}',path='/assets/local/fx/prefabs/new.json';await writeFile(join(pack,'files/prefabs/new.json'),body);
 await json(join(pack,'supplement.json'),{units:{new:{refs:['new']}},prefabs:{new:{file:'prefabs/new.json'}},textures:{},groups:{'fx/prefabs':{new:{path}}},files:[{path,bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')}]});
 await installSupplement(root,pack);const index=JSON.parse(await readFile(join(fx,'index.json')));assert.deepEqual(index.units.old,original.units.old);assert.ok(index.units.new);
 const first=await readFile(join(root,'public/vendor/browser-resources.json'),'utf8');assert.ok(JSON.parse(first).files.some(f=>f.path===path));
 await installSupplement(root,pack);assert.equal(await readFile(join(root,'public/vendor/browser-resources.json'),'utf8'),first);
 await writeFile(join(fx,'prefabs/new.json'),'existing different bytes');await assert.rejects(installSupplement(root,pack),/Refusing to replace existing/);assert.equal(await readFile(join(fx,'prefabs/new.json'),'utf8'),'existing different bytes');
});

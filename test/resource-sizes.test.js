import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
test('production download estimate covers all measured resources, including additional voices and skins',()=>{
 const read=p=>JSON.parse(readFileSync(new URL('../content/production/'+p,import.meta.url)));
 const index=read('resources.json'),measured=read('resource-sizes.json');
 assert.equal(index.estimatedBytes,index.files.reduce((n,f)=>n+f.bytes,0));
 assert.ok(index.estimatedBytes>1_000_000_000,'the old baseline alone incorrectly estimated 383MB');
 assert.ok(index.estimatedStorageBytes>=index.estimatedBytes*2,'account for browser cache overhead');
 for(const f of index.files.filter(f=>!f.local)){
  const rec=measured.files[f.path];assert.equal(f.bytes,rec.bytes,f.path);
  assert.equal(createHash('sha256').update(JSON.stringify(f.sources)).digest('hex').slice(0,20),rec.sourcesHash,f.path);
 }
});

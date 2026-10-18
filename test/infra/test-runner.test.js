import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,copyFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

test('test launcher discovers only suites, forwards options and preserves failures',()=>{
 const root=mkdtempSync(join(tmpdir(),'stronghold runner '));
 try{
  for(const dir of ['tools','test/nested','scripts'])mkdirSync(join(root,dir),{recursive:true});
  copyFileSync(new URL('../../tools/run-tests.mjs',import.meta.url),join(root,'tools/run-tests.mjs'));
  writeFileSync(join(root,'package.json'),'{"type":"module"}');
  writeFileSync(join(root,'test/top.test.js'),"import {test} from 'node:test';test('top suite',()=>{console.log('TOP_EXECUTED')});");
  writeFileSync(join(root,'test/nested/child.test.js'),"import {test} from 'node:test';test('nested suite',()=>{});");
  for(const file of ['test/helper.js','scripts/unrelated.test.js'])writeFileSync(join(root,file),"throw new Error('outside suite discovery');");
  const env={...process.env};delete env.NODE_TEST_CONTEXT;
  const run=(...args)=>spawnSync(process.execPath,[join(root,'tools/run-tests.mjs'),...args],{encoding:'utf8',timeout:15000,env});
  const success=run();assert.equal(success.status,0,success.stdout+success.stderr);assert.match(success.stdout,/pass\s+2/);
  writeFileSync(join(root,'test/nested/child.test.js'),"import {test} from 'node:test';test('nested suite',()=>{throw new Error('intentional fixture failure')});");
  const failure=run();assert.equal(failure.status,1,failure.stdout+failure.stderr);assert.match(failure.stdout,/intentional fixture failure/);
  const filtered=run('--test-name-pattern=^top suite$');assert.equal(filtered.status,0,filtered.stdout+filtered.stderr);assert.match(filtered.stdout,/TOP_EXECUTED/);assert.doesNotMatch(filtered.stdout,/intentional fixture failure/);
 }finally{rmSync(root,{recursive:true,force:true});}
});

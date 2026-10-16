import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
test('cancelled HTTP responses cannot crash the router when binary headers arrive later',async()=>{
 const {stdout,stderr}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./fixtures/http-reset.mjs',import.meta.url))],{timeout:10000});
 assert.match(stdout,/Gateway survived cancelled HTTP requests/);assert.equal(stderr,'');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
test('client TCP reset during a pending WebSocket upgrade does not crash the router',async()=>{
 const {stdout,stderr}=await promisify(execFile)(process.execPath,[fileURLToPath(new URL('./fixtures/ws-reset.mjs',import.meta.url))],{timeout:10000});
 assert.match(stdout,/Gateway survived client reset/);
 assert.equal(stderr,'');
});

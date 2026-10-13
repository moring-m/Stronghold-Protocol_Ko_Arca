import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {parseNativePack,fetchNativePack} from '../../public/js/render/board3d/nativePack.js';
test('native pack retains exact field geometry and artist metadata',(t)=>{
 if(!existsSync('content/production/data/local-assets.json'))return t.skip('optional native assets are not installed');
 const manifest=JSON.parse(readFileSync('content/production/data/local-assets.json'));
 for(const entry of Object.values(manifest.groups['map/original'])){
  if(!entry.binaryPath)continue;
  if(!existsSync('public'+entry.binaryPath))return t.skip('optional native assets are not installed');
  const old=JSON.parse(gunzipSync(readFileSync('public'+entry.path)));
  const bytes=gunzipSync(readFileSync('public'+entry.binaryPath));
  const next=parseNativePack(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
  for(const bucket of Object.values(next.buckets))for(const key of ['position','normal','uv','uv1','color','index'])if(bucket[key])bucket[key]=Array.from(bucket[key]);
  assert.deepEqual(next,old);
 }
});
test('bad or missing optional binary maps fall back instead of breaking rendering',async()=>{
 assert.throws(()=>parseNativePack(new ArrayBuffer(3)));
 const original=globalThis.fetch;try{globalThis.fetch=async()=>new Response('broken');assert.equal(await fetchNativePack('/bad.bin'),null);}finally{globalThis.fetch=original;}
});

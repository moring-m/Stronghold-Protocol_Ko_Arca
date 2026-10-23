import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {LANGUAGE_PACKS} from '../../shared/languagePacks.js';import {downloadLanguagePack} from '../../public/js/i18n/languagePack.js';
test('language download hashes match every shipped translation file',async()=>{for(const f of new Map(Object.values(LANGUAGE_PACKS).flat().map(f=>[f.path,f])).values()){const b=await readFile('public'+f.path);assert.equal(createHash('sha256').update(b).digest('hex'),f.hash,f.path);assert.equal(b.length,f.bytes,f.path);}});
test('language pack retries transient HTTP errors and resumes from verified cached files',async t=>{
 const originalFetch=globalThis.fetch,originalCaches=globalThis.caches,stored=new Map(),calls=[];let failed=false;
 globalThis.caches={open:async()=>({match:async k=>stored.get(k)?.clone(),put:async(k,r)=>stored.set(k,r)})};
 globalThis.fetch=async url=>{calls.push(url);if(!failed){failed=true;return new Response('',{status:503});}return new Response(await readFile('public'+new URL(url,'http://localhost').pathname));};
 t.after(()=>{globalThis.fetch=originalFetch;if(originalCaches===undefined)delete globalThis.caches;else globalThis.caches=originalCaches;});
 await downloadLanguagePack('en');assert.equal(stored.size,LANGUAGE_PACKS.en.length);assert.equal(calls.length,LANGUAGE_PACKS.en.length+1);assert.ok(calls.every(p=>p.includes('languageHash=')));const n=calls.length;await downloadLanguagePack('en');assert.equal(calls.length,n);
});
test('an interrupted response body retries the file without caching partial JSON',async t=>{
 const originalFetch=globalThis.fetch,originalCaches=globalThis.caches,stored=new Map();let calls=0;
 globalThis.caches={open:async()=>({match:async k=>stored.get(k)?.clone(),put:async(k,r)=>stored.set(k,r)})};
 globalThis.fetch=async url=>{calls++;if(calls===1)return new Response(new ReadableStream({start(c){c.enqueue(new Uint8Array([123]));c.error(new Error('connection closed'));}}));return new Response(await readFile('public'+new URL(url,'http://localhost').pathname));};
 t.after(()=>{globalThis.fetch=originalFetch;if(originalCaches===undefined)delete globalThis.caches;else globalThis.caches=originalCaches;});
 await downloadLanguagePack('en');assert.equal(calls,LANGUAGE_PACKS.en.length+1);assert.equal(stored.size,LANGUAGE_PACKS.en.length);
});

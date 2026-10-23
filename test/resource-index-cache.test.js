import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {normalizeResourceSelection,selectedResources} from '../shared/resourceSelection.js';
test('updated FX metadata replaces old cache while unchanged payloads remain reusable',async()=>{
 const source=(await readFile(new URL('../public/resource-worker.js',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
 const rows=new Map(),puts=[];const cache={match:async key=>rows.get(key)?.clone(),put:async(key,value)=>{rows.set(key,value);puts.push(key);}};
 let requests=0;
 const context=vm.createContext({normalizeResourceSelection,selectedResources,URL,Response,Request,AbortSignal,TextDecoder,TextEncoder,Uint8Array,DataView,setTimeout,clearTimeout,console,
 self:{location:{origin:'https://game.example'},addEventListener:()=>{}},caches:{match:cache.match},fetch:async()=>{requests++;return new Response('{"costumes":{}}');}});
 vm.runInContext(source,context);context.cache=cache;
 const path='/assets/local/fx/index.json';rows.set(path,new Response('{"old":true}'));
 context.file={path,sha256:'new-index-hash',sources:['https://raw.githubusercontent.com/o/r/sha/index.json']};
 await vm.runInContext('downloadOne(file,cache,{version:"v2"})',context);
 assert.equal(requests,1);assert.equal(rows.get(path).headers.get('X-SP-Resource-Hash'),'new-index-hash');
 await vm.runInContext('downloadOne(file,cache,{version:"v2"})',context);assert.equal(requests,1);
 const payload='/assets/local/fx/tex/unchanged.webp';rows.set(payload,new Response('old payload'));
 context.file={path:payload,sha256:'irrelevant',sources:['https://raw.githubusercontent.com/o/r/sha/payload']};
 await vm.runInContext('downloadOne(file,cache,{version:"v2"})',context);assert.equal(requests,1);assert.deepEqual(puts,[path]);
});

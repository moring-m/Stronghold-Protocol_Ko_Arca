import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {normalizeResourceSelection,selectedResources} from '../../shared/resourceSelection.js';
for(const preview of [false,true])for(const voice of ['kr','jp'])for(const effects of ['simple','official'])for(const scope of [null,'officialFx','voice-kr','voice-jp'])test(`${preview?'preview':'production'} downloads exactly ${voice}/${effects}/${scope||'full'}`,async()=>{
 const handlers={},saved=new Map(),asked=[],selection={voice,effects,...(scope?{scope}:{})};
 const files=['/assets/model.bin','/assets/audio/voice/kr/a.mp3','/assets/audio/voice/jp/a.mp3','/assets/local/fx/index.json'].map(path=>({path,bytes:4,local:true,sources:[path]}));
 const index={version:'choices',files,fontCss:'fonts'};
 const cache={match:async k=>saved.get(k)?.clone(),put:async(k,r)=>saved.set(k,r.clone()),delete:async k=>saved.delete(k)};
 const name=preview?'dev/ursus-resource-worker.js':'resource-worker.js';
 runInNewContext(readFileSync(new URL('../../public/'+name,import.meta.url),'utf8').replace(/^import[^\n]+\n/gm,''),{
  normalizeResourceSelection,selectedResources,URL,Response,TextDecoder,DataView,AbortSignal,performance,setTimeout,clearTimeout,setInterval,clearInterval,
  caches:{open:async()=>cache,match:cache.match,keys:async()=>[]},
  self:{location:{origin:'https://selection.test'},clients:{matchAll:async()=>[{postMessage:()=>{}}]},addEventListener:(type,fn)=>handlers[type]=fn},
  fetch:async path=>{if(path==='/vendor/browser-resources.json')return Response.json(index);asked.push(path);return new Response('data');},normalizeAtlas:()=>{throw Error('unexpected atlas');}
 });
 let work,reply;handlers.message({data:{type:preview?'warmPatch':'preparePatch',selection},ports:[{postMessage:m=>reply=m}],waitUntil:p=>work=p});await work;
 if(scope==='officialFx')assert.deepEqual(asked,['/assets/local/fx/index.json']);
 if(scope?.startsWith('voice-'))assert.deepEqual(asked,['/assets/audio/voice/'+scope.slice(6)+'/a.mp3']);
 assert.deepEqual(new Set(asked),new Set(selectedResources(index,selection).files.map(f=>f.path)));
 const marker=preview?'/__preview_resources_ready__':'/__resources_ready__';
 assert.equal(await saved.get(marker).text(),selectedResources(index,selection).version);
 if(!preview)assert.equal(reply.type,'ready');
});

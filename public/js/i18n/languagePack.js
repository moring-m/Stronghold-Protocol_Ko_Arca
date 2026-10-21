import {LANGUAGE_PACKS} from '../../../shared/languagePacks.js';
const CACHE='stronghold-language-packs-v1';
const key=file=>`${file.path}?languageHash=${file.hash}`;
export async function languagePackReady(code){
 if(code==='ko')return true;
 if(!globalThis.caches)return false;
 const cache=await caches.open(CACHE);
 return (await Promise.all((LANGUAGE_PACKS[code]||[]).map(file=>cache.match(key(file))))).every(Boolean);
}
export async function languageFetch(url,options,fetcher=globalThis.fetch.bind(globalThis)){
 const path=new URL(url,globalThis.location?.origin||'http://localhost').pathname;
 const file=Object.values(LANGUAGE_PACKS).flat().find(file=>file.path===path);
 if(file&&globalThis.caches){const hit=await(await caches.open(CACHE)).match(key(file));if(hit)return hit;}
 return fetcher(url,options);
}
export async function downloadLanguagePack(code,onProgress=()=>{}){
 const files=LANGUAGE_PACKS[code]||[];
 if(!globalThis.caches)throw new Error('Persistent storage is unavailable.');
 const cache=await caches.open(CACHE),total=files.reduce((sum,file)=>sum+file.bytes,0);let loaded=0;
 for(const file of files){
  if(await cache.match(key(file))){loaded+=file.bytes;onProgress({loaded,total});continue;}
  const response=await fetch(file.path,{cache:'no-cache'});
  if(!response.ok)throw new Error(`HTTP ${response.status}: ${file.path}`);
  const reader=response.body?.getReader();let bytes;
  if(reader){const chunks=[];let size=0;for(;;){const part=await reader.read();if(part.done)break;chunks.push(part.value);size+=part.value.length;onProgress({loaded:Math.min(loaded+size,total),total});}bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}}
  else bytes=new Uint8Array(await response.arrayBuffer());
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==file.hash)throw new Error('Language pack changed. Reload and retry.');
  JSON.parse(new TextDecoder().decode(bytes));
  await cache.put(key(file),new Response(bytes,{headers:{'Content-Type':'application/json'}}));
  loaded+=file.bytes;onProgress({loaded,total});
 }
}

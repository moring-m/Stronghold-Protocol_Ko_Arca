import {test}from'node:test';
import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{voiceLine}from'../../public/js/audio.js';
const read=name=>JSON.parse(readFileSync(new URL('../../content/production/data/'+name+'.json',import.meta.url)));
test('every listed production skin has a renderable model and indexed resources',()=>{
 const chess=read('chess'),assets=read('assets'),resources=JSON.parse(readFileSync(new URL('../../content/production/resources.json',import.meta.url))),paths=new Set(resources.files.map(f=>f.path));let checked=0;
 for(const c of Object.values(chess))for(const s of c.skins||[]){
  const e=assets.chars[s.assets.spine];assert.ok(e?.spine?.front,`${c.chessId}/${s.id}: model mapping`);
  for(const side of [e.spine.front,e.spine.back].filter(Boolean))for(const path of [side.skel,side.atlas,...side.textures])assert.ok(paths.has(path),`${s.id}: ${path}`);
  assert.ok(paths.has(e.avatar));assert.ok(paths.has(e.portrait));checked++;
 }
 assert.ok(checked>400,'existing ordinary and elite skin selections are preserved');
});
test('production voices retain Korean and Japanese without Chinese or invalid source directories',()=>{
 const a=read('assets').audio;
 assert.ok(Object.keys(a.voice.kr).length>100);assert.ok(Object.keys(a.voice.jp).length>100);assert.equal(a.voice.cn,undefined);
 for(const lang of ['kr','jp']){const cid=Object.keys(a.voice[lang])[0],slot=Object.keys(a.voice[lang][cid]).find(k=>a.voice[lang][cid][k]?.length);assert.ok(voiceLine(a,cid,slot,lang,()=>0));}
 const resources=JSON.parse(readFileSync(new URL('../../content/production/resources.json',import.meta.url)));
 for(const f of resources.files){assert.ok(!/^\/assets\/audio\/voice\/(cn|voice_cn)\//.test(f.path),f.path);for(const url of f.sources)assert.ok(!/sound_beta_2\/(cn|jp)\//.test(url),url);}
});

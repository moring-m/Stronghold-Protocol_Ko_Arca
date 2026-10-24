import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyFileOverlay} from '../shared/i18nData.js';
import {localizeMakoto} from '../tools/build-makoto-i18n.mjs';
const read=p=>JSON.parse(readFileSync(new URL('../'+p,import.meta.url)));
const chess=read('content/production/data/chess.json'),ko=read('content/custom/makoto/ko.json');
function strings(v,path='',out=[]){if(typeof v==='string')out.push([path,v]);else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))strings(x,path+'.'+k,out);return out;}
for(const lang of ['en','ja','zh'])test(`Makoto ${lang}: every tier, skill, potential, module and skin has localized game text`,()=>{
 const text=read(`content/custom/makoto/${lang}.json`),fork=read(`public/i18n/${lang}/fork.json`);
 const overlay=lang==='zh'?null:read(`public/i18n/${lang}/data.json`);
 for(const r of Object.values(chess).filter(r=>r.charId==='char_4217_makoto')){
  const localized=localizeMakoto(r,ko,text);
  assert.deepEqual(strings(localized).filter(([,s])=>/[가-힣]/.test(s)),[]);
  assert.equal(localized.name,text.name);assert.equal(localized.skills.length,3);assert.deepEqual(localized.stats,r.stats);
  for(const sk of localized.skills){assert.ok(!/\{[^}]+\}/.test(sk.desc));assert.ok(!sk.desc.includes('NaN'));assert.ok(sk.desc.includes('<'));}
  if(overlay){const result=applyFileOverlay({[r.chessId]:r},overlay.files.chess);assert.equal(result.stale,0);assert.deepEqual(result.value[r.chessId],localized);}
  const target=new Map(strings(localized));for(const[path,src]of strings(r))if(/[가-힣]/.test(src))assert.equal(fork[src],target.get(path),`${lang}: ${path}`);
 }
});
test('Makoto localization sources distinguish official CN from community and translated unreleased text',()=>{
 for(const lang of ['en','ja','zh']){const text=read(`content/custom/makoto/${lang}.json`);assert.ok(text.source.length);assert.ok(text.note);}
});

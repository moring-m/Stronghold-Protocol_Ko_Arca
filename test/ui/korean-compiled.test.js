import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {compileKoreanUi} from '../../tools/build-korean-ui.mjs';
const root=new URL('../../',import.meta.url),read=p=>JSON.parse(readFileSync(new URL(p,root),'utf8'));
const overlays=['official','data','manual','ui','patterns'].map(n=>[n,read(`public/i18n/ko/${n}.json`)]);
const compiled=compileKoreanUi(read('public/i18n/ko.json'),overlays);
async function runtime(useCompiled){
 let requests=[];
 let source=readFileSync(new URL('public/js/i18n/i18n.js',root),'utf8').replace(/^import[^\n]*\n/,'').replace(/export /g,'');source=source.slice(0,source.indexOf("if (hasDom && lang === 'ko')"));
 const api=await runInNewContext(`(async()=>{${source}\nawait load();return {messages:Object.fromEntries(dict),patterns:patterns.map(p=>({...p,re:p.re.source})),tr};})()`,{console,AbortSignal,addMessages(){},setSharedLang(){},fetch:async url=>{requests.push(url);if(url.endsWith('compiled.json'))return new Response(useCompiled?JSON.stringify(compiled):'',{status:useCompiled?200:404});return new Response(readFileSync(new URL('public'+url,root),'utf8'));}});
 return {api,requests};
}
test('compiled Korean display resource exactly matches original dictionary and pattern precedence',async()=>{
 const fast=await runtime(true),original=await runtime(false);
 assert.deepEqual(JSON.parse(JSON.stringify(fast.api.messages)),JSON.parse(JSON.stringify(original.api.messages)));
 assert.deepEqual(JSON.parse(JSON.stringify(fast.api.patterns)),JSON.parse(JSON.stringify(original.api.patterns)));
 assert.equal(fast.requests.length,1);assert.equal(original.requests.length,7);
 for(const source of Object.keys(compiled.messages))assert.equal(fast.api.tr(source),original.api.tr(source),source);
 for(const pattern of compiled.patterns){const sample=pattern.out.replace(/\{\d+\}/g,'123');assert.equal(fast.api.tr(sample),original.api.tr(sample));}
});
test('committed compiled resource is current and compilation does not mutate source inputs',()=>{
 const inputs=JSON.stringify(overlays),upstream=read('public/i18n/ko.json'),before=JSON.stringify(upstream);
 assert.deepEqual(read('public/i18n/ko/compiled.json'),compiled);
 compileKoreanUi(upstream,overlays);assert.equal(JSON.stringify(upstream),before);assert.equal(JSON.stringify(overlays),inputs);
});

test('joint-choice guidance and exposed voice language names are Korean',async()=>{
 const {api}=await runtime(true);
 assert.equal(api.tr(' · 点击卡牌选中，再次点击确认'),' · 카드를 눌러 선택하고 한 번 더 눌러 확정');
 assert.equal(api.tr('日本語'),'일본어');
});

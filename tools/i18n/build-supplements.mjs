import {compileKoreanUi} from '../build-korean-ui.mjs';
import {checkTranslation} from '../../shared/i18n.js';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const rows=JSON.parse(await readFile('.cache/translation-inventory.json','utf8'));
const reuse=JSON.parse(await readFile('.cache/translation-reuse.json','utf8'));
const machine=await readFile('.cache/custom-translation-cache.json','utf8').then(JSON.parse).catch(()=>({}));
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const ko=compileKoreanUi(await readJson('public/i18n/ko.json'),await Promise.all(['official','data','manual','ui','patterns'].map(async name=>[name,await readJson(`public/i18n/ko/${name}.json`)]))).messages;
const strip=text=>text.replace(/<(?:[@$][^>]*|\/|\/?(?:span|b|i|em|strong|br|p|div|small|a|sup|sub|mark)(?:\s[^>]*?)?\/?)>|\{(?:\d+|[a-zA-Z_]\w*)(?::[^{}]*)?(?:\|[^{}]*)?\}/g,'');
const markers=text=>(text.match(/<(?:[@$][^>]*|\/|\/?(?:span|b|i|em|strong|br|p|div|small|a|sup|sub|mark)(?:\s[^>]*?)?\/?)>|\{(?:\d+|[a-zA-Z_]\w*)(?::[^{}]*)?(?:\|[^{}]*)?\}/g)||[]).sort();
const report={total:rows.length,languages:{},unresolved:[]};
for(const code of ['ko','en','ja','zh']){
 const out={},count={officialOrCurated:0,supplement:0,native:0,missing:0,invalid:0};
 for(const row of rows){
  const source=row.source,native=(code==='ko'&&/[가-힣]/.test(source))||(code==='zh'&&!/[가-힣]/.test(source));
  if(native){count.native++;continue;}
  if(code==='ko'&&Object.hasOwn(ko,source)&&ko[source]===''){count.officialOrCurated++;continue;}
  const officialCandidate=reuse[code]?.[source];
  const textBad=v=>{const text=strip(v||'');return !v||(code!=='ko'&&/[가-힣]/.test(text))||(['ko','en'].includes(code)&&/[一-鿿]/.test(text));};
  const official=!textBad(officialCandidate)?officialCandidate:null;
  let value=official||machine[code]?.[source];
  if(!value){count.missing++;report.unresolved.push({lang:code,source,at:row.at,reason:'missing'});continue;}
  if(source.includes('중첩')){if(code==='en')value=value.replace(/\b(nested|nesting)\b/gi,'stacks');if(code==='ja')value=value.replace(/入れ子|ネスト/g,'スタック');if(code==='zh')value=value.replace(/嵌套|堆栈/g,'层数');}
  const visible=strip(value),bad=(code!=='ko'&&/[가-힣]/.test(visible))||(['ko','en'].includes(code)&&/[一-鿿]/.test(visible));
  if(bad||(!official&&JSON.stringify(markers(source))!==JSON.stringify(markers(value)))||(!checkTranslation((source.match(/\{(?:\d+|[a-zA-Z_]\w*)(?:\|[^{}]*)?\}/g)||[]).join(' '),(value.match(/\{(?:\d+|[a-zA-Z_]\w*)(?:\|[^{}]*)?\}/g)||[]).join(' ')).ok)){count.invalid++;report.unresolved.push({lang:code,source,at:row.at,value,reason:bad?'untranslated characters':'markup or placeholders'});continue;}
  if(code!=='ko'||!ko[source])out[source]=value;
  if(official)count.officialOrCurated++;else count.supplement++;
 }
 await writeFile(`public/i18n/${code}/audit.json`,JSON.stringify(out)+'\n');report.languages[code]=count;
}
await mkdir('docs/languages-2026-10-21',{recursive:true});
await writeFile('.cache/translation-coverage.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({total:report.total,languages:report.languages,unresolved:report.unresolved.length},null,2));
if(process.argv.includes('--check')&&report.unresolved.length)process.exitCode=1;

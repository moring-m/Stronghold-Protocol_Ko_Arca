// Inventory executable UI/server messages, release notes and every production/custom data text.
// Never rewrite source game data: translations remain display-only.
import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {lex,htmTexts} from './extract-ui-strings.mjs';
import {createAugmentCatalog,AUGMENT_ROUNDS} from '../../shared/augments.js';
import {bondReportDescription} from '../../public/js/screens/sweep.js';
import {compileKoreanUi} from '../build-korean-ui.mjs';
import {bountyText} from '../../server/match/choices.js';
import {applyFileOverlay} from '../../shared/i18nData.js';
const human=/[一-鿿가-힣]/,entries=new Map();
function add(text,at){if(typeof text!=='string'||!human.test(text))return;const key=text.trim();if(!key||key.length>16000)return;const row=entries.get(key)||{source:key,at:[]};if(row.at.length<4)row.at.push(at);entries.set(key,row);}
async function walk(dir){let out=[];for(const f of await readdir(dir,{withFileTypes:true})){const p=dir+'/'+f.name;if(f.isDirectory())out.push(...await walk(p));else out.push(p);}return out;}
for(const dir of ['public/js','shared','server'])for(const path of await walk(dir)){
 if(!path.endsWith('.js')||/public\/js\/i18n\/|server\/sim\//.test(path))continue;
 const src=await readFile(path,'utf8');for(const tok of lex(src)){const at=path+':'+tok.line;if(tok.tag==='html'){for(const t of htmTexts(tok.parts,human))add(t,at);}else add(tok.parts.map((s,i)=>(i?`{${i-1}}`:'')+s).join(''),at);}
}
function strings(value,at){if(typeof value==='string')add(value,at);else if(value&&typeof value==='object')for(const[k,v]of Object.entries(value))strings(v,at+'.'+k);}
for(const dir of ['content/production/data','content/custom'])for(const path of await walk(dir))if(path.endsWith('.json')&&!/(?:assets|local-fx|local-assets|icons|icon-assignments|resources)\.json$|\/i18n\//.test(path))strings(JSON.parse(await readFile(path,'utf8')),path);
const generatedData=Object.fromEntries(await Promise.all(['bonds','chess','items'].map(async k=>[k,JSON.parse(await readFile(`content/production/data/${k}.json`,'utf8'))])));
for(const round of AUGMENT_ROUNDS)for(const a of createAugmentCatalog(generatedData,round)){add(a.name,'shared/augments.js:runtime:'+a.id);add(a.description,'shared/augments.js:runtime:'+a.id);}
for(const b of Object.values(generatedData.bonds))add(bondReportDescription(b),'public/js/screens/sweep.js:bondReportDescription:'+b.bondId);
const choices=JSON.parse(await readFile('content/production/data/choices.json','utf8')),effects=JSON.parse(await readFile('content/production/data/effects.json','utf8'));
for(const card of choices.cards.bounty)for(const raw of [card.desc,effects[card.effectId]?.descRaw])add(bountyText(raw,card),'server/match/choices.js:bountyText:'+card.effectId);
const readJson=async p=>JSON.parse(await readFile(p,'utf8'));
const compiled=compileKoreanUi(await readJson('public/i18n/ko.json'),await Promise.all(['official','data','manual','ui','patterns'].map(async name=>[name,await readJson(`public/i18n/ko/${name}.json`)])));
const ko=compiled.messages;
const known={};
const rawChess=JSON.parse(await readFile('content/production/data/chess.json','utf8'));
const cnCharacters=JSON.parse(await readFile('.cache/gamedata/excel/character_table.json','utf8'));
const krCharacters=await readFile('.cache/gamedata-ko/excel/character_table.json','utf8').then(JSON.parse).catch(()=>({}));
for(const code of ['ko','en','ja','zh']){
 const ui=code==='zh'?{}:JSON.parse(await readFile(`public/i18n/${code}.json`,'utf8'));
 const fork=await readFile(`public/i18n/${code}/fork.json`,'utf8').then(JSON.parse).catch(()=>({}));
 const exact={...ui,...(code==='ko'?ko:{})};
 if(code!=='zh'){
  const overlay=JSON.parse(await readFile(code==='ko'?'.cache/cn-source-ko.json':`public/i18n/${code}/data.json`,'utf8'));Object.assign(exact,overlay.names);
  function pairs(raw,localized){if(typeof raw==='string'&&typeof localized==='string'&&raw!==localized)exact[raw]??=localized;else if(raw&&localized&&typeof raw==='object'&&typeof localized==='object')for(const[k,v]of Object.entries(raw))pairs(v,localized[k]);}
  const extra=await readFile(`.cache/ko-source-${code}.json`,'utf8').then(JSON.parse).catch(()=>({files:{}}));
  for(const[file,ov]of [...Object.entries(overlay.files),...Object.entries(extra.files)]){try{const raw=JSON.parse(await readFile(`content/production/data/${file}.json`,'utf8'));pairs(raw,applyFileOverlay(raw,ov).value);}catch{}}
 }
 for(const[source,korean]of Object.entries(ko)){const target=code==='zh'?source:exact[source];if(typeof target==='string'&&typeof korean==='string'&&target!==korean)exact[korean]??=target;}
 const targetCharacters=code==='zh'?cnCharacters:JSON.parse(await readFile(`.cache/gamedata-${code}/excel/character_table.json`,'utf8'));
 for(const c of Object.values(rawChess)){
  const name=targetCharacters[c.charId]?.name;if(!name)continue;
  for(const source of [c.name,cnCharacters[c.charId]?.name,krCharacters[c.charId]?.name])if(source)exact[source]=name;
 }
 if(code==='ko')for(const source of entries.keys()){
  if(exact[source]||/[가-힣]/.test(source))continue;
  for(const pattern of compiled.patterns){const match=new RegExp(pattern.re).exec(source);if(!match)continue;const values={};pattern.order.forEach((id,index)=>values[id]=exact[match[index+1]]||match[index+1]);const value=pattern.out.replace(/\{(\d+)\}/g,(_,id)=>values[id]??'{'+id+'}');if(/[가-힣]/.test(value)){exact[source]=value;break;}}
 }
 Object.assign(exact,fork);known[code]=exact;
}
const report=[...entries.values()].map(row=>({...row,translations:Object.fromEntries(['ko','en','ja','zh'].map(code=>[code,known[code][row.source]||null]))}));
await mkdir('.cache',{recursive:true});await writeFile('.cache/translation-inventory.json',JSON.stringify(report,null,1));await writeFile('.cache/translation-reuse.json',JSON.stringify(known));
console.log(JSON.stringify({texts:report.length,missing:Object.fromEntries(['ko','en','ja','zh'].map(code=>[code,report.filter(r=>!r.translations[code]&&!(code==='zh'&&!/[가-힣]/.test(r.source))&&!(code==='ko'&&/[가-힣]/.test(r.source))).length]))}));

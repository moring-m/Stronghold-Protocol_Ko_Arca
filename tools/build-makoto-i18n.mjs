// Rebuild every recruit/potential/module text from the same blackboards as combat.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {textPair} from './build-data.mjs';
import {buildRecordOverlay} from '../shared/i18nData.js';
const root=fileURLToPath(new URL('../',import.meta.url));
const read=async p=>JSON.parse(await readFile(root+p,'utf8'));
const write=(p,v)=>writeFile(root+p,JSON.stringify(v,null,2)+'\n');
export function localizeMakoto(source,ko,texts){
 const names=new Map([[ko.name||'유키 마코토',texts.name],['인형사',texts.subProfessionName],...ko.talents.map((v,i)=>[v[0],texts.talents[i][0]]),...ko.skills.map((v,i)=>[v[0],texts.skills[i][0]]),...Object.entries(ko.modules).map(([k,v])=>[v,texts.modules[k]]),...Object.entries(texts.skins)]);
 const visit=(value,key)=>{
  if(typeof value==='string')return names.get(value)||value;
  if(!value||typeof value!=='object')return value;
  const out=Array.isArray(value)?value.map(v=>visit(v)):Object.fromEntries(Object.entries(value).map(([k,v])=>[k,visit(v,k)]));
  if(!Array.isArray(out)&&value.bb){
   let desc;
   if(['trait','traitBase','traitOverride'].includes(key))desc=value.bb.max_hp?texts.moduleTrait:texts.trait;
   else if(value.skillId?.startsWith('skchr_makoto_')){const i=Number(value.skillId.at(-1))-1;out.name=texts.skills[i][0];desc=texts.skills[i][1];}
   else {const i=ko.talents.findIndex(t=>t[0]===value.name);if(i>=0){out.name=texts.talents[i][0];desc=texts.talents[i][1];}}
   if(desc)Object.assign(out,textPair(desc,value.bb,value.bbStr));
  }
  return out;
 };
 return visit(source);
}
function changedLeaves(src,dst,path=[],leaves=[]){
 if(typeof src==='string'&&typeof dst==='string'&&src!==dst)leaves.push({path,zh:src,en:dst});
 else if(src&&dst&&typeof src==='object')for(const k of Object.keys(src))changedLeaves(src[k],dst[k],[...path,Array.isArray(src)?Number(k):k],leaves);
 return leaves;
}
export async function buildMakotoI18n(){
 const ko=await read('content/custom/makoto/ko.json'),chess=await read('content/production/data/chess.json'),counts={};
 for(const lang of ['en','ja','zh']){
  const texts=await read(`content/custom/makoto/${lang}.json`),fork=await read(`public/i18n/${lang}/fork.json`),overlay=lang==='zh'?null:await read(`public/i18n/${lang}/data.json`);
  let n=0;
  for(const [id,r]of Object.entries(chess).filter(([,r])=>r.charId==='char_4217_makoto')){
   const leaves=changedLeaves(r,localizeMakoto(r,ko,texts));n+=leaves.length;
   for(const {zh,en}of leaves)fork[zh]=en;
   if(overlay){overlay.files.chess[id]=buildRecordOverlay(leaves);overlay.names[r.name]=texts.name;}
  }
  await write(`public/i18n/${lang}/fork.json`,fork);
  if(overlay)await writeFile(root+`public/i18n/${lang}/data.json`,JSON.stringify(overlay)+'\n');
  counts[lang]=n;
 }
 return counts;
}
if(process.argv[1]===fileURLToPath(import.meta.url))console.log(await buildMakotoI18n());

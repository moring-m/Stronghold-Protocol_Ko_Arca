// Translate generated augment names/descriptions, not just their CSV templates.
import {readFile,writeFile}from'node:fs/promises';
import {createAugmentCatalog,AUGMENT_ROUNDS}from'../../shared/augments.js';
import {applyFileOverlay}from'../../shared/i18nData.js';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const data=Object.fromEntries(await Promise.all(['bonds','chess','items'].map(async k=>[k,await read(`content/production/data/${k}.json`)])));
const reuse=await read('.cache/translation-reuse.json');
for(const lang of ['en','ja','zh']){
 const path=`public/i18n/${lang}/fork.json`,dict=await read(path),names={...reuse[lang],...await read(`public/i18n/${lang}/audit.json`),...dict};
 const overlay=lang==='zh'?{}:await read(`public/i18n/${lang}/data.json`);
 const items=applyFileOverlay(data.items,overlay.files?.items||{}).value;
 const pick=(en,ja,zh)=>({en,ja,zh})[lang];
 for(const round of AUGMENT_ROUNDS)for(const a of createAugmentCatalog(data,round)){
  if(!a.bondId||!['items','chess'].includes(a.effect.kind))continue;
  const label=a.name.replace(/ (?:장비 지원|지원) (?:I|II|III)$/,''),bond=names[label]||names[data.bonds[a.bondId]?.name];
  if(!bond||/[가-힣]/.test(bond))throw Error(`Missing ${lang} Bond ${label}`);
  const tier=a.name.match(/ (I|II|III)$/)?.[1];
  dict[a.name]=a.effect.kind==='items'?pick(`${bond} Equipment Support ${tier}`,`${bond} 装備支援 ${tier}`,`${bond}装备支援 ${tier}`):pick(`${bond} Support ${tier}`,`${bond} 支援 ${tier}`,`${bond}支援 ${tier}`);
  if(a.effect.kind==='chess')dict[a.description]=pick(`Gain ${a.effect.count} random Tier ${a.effect.tier} [${bond}] Operator(s)`,`ランダムなランク${a.effect.tier}の[${bond}]オペレーターを${a.effect.count}名獲得`,`获得${a.effect.count}名随机${a.effect.tier}阶[${bond}]干员`);
  else{
   const labels=a.effect.items.map((id,i)=>{
    const name=names[data.items[id]?.name]||items[id]?.name;
    if(!name||/[가-힣]/.test(name)||(lang==='en'&&/[一-鿿]/.test(name)))throw Error(`Missing ${lang} item ${id}`);
    const count=a.effect.counts[i];return pick(`${count} × ${name}`,`${name}を${count}個`,`${count}个${name}`);
   });
   dict[a.description]=pick(`Gain ${labels.join(' and ')}`,`${labels.join('、')}獲得`,`获得${labels.join('和')}`);
  }
 }
 await writeFile(path,JSON.stringify(dict,null,2)+'\n');
}

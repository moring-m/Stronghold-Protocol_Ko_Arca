import {withPotentialData} from './build-data.mjs';
// Compose upstream DIY forms into stable local recruit identities; the existing per-player editor and draft sync remain intact.
import {buildRecruitResources} from './build-recruit-resources.mjs';
import {readFile,writeFile} from 'node:fs/promises';
import {composeUnitRecord,unitForm,statusKey} from '../shared/standIn.js';
import {isDiyModule} from '../shared/diy.js';
import {loadKorean,localizeOperator,localizeToken} from './ursus-korean.mjs';
// Preserve original rule text for the upstream kits' parsers; displayed data remains Korean.
function mechanicText(x){
 if(Array.isArray(x))return x.map(mechanicText);
 if(!x||typeof x!=='object')return null;
 const out={};for(const [k,v]of Object.entries(x)){if(['desc','descRaw','description','moduleDesc','moduleDescRaw'].includes(k)&&typeof v==='string')out[k]=v;else if(v&&typeof v==='object'&&k!=='mechanicText'){const sub=mechanicText(v);if(sub)out[k]=sub;}}return Object.keys(out).length?out:null;
}
const read=async p=>JSON.parse(await readFile(p,'utf8'));
export async function buildUpstreamRecruits(root,dir){
 const backups=await read(`${root}/content/upstream-recruits/backups.json`),slots=await read(`${root}/content/upstream-recruits/slots.json`),srcAssets=await read(`${root}/content/upstream-recruits/assets.json`);
 const chess=await read(`${dir}/chess.json`),tokens=await read(`${dir}/tokens.json`),assets=await read(`${dir}/assets.json`),bonds=await read(`${dir}/bonds.json`),kr=await loadKorean(root);
 const legacy=await read(`${root}/content/custom/ursus/recruits.json`),keys=new Map(legacy.map(o=>[o.charId,o.key]));
 const ids=[...new Set([...backups.diy.ownedPool,...Object.values(backups.diy.prototypes).flat()])];
 for(const cid of ids)for(const tier of [5,6]){
  const prototype=backups.diy.prototypes[tier]?.includes(cid),owned=backups.diy.ownedPool.includes(cid);if(!prototype&&!owned)continue;
  const key=keys.get(cid)||cid.replace(/^char_\d+_/,'');
  for(const elite of [false,true]){
   const slot=structuredClone(slots[`chess_char_${tier}_diy1_${elite?'b':'a'}`]),form=structuredClone(unitForm(backups,cid,slot.status)),unit=structuredClone(backups.units[cid]);
   const lock=prototype?backups.diy.locked[tier][cid]:null;
   const index=lock?.skillIndex??legacy.find(o=>o.charId===cid)?.skillIndex??form.skills.at(-1)?.index;
   const moduleId=lock?.uniEquipId??form.modules?.find(isDiyModule)?.uniEquipId??null;
   const errors=[];
   const rec=withPotentialData(Array.from({length:6},(_,rank)=>composeUnitRecord(slot,unit,form,{skillIndex:index,moduleId,potential:rank+1,bonds:backups.diy.operators[cid].bonds})),cid,errors);
   if(errors.length)throw Error(errors.join('\n'));if(!rec?.skill)throw Error(`Missing upstream recruit ${cid}/${tier}`);
   const base=`chess_custom_recruit_${key}_${tier}_a`,id=base.replace(/_a$/,elite?'_b':'_a');
   Object.assign(rec,{chessId:id,baseId:base,goldenId:base.replace(/_a$/,'_b'),upgradeChessId:elite?null:base.replace(/_a$/,'_b'),identifier:20000+ids.indexOf(cid)*4+(tier-5)*2+Number(elite),isDiy:false,chessType:'NORMAL',visible:true,isHidden:false,optionalRecruit:true,recruitSource:'upstream-0.2.1',recruitSlot:slot.baseId,recruitPrototype:prototype,recruitReserve:prototype&&tier===5&&!backups.diy.prototypes[6].includes(cid),garrisonIds:[],shopSortId:200+ids.indexOf(cid)});

   rec.mechanicText=mechanicText(rec);
   rec.skills=rec.skills.map(s=>({...s,locked:prototype}));localizeOperator(rec,kr,{...slot.status,evolvePhase:`PHASE_${slot.status.phase}`,charLevel:slot.status.level});
   if(keys.has(cid))rec.name=legacy.find(o=>o.charId===cid).name;
   const old=chess[id];if(old?.skins)rec.skins=old.skins;
   chess[id]=rec;
   for(const tid of form.tokens||[]){const t=backups.tokens[tid];if(!t)continue;const v=t.variants?.[`${cid}@${statusKey(slot.status)}`];if(!v)continue;
    const target=tokens[tid]??structuredClone(t);target.variants??={};target.variants[id]=structuredClone(v);target.owners??=[];if(!target.owners.includes(id))target.owners.push(id);tokens[tid]=target;
    if(tid==='token_10035_wisdel_wward'){target.placeable=false;target.noHeal=true;target.name='레버넌트의 그림자';}
    target.mechanicText??=mechanicText(t);localizeToken(target,kr);
   }
   if(!elite)for(const bid of rec.bonds)for(const field of ['members','visibleMembers']){const arr=bonds[bid]?.[field];if(arr&&!arr.includes(id))arr.push(id);}
  }
 }
 for(const [id,a]of Object.entries(srcAssets.chars||{}))if(!assets.chars[id])assets.chars[id]=a;
 for(const field of ['tokens','skills','skillsById','modules','prof']){assets[field]??={};for(const [id,value]of Object.entries(srcAssets[field]||{}))assets[field][id]??=value;}
 assets.audio??={};assets.audio.units??={};for(const [id,value]of Object.entries(srcAssets.audio?.units||{}))assets.audio.units[id]??=value;
 const ursusChars=new Set(Object.values(chess).filter(c=>!c.optionalRecruit&&c.bonds?.includes('ursusShip')).map(c=>c.charId));
 for(const rec of Object.values(chess))if(rec.optionalRecruit&&(ursusChars.has(rec.charId)||rec.bonds?.includes('ursusShip')))Object.assign(rec,{visible:false,isHidden:true,shopExcluded:true});
 assets.audio??={};const voice=assets.audio.voice||{};assets.audio.voice={kr:voice.kr||{},jp:voice.jp||assets.audio.voiceJp||{}};
 assets.stats??={};assets.stats.voiceChars=new Set([...Object.keys(assets.audio.voice.kr),...Object.keys(assets.audio.voice.jp)]).size;
 for(const [k,v]of Object.entries({chess,tokens,assets,bonds}))await writeFile(`${dir}/${k}.json`,JSON.stringify(v));
 await buildRecruitResources(root);
 console.log(`Upstream recruit roster: ${ids.length} operators, preserved Sakiko`);
}
if(process.argv[1]?.endsWith('build-upstream-recruits.mjs'))await buildUpstreamRecruits(process.cwd(),`${process.cwd()}/.cache/ursus-data`);

import {readFile,writeFile} from 'node:fs/promises';
import {createOfficialUnitBuilders} from '../server/plugins/officialUnitBuilder.js';
import {composeUnitRecord} from '../shared/standIn.js';
import {withPotentialData,textPair} from './build-data.mjs';
const CID='char_4217_makoto';
import {readFileSync} from 'node:fs';
const texts=JSON.parse(readFileSync(new URL('../content/custom/makoto/ko.json',import.meta.url),'utf8'));
export function translateMakoto(r){
 r.name='유키 마코토';r.subProfessionName='인형사';
 const tr=t=>{if(!t)return;Object.assign(t,textPair(t.bb?.max_hp?texts.moduleTrait:texts.trait,t.bb,t.bbStr));};
 tr(r.trait);tr(r.traitBase);
 for(const list of [r.talents,r.talentsBase])for(const t of list||[])if(texts.talents[t.index]){const [name,desc]=texts.talents[t.index];Object.assign(t,{name},textPair(desc,t.bb,t.bbStr));}
 for(const sk of r.skills){const[name,desc]=texts.skills[sk.index];Object.assign(sk,{name},textPair(desc,sk.bb,sk.bbStr));}
 Object.assign(r.skill,r.skills.find(s=>s.index===r.skill.index));
 for(const m of r.modules||[]){m.name=texts.modules[m.uniEquipId]||texts.modules.default;tr(m.traitOverride);for(const t of m.talentChanges||[])if(texts.talents[t.index??t.talentIndex]){const[name,desc]=texts.talents[t.index??t.talentIndex];Object.assign(t,{name},textPair(desc,t.bb,t.bbStr));}}
 if(r.module?.id)r.module.name=texts.modules[r.module.id]||texts.modules.default;return r;
}
export async function buildMakoto(root,dir){
 const read=async p=>JSON.parse(await readFile(p,'utf8'));
 const tables=await read(`${root}/content/custom/makoto/official.json`),slots=await read(`${root}/content/upstream-recruits/slots.json`);
 const chess=await read(`${dir}/chess.json`),bonds=await read(`${dir}/bonds.json`),assets=await read(`${dir}/assets.json`);
 const {buildUnitHead,buildUnitForm}=createOfficialUnitBuilders(message=>{if(!/trigger|range|module/i.test(message))console.warn('[makoto]',message)});
 for(const tier of [5,6])for(const elite of [false,true]){
  const identity=structuredClone(slots[`chess_char_${tier}_diy1_${elite?'b':'a'}`]);const errors=[];
  const values=Array.from({length:6},(_,potRank)=>{const ctx={...tables,potRank};return composeUnitRecord(identity,buildUnitHead(ctx,CID),buildUnitForm(ctx,CID,identity.status),{skillIndex:2,moduleId:elite?'uniequip_002_makoto':null,bonds:['emptyShip']});});
  const r=withPotentialData(values,CID,errors);if(errors.length)throw Error(errors.join('\n'));
  const base=`chess_custom_recruit_makoto_${tier}_a`,id=base.replace(/_a$/,elite?'_b':'_a');
  Object.assign(r,{chessId:id,baseId:base,goldenId:base.replace(/_a$/,'_b'),upgradeChessId:elite?null:base.replace(/_a$/,'_b'),identifier:24000+tier*2+Number(elite),isDiy:false,chessType:'NORMAL',visible:true,isHidden:false,optionalRecruit:true,recruitSource:'local-makoto',recruitSlot:identity.baseId,garrisonIds:[],shopSortId:-1,globalReleased:false});
  translateMakoto(r);r.skills=r.skills.map(s=>({...s,locked:false}));r.assets.voice=CID;
  const old=chess[id];if(old?.skins)r.skins=old.skins;chess[id]=r;
  if(!elite)for(const k of ['members','visibleMembers'])if(bonds.emptyShip[k]&&!bonds.emptyShip[k].includes(id))bonds.emptyShip[k].push(id);
 }
 for(const [key,value]of Object.entries({chess,bonds,assets}))await writeFile(`${dir}/${key}.json`,JSON.stringify(value));
}

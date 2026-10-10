// Optional local recruits, two immutable tier variants; selection belongs to each player's loadout.
import {readFile,writeFile} from 'node:fs/promises';
import {loadContext,buildChess,buildTokens} from './build-data.mjs';
import {loadKorean,localizeOperator,localizeToken} from './ursus-korean.mjs';
export async function buildRecruits(root,dir,{previousChess=null}={}){
 const read=async p=>JSON.parse(await readFile(p,'utf8'));
 const ops=await read(`${root}/content/custom/ursus/recruits.json`),ctx=await loadContext({operatorsOnly:true}),a=ctx.act;
 for(const [i,o] of ops.entries())for(const tier of [5,6]){
  const template=Object.keys(a.charShopChessDatas).find(id=>a.charShopChessDatas[id].chessLevel===tier&&a.charChessDataDict[id]&&!a.charShopChessDatas[id].isHidden&&a.charShopChessDatas[id].chessType==='NORMAL');
  const shop=structuredClone(a.charShopChessDatas[template]),normal=`chess_custom_recruit_${o.key}_${tier}_a`,golden=normal.replace(/_a$/,'_b');
  const moduleId=(ctx.uniequip.charEquip?.[o.charId]||[]).find(id=>ctx.uniequip.equipDict[id]?.type==='ADVANCED')||null;
  Object.assign(shop,{chessId:normal,goldenChessId:golden,charId:o.charId,defaultSkillIndex:o.skillIndex,defaultUniEquipId:moduleId,shopLevelSortId:110+i,isHidden:false,chessType:'NORMAL',backupCharId:null,backupCharUniEquipId:null});a.charShopChessDatas[normal]=shop;
  for(const [g,id] of [[false,normal],[true,golden]]){
   const r=structuredClone(a.charChessDataDict[g?a.charShopChessDatas[template].goldenChessId:template]);
   Object.assign(r,{chessId:id,identifier:10000+i*4+(tier-5)*2+Number(g),isGolden:g,upgradeChessId:g?null:golden,upgradeNum:g?0:3,bondIds:o.bonds,garrisonIds:[]});
   r.status.equipLevel=g&&moduleId?3:0;a.charChessDataDict[id]=r;a.chessNormalIdLookupDict[id]=normal;
  }
 }
 const result=buildChess(ctx),generated=result.chess,chess=await read(`${dir}/chess.json`),bonds=await read(`${dir}/bonds.json`),kr=await loadKorean(root);
 for(const o of ops)for(const tier of [5,6])for(const suffix of ['a','b']){
  const id=`chess_custom_recruit_${o.key}_${tier}_${suffix}`,r=generated[id];if(!r?.skills?.length)throw Error(`Missing recruit ${id}`);
  localizeOperator(r,kr,a.charChessDataDict[id].status);r.name=o.name;r.optionalRecruit=true;r.garrisonIds=[];r.assets.avatar=`${o.charId}${suffix==='b'?'_2':''}`;const old=chess[id]?.skins?.length?chess[id]:Object.values(previousChess||chess).find(c=>c.charId===o.charId&&c.skins?.length);if(old?.skins)r.skins=old.skins;else if(previousChess?.[id]?.charId===o.charId&&previousChess[id].skins)r.skins=previousChess[id].skins;chess[id]=r;
  if(suffix==='a')for(const bond of o.bonds)for(const k of ['members','visibleMembers'])if(bonds[bond]?.[k]&&!bonds[bond][k].includes(id))bonds[bond][k].push(id);
 }
 const tokens=await read(`${dir}/tokens.json`),generatedTokens=buildTokens(ctx,generated,result.tokenOwners,await read(`${dir}/enemies.json`));
 for(const key of ['token_10035_wisdel_wward'])if(generatedTokens[key]){tokens[key]=generatedTokens[key];tokens[key].placeable=false;tokens[key].noHeal=true;localizeToken(tokens[key],kr);}
 for(const [k,v] of Object.entries({chess,bonds,tokens}))await writeFile(`${dir}/${k}.json`,JSON.stringify(v));
 return ops;
}

import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {join} from 'node:path';
import {loadContext,buildChess,withPotentialData} from './build-data.mjs';
import {loadKorean,localizeOperator} from './ursus-korean.mjs';
export const OPERATORS=[
 ['earthspirit','char_183_skgoat','어스스피릿',1,0,['leithanienShip'],'gain',3],
 ['czerny','char_4047_pianst','체르니',2,1,['leithanienShip','steadShip'],'hp',.01],
 ['diamante','char_499_kaitou','디아만테',3,0,['leithanienShip','arcaneShip'],'burst',2],
 ['lessing','char_4011_lessng','레싱',3,1,['leithanienShip','raidShip'],'deploy',4],
 ['eyja','char_180_amgoat','에이야퍄들라',4,1,['leithanienShip','swiftShip'],'kill',3],
 ['bassline','char_4109_baslin','베이스라인',5,0,['leithanienShip'],'prep',2],
 ['viviana','char_4098_vvana','비비아나',5,2,['leithanienShip','skillfulShip','kazimierzShip'],'notes',2],
 ['ebenholz','char_4046_ebnhlz','에벤홀츠',6,2,['leithanienShip','arcaneShip'],'atk',.02],
];
export async function buildLeithanien(root=process.cwd(),dir=join(root,'.cache/leithanien-data')){
 await mkdir(dir,{recursive:true});
 for(const f of await readdir(join(root,'content/production/data')))if(f.endsWith('.json'))await copyFile(join(root,'content/production/data',f),join(dir,f));
 const read=async k=>JSON.parse(await readFile(join(dir,k+'.json'),'utf8'));
 const [chess,bonds,items,bands,garrisons,effects,choices,assets]=await Promise.all(['chess','bonds','items','bands','garrisons','effects','choices','assets'].map(read));
 const extra=await readFile(join(root,'.cache/leithanien-extra-assets.json'),'utf8').then(JSON.parse).catch(()=>null);
 if(extra){for(const [,id]of OPERATORS)if(extra.chars[id])assets.chars[id]=extra.chars[id];Object.assign(assets.skills,extra.skills);Object.assign(assets.skillsById,extra.skillsById);for(const k of ['bonds','items','bands'])for(const [id,v]of Object.entries(extra[k]||{}))if(id.includes('leithanien'))assets[k][id]=v;}
 const ctx=await loadContext({operatorsOnly:true}),kr=await loadKorean(root),act=ctx.act;
 for(const [i,o]of OPERATORS.entries()){
  const [key,charId,name,tier,skill,bondIds]=o;
  const tid=Object.keys(act.charShopChessDatas).find(id=>act.charShopChessDatas[id].chessLevel===tier&&act.charChessDataDict[id]&&!act.charShopChessDatas[id].isHidden&&act.charShopChessDatas[id].chessType!=='DIY');
  const template=act.charShopChessDatas[tid],normal=`chess_custom_leithanien_${key}_a`,golden=normal.replace(/_a$/,'_b');
  const moduleId=(ctx.uniequip.charEquip?.[charId]||[]).find(id=>ctx.uniequip.equipDict[id]?.type==='ADVANCED')||null;
  act.charShopChessDatas[normal]={...structuredClone(template),chessId:normal,goldenChessId:golden,charId,defaultSkillIndex:skill,defaultUniEquipId:moduleId,shopLevelSortId:110+i,isHidden:false,chessType:'NORMAL',backupCharId:null,backupCharUniEquipId:null};
  for(const [elite,id]of [[false,normal],[true,golden]]){
   const r=structuredClone(act.charChessDataDict[elite?template.goldenChessId:tid]);
   Object.assign(r,{chessId:id,identifier:11000+i*2+Number(elite),isGolden:elite,upgradeChessId:elite?null:golden,upgradeNum:elite?0:3,bondIds,garrisonIds:[`garrison_leithanien_${key}_${elite?'b':'a'}`]});
   const phases=ctx.charTable[charId].phases,phase=Math.min(Number(r.status.evolvePhase.replace('PHASE_','')),phases.length-1);
   Object.assign(r.status,{evolvePhase:`PHASE_${phase}`,charLevel:Math.min(r.status.charLevel,phases[phase].maxLevel),equipLevel:elite&&moduleId?3:0});act.charChessDataDict[id]=r;act.chessNormalIdLookupDict[id]=normal;
  }
 }
 const ranks=Array.from({length:6},(_,potRank)=>buildChess({...ctx,potRank}).chess),errs=[];
 for(const o of OPERATORS)for(const suffix of ['a','b']){
  const [key,charId,name,tier,skill,bondIds,trait,n]=o,id=`chess_custom_leithanien_${key}_${suffix}`,elite=suffix==='b',amount=key==='ebenholz'?(elite?.04:.02):n*(elite?2:1);
  const r=withPotentialData(ranks.map(c=>c[id]),id,errs);localizeOperator(r,kr,act.charChessDataDict[id].status);r.name=name;r.customKit=true;
  const existing=Object.values(chess).find(c=>c.charId===charId&&c.skins?.length);if(existing)r.skins=existing.skins;
  const text={gain:`<획득 시> [라이타니엔] 맹약의 중첩 수 +${amount}`,hp:`[라이타니엔] 맹약이 3회 중첩할 때마다 최대 HP +${amount*100}%`,atk:`[라이타니엔] 맹약이 3회 중첩할 때마다 공격력 +${amount*100}%`,burst:`<전투 중> 공격 범위 내 적의 쇠약 손상이 부여될 때마다 활성화된 [라이타니엔]/[아케인] 맹약의 중첩 수 각각 +${amount}/+${elite?2:1} (전투당 최대 5회)`,deploy:`<배치 시> 활성화된 [라이타니엔] 맹약의 중첩 수 +${amount} (전투당 최대 8회)`,kill:`<전투 중> 적을 처치할 때마다 활성화된 [라이타니엔]/[신속] 맹약의 중첩 수 각각 +${amount}/+${elite?4:2} (전투당 최대 5회)`,prep:`<휴식 기간 종료 시> 배치된 모든 [라이타니엔] 오퍼레이터의 활성화된 맹약 중첩 수 각각 +${amount}`,notes:`<전투 중> 자신이 '속세의 음'을 5회 적용할 때마다 활성화된 [라이타니엔]/[기민] 맹약의 중첩 수 각각 +${amount}/+${elite?2:1} (전투당 최대 10회)`}[trait];
  garrisons[r.garrisonIds[0]]={garrisonId:r.garrisonIds[0],name,desc:text,descRaw:text.replace(/\+\d+%?|속세의 음/g,'<@ba.vup>$&</>'),effectKey:`custom_leithanien_${trait}`,eventType:trait==='gain'?'SERVER_GAIN':trait==='prep'?'SERVER_PREP_FIN':'BATTLE',bb:{count:amount,...(trait==='burst'?{arcaneCount:elite?2:1}:{}),...(trait==='kill'?{swiftCount:elite?4:2}:{}),...(trait==='notes'?{skillfulCount:elite?2:1}:{})},bbStr:{},requireActive:trait!=='gain',owners:[id]};r.customTrait={effectKey:`custom_leithanien_${trait}`,bb:{count:amount,...(trait==='burst'?{arcaneCount:elite?2:1}:{}),...(trait==='kill'?{swiftCount:elite?4:2}:{}),...(trait==='notes'?{skillfulCount:elite?2:1}:{})}};chess[id]=r;
 }
 if(errs.length)throw Error(errs.join('\n'));
 for(const c of Object.values(chess))if(['char_426_billro','char_1016_agoat2'].includes(c.charId)&&!c.bonds.includes('leithanienShip'))c.bonds.push('leithanienShip');
 const members=Object.values(chess).filter(c=>!c.isGolden&&c.bonds.includes('leithanienShip')).map(c=>c.chessId);
 const desc="[라이타니엔] 오퍼레이터가 피해를 입힐 때마다 목표에게 5초간 '속세의 음' 부여 (동일 오퍼레이터가 동일 목표에게 부여 시 재발동 대기 시간 0.1초)\n'속세의 음': 매초 50 + 시전자 공격력의 1% (중첩당 +0.01%)에 해당하는 마법 대미지 (무한 중첩 가능, 지속시간 개별 적용)\n<전장에 서로 다른 [라이타니엔] 오퍼레이터 6명 배치> '속세의 음'이 적용된 적이 입히는 대미지 -25%, 이동 속도 -25%, '속세의 음' 지속시간 +5초 (중첩 수에 따라 변경, 25회 중첩할 때마다 +1초)";
 const descRaw=desc.replace(/속세의 음|5초|50|1%|0\.01%|5%|\+0\.01%|\+20%|-25%|\+0\.25%|\+1초/g,'<@ba.vup>$&</>').replace('6명 배치','<@ba.vup>6</>명 배치');
 const effectDesc=desc.replace('1% (중첩당 +0.01%)','{0:0.00%}').replace('+5초 (중첩 수에 따라 변경, 25회 중첩할 때마다 +1초)','+{leithDurationBonus}초 (기본 +5초, 중첩 보너스 +{leithDurationStacks}초)');
 const effectDescRaw=effectDesc.replace(/속세의 음|5초|50|1%|0\.01%|5%|\+0\.01%|-25%|\{0:0.00%\}|\+\{[^}]+\}(?:초)?/g,'<@ba.vup>$&</>').replace('6명 배치','<@ba.vup>6</>명 배치');
 bonds.leithanienShip={...structuredClone(bonds.yanShip),bondId:'leithanienShip',customExtension:true,name:'라이타니엔',identifier:110,powerIdList:['leithanien'],iconId:'icon_leithanienShip',thresholds:[3,6],activeCount:3,members,visibleMembers:members,desc,descRaw,effectName:'속세의 음',effectId:'bondeffect_leithanien',effectDesc,effectDescRaw,effectDescParams:[{index:0,format:'0.00%',base:'base_note_damage',perStack:'note_damage_per_stack'}],bb:{base_note_damage:.01,note_damage_per_stack:.0001,base_note_flat:50},bbStr:{},buffs:[],baseParams:['base_note_damage'],perStackParams:['note_damage_per_stack'],spec:{tiers:[{count:3},{count:6}]}};
 for(const [id,b]of Object.entries(bonds))for(const o of OPERATORS)if(o[5].includes(id))for(const k of ['members','visibleMembers'])if(b[k]&&!b[k].includes(`chess_custom_leithanien_${o[0]}_a`))b[k].push(`chess_custom_leithanien_${o[0]}_a`);
 for(const suffix of ['a','b'])for(const advanced of [false,true]){
  const elite=suffix==='b',base=`chess_item_custom_leithanien_${advanced?'score':'bell'}`,id=base+'_'+suffix,rec=structuredClone(items[`chess_item_1_01_e_${suffix}`]);
  const desc=advanced?`착용자가 입히는 마법 피해 +${elite?60:40}%\n[라이타니엔] 오퍼레이터 장착 시: 스킬 발동 시 전장의 모든 적에게 '속세의 음' 1회 적용\n'의식용 종'과 함께 장착 시: 배치된 모든 [라이타니엔] 오퍼레이터가 위 효과 획득`:`공격 속도 +${elite?35:20}`;
  Object.assign(rec,{id,baseId:base+'_a',goldenId:base+'_b',upgradeChessId:elite?null:base+'_b',identifier:11200+Number(advanced)*2+Number(elite),tier:advanced?6:2,price:advanced?4:1,shopSortId:110+Number(advanced),name:advanced?'낡은 악보 조각':'의식용 종',effectName:advanced?'낡은 악보 조각':'의식용 종',trapId:advanced?'leithanien_score':'leithanien_bell',iconId:advanced?'leithanien_score':'leithanien_bell',giveBondId:advanced?null:'leithanienShip',effectId:'eff_custom_leithanien',source:{relicId:advanced?'rogue_1_relic_r07':'rogue_3_relic_res_9',mode:'Integrated Strategies',effects:'custom'},desc,descRaw:desc.replaceAll('속세의 음','<@ba.vup>속세의 음</>'),params:{},buffs:advanced?[]:[{key:'attr_common_global_buff',bb:{attack_speed:elite?35:20},bbStr:{key:'attr_common_global_buff'}}]});items[id]=rec;
 }
 const bd='[황역] <라이타니엔> 맹약 40중첩마다 다음 휴식 기간 진입 시 상점 등급 이하의 무작위 <라이타니엔> 오퍼레이터 1명 획득 (라운드당 최대 1회)';
 bands.band_custom_leithanien_witchking={...structuredClone(bands.band_bldsk),bandId:'band_custom_leithanien_witchking',name:'위치킹',totalHp:24,sortId:110,iconId:'icon_custom_leithanien_witchking',effectId:'effect_custom_leithanien_witchking',effectName:'황역',desc:bd,descRaw:bd,bondIds:['leithanienShip'],buffs:[{key:'custom_leithanien_reward',bb:{},bbStr:{}}],params:{}};
 const ef=structuredClone(effects.allybuff_select_2_1),eid='allybuff_custom_leithanien_oath',ed='[라이타니엔]/[신속]/[아케인] 맹약의 중첩 수 각각 +8/+8/+8\n다른 아군이 있으면 해당 아군도 획득';
 Object.assign(ef,{effectId:eid,name:'에벤홀츠의 맹세',desc:ed,descRaw:ed,params:{count:8,bond_list:'leithanienShip,swiftShip,arcaneShip'}});ef.buffs[0].bb={count:8};ef.buffs[0].bbStr={bond_list:ef.params.bond_list};effects[eid]=ef;choices.cards.tactic.push({effectId:eid,name:ef.name,desc:ed,kind:'ally',stageId:null,team:true});
 for(const [k,v]of Object.entries({chess,bonds,items,bands,garrisons,effects,choices,assets}))await writeFile(join(dir,k+'.json'),JSON.stringify(v));
 console.log('Local Leithanien catalogue:',dir);
}
if(process.argv[1]?.endsWith('build-leithanien.mjs'))await buildLeithanien();

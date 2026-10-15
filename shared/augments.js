import {AUGMENT_ITEM_NAMES} from './augmentItemNames.js';
import {AUGMENT_SOURCES} from './augmentSources.js';
import {CHAT_FACTIONS} from './chat.js';
export const AUGMENT_ROUNDS=Object.freeze([4,7,10]);
export const AUGMENT_GRADES=Object.freeze({silver:{name:'실버',probability:.25,color:'#b9c8cd'},gold:{name:'골드',probability:.5,color:'#efc866'},prism:{name:'프리즘',probability:.25,color:'#bf9bf4'}});
export function rollAugmentGrade(rng,history=[],weights={silver:25,gold:50,prism:25}){const silver=history.slice(-2).length===2&&history.slice(-2).every(g=>g==='silver')?0:weights.silver,gold=weights.gold,prism=weights.prism,total=silver+gold+prism;if(!total)return 'gold';const value=rng()*total;return value<silver?'silver':value<silver+gold?'gold':'prism';}
const BASIC_NAMES={...Object.fromEntries(CHAT_FACTIONS.map(f=>[f.bondId,f.name])),skillfulShip:'기민',deputShip:'조력',visiShip:'예견',miraShip:'기적',investShip:'투자자',maniShip:'조화',soloShip:'독행',suntShip:'궁극기',steadShip:'고수',indomShip:'불굴',preciShip:'정밀',swiftShip:'신속',arcaneShip:'아케인',raidShip:'기습'};
const ADVANCED={yanShip:'chess_item_6_03_e_a',victoriaShip:'chess_item_4_09_e_a',egirShip:'chess_item_6_04_e_a',lateranoShip:'chess_item_6_02_e_a',sargonShip:'chess_item_6_07_e_a',kjeragShip:'chess_item_6_06_e_a',siracusaShip:'chess_item_6_11_e_a',kazimierzShip:'chess_item_6_10_e_a',ursusShip:'chess_item_custom_ursus_favor_a',leithanienShip:'chess_item_custom_leithanien_score_a'};
const ITEM_GRANTS={도박:['chess_item_3_12_e_a'],페가수스:['chess_item_5_09_e_a','chess_item_6_01_e_a'],'이샤믈라의 축복':['chess_item_5_08_e_a'],신병:['chess_item_6_08_e_a','chess_item_5_05_e_a'],'뮤엘시스의 지원':['chess_item_6_09_e_a'],'박사의 머리':['chess_item_5_06_e_a'],인력사무소:['chess_item_5_04_e_a'],대발견:['chess_item_4_01_e_a'],'부재중 전화':['chess_item_2_06_e_a']};
const number=s=>Number(s.match(/[+-]?\d+(?:\.\d+)?/)?.[0]||0);
const starterCache=new WeakMap();
function starterFamilies(data,maxTier){
 let cache=starterCache.get(data);if(!cache){cache=new Map();starterCache.set(data,cache);}if(cache.has(maxTier))return cache.get(maxTier);
 const byBond=new Map(Object.keys(data.bonds||{}).map(id=>[id,Array.from({length:maxTier},()=>[])]));
 for(const [id,c]of Object.entries(data.chess||{})){
  if(c.isGolden||c.isHidden||c.isDiy||c.optionalRecruit||c.visible===false||c.tier<1||c.tier>maxTier)continue;
  for(const bond of c.bonds||[])byBond.get(bond)?.[c.tier-1].push(id);
 }
 const families=[...byBond].filter(([,tiers])=>tiers.every(ids=>ids.length)).map(([bondId,tiers])=>({bondId,tiers}));cache.set(maxTier,families);return families;
}
function effectOf(source,dataForStarter={}){
 const {name,description,side}=source,n=number(description),base=name.replace(/ (?:I|II|III)$/,'');
 if(base.startsWith('아군 ')){const label=base.slice(3),value=Math.abs(n),keys={'공격력 감소':'atkPct','HP 감소':'hpPct','방어력 감소':'defPct','마법 저항 감소':'resFlat','공격 속도 감소':'aspd'};if(label==='지속 피해')return {kind:'alliedDrain',amount:value};const key=keys[label];if(key)return {kind:'alliedDebuff',mods:{[key]:-value/(key.endsWith('Pct')?100:1)}};}
 const key={'공격력 증가':'atkPct','HP 증가':'hpPct','방어력 증가':'defPct','마법 저항 증가':'resFlat','공격 속도 증가':'aspd','SP 회복 증가':'spRecoveryFlat','이동 속도 증가':'moveMul'}[base];
 if(key)return {kind:'stats',mods:{[key]:key.endsWith('Pct')?n/100:key==='moveMul'?1+n/100:n}};
 if(base==='야수의 심장')return {kind:'beastHeart',count:10};
 if(base==='우리들의 빛')return {kind:'gainTrait'};
 if(base==='레벨 업')return {kind:'freeUpgrade',amount:3};
 if(base==='캐서린의 지원')return {kind:'hammerGrant',count:{silver:2,gold:4,prism:7}[source.grade],items:Object.keys(AUGMENT_ITEM_NAMES).filter(id=>id.endsWith('_a')&&id!=='chess_item_1_01_e_a'&&AUGMENT_ITEM_NAMES[id].endsWith('빅토리아 해머')&&dataForStarter.items?.[id])};
 if(base==='골리앗')return {kind:'playerHp',amount:n};
 if(base==='회피')return {kind:'stats',mods:{dodgePhys:n/100,dodgeArts:n/100}};
 if(base==='라이타니엔')return {kind:'leithanienNote'};
 if(base==='쉐라그')return {kind:'kjerag',bonus:.8,chance:.15,duration:3};
 if(base==='강타')return {kind:'skillAtk',amount:Number(description.match(/([\d.]+)%/)?.[1]||0)/100,duration:5};
 if(base==='시라쿠사')return {kind:'stealth'};
 if(base==='카란의 눈')return {kind:'normalEnemy',flags:{reveal:true}};
 if(base==='조화')return {kind:'harmony'};
 if(base==='중첩'){const nums=[...description.matchAll(/\d+/g)].map(m=>Number(m[0]));return {kind:'layers',core:nums[0],aux:nums[1]};}
 if(base==='대격변')return {kind:'recast'};
 if(base==='빅토리아')return {kind:'equipmentAtk',amount:Number(description.match(/([\d.]+)%/)?.[1]||0)/100};
 if(base==='피해 증가')return {kind:'stats',mods:{dmgDealtMul:n/100}};
 if(base==='무사')return {kind:'attackHeal',amount:n};
 if(base==='스타터 팩'){const maxTier=Math.max(...[...description.matchAll(/\d+/g)].map(m=>Number(m[0])));return {kind:'starterPack',maxTier,families:starterFamilies(dataForStarter,maxTier)};}
 if(ITEM_GRANTS[base])return {kind:'items',items:ITEM_GRANTS[base],count:base==='도박'?{silver:1,gold:2,prism:4}[source.grade]:{'페가수스':2,'이샤믈라의 축복':2,'신병':1,'뮤엘시스의 지원':2,'박사의 머리':3,'인력사무소':4,'대발견':5,'부재중 전화':8}[base]};
 const effects={'새로고침 지원':{kind:'refresh',count:n},감속:{kind:'normalEnemy',mods:{moveMul:1-Math.abs(n)/100}},약화:{kind:'normalEnemy',mods:{atkMul:1-Math.abs(n)/100}},신속:{kind:'skillSp',amount:n},기습:{kind:'deployAspd',amount:source.grade==='gold'?40:80,duration:30},정밀:{kind:'stats',opsOnly:true,mods:{defIgnorePct:n/100,resIgnorePct:n/100}},'약점 공격':{kind:'weakness',mods:{atkPct:.15}},'아츠 마스터':{kind:'spCost',multiplier:1-Math.abs(n)/100},소드마스터:{kind:'extraAttack',probability:n/100},알뜰살뜰:{kind:'income',amount:n},예견:{kind:'price',amount:1,maxTier:3},사르곤:{kind:'skillAspd',amount:12,cap:300,duration:15},헤드헌팅:{kind:'chess',tier:6,count:Number(description.match(/(\d+)명/)?.[1]||1)},부식:{kind:'corrosion',perHit:.01,cap:.5},'원소 피해 증가':{kind:'elemental',multiplier:1+n/100},실드:{kind:'shields',count:n},'상태이상 증가':{kind:'statusDuration',multiplier:1+n/100},재생:{kind:'regen',amount:n},극복:{kind:'silenceImmune'},돌파:{kind:'leak',amount:1}};
 if(!effects[base])throw Error(`Unknown augment: ${side} ${name}`);
 return effects[base];
}
export function createAugmentCatalog(data,round){
 const out=[];const baseSources=AUGMENT_SOURCES.filter(s=>s.rounds.includes(round));
 for(const s of baseSources){
  const prefix=`augment_${s.side}_${s.grade}_`;
  if(s.name.startsWith('(맹약 이름)')){
   const equipment=s.name.includes('장비');
   for(const [bondId,bond]of Object.entries(data.bonds||{})){
    if(bondId==='maniShip')continue;
    let effect,description;
    if(equipment){
     const basic=Object.entries(data.items||{}).filter(([,i])=>!i.isGolden&&i.giveBondId===bondId&&i.itemType==='EQUIP').sort((a,b)=>a[1].tier-b[1].tier)[0]?.[0],advanced=ADVANCED[bondId];
     if(!basic||s.grade!=='silver'&&(!bond.isCore||!data.items?.[advanced]))continue;
     effect={kind:'items',items:s.grade==='silver'?[basic]:s.grade==='gold'?[advanced]:[advanced,basic],counts:s.grade==='prism'?[1,2]:[s.grade==='silver'?2:1]};
     description=effect.items.map((id,i)=>`${AUGMENT_ITEM_NAMES[id]||data.items[id].name} ${effect.counts[i]}개`).join('와 ')+' 획득';
    }else{
     const tier=Number(s.description.match(/(\d)등급/)?.[1]),candidates=Object.entries(data.chess||{}).filter(([,c])=>!c.isGolden&&!c.isHidden&&!c.isDiy&&!c.optionalRecruit&&c.visible!==false&&c.tier===tier&&(c.bonds||[]).includes(bondId)).map(([id])=>id);
     if(!candidates.length)continue;
     const count=s.grade==='prism'?2:1;effect={kind:'chess',tier,count,bondId,candidates};description=`무작위 ${tier}등급 [${BASIC_NAMES[bondId]||bond.name}] 오퍼레이터 ${count}명 획득`;
    }
    const suffix=s.grade==='silver'?'I':s.grade==='gold'?'II':'III',name=`${BASIC_NAMES[bondId]||bond.name} ${equipment?'장비 지원':'지원'} ${suffix}`;
    out.push({id:prefix+(equipment?'equipment_':'support_')+bondId,name,grade:s.grade,side:s.side,rounds:s.rounds,description,bondId,iconBond:bondId,effect});
   }
  }else out.push({id:prefix+(s.identity??s.source),name:s.name,grade:s.grade,side:s.side,rounds:s.rounds,description:s.description,notes:s.notes,...(s.name==='라이타니엔'?{bondId:'leithanienShip'}:{}),iconBond:({...Object.fromEntries(Object.entries(BASIC_NAMES).map(([id,name])=>[name,id])),신속:"swiftShip",기습:"raidShip",정밀:"preciShip",예견:"visiShip",사르곤:"sargonShip",시라쿠사:"siracusaShip",조화:"maniShip"})[s.name.replace(/ (?:I|II|III)$/,"")]||null,effect:effectOf(s,data)});
 }
 return out;
}
export function augmentView(a){return {id:a.id,name:a.name,grade:a.grade,side:a.side,description:a.description,iconBond:a.iconBond||null,kind:a.effect.kind,icon:augmentIcon(a)};}
/** Exclude shown cards for this player/team; exhaustion resets only eligible history, never permits duplicate slots. */
export function drawAugmentCard(candidates,seen,current,rng){const held=new Set(current.filter(Boolean).map(a=>a.id));let pool=candidates.filter(a=>!held.has(a.id)&&!seen.has(a.id));if(!pool.length){for(const a of candidates)if(!held.has(a.id))seen.delete(a.id);pool=candidates.filter(a=>!held.has(a.id));}if(!pool.length)return null;const card=pool[Math.min(pool.length-1,Math.floor(rng()*pool.length))];seen.add(card.id);return card;}

/** Original Contingency Contract rune glyphs, selected by the actual augment effect. */
export function augmentIcon(a){
 const e=a.effect||{},key=Object.keys(e.mods||{})[0];
 const stats={atkPct:a.side==='enemy'?'g_enemy_atk_1':'g_char_atk_p1',hpPct:a.side==='enemy'?'g_enemy_hp_1':'g_char_hp_1',defPct:a.side==='enemy'?'g_enemy_def_1':'g_char_def_1',resFlat:'g_enemy_magical_reduction_1',aspd:a.side==='enemy'?'g_enemy_attackspeed_1':'g_char_atkspeed_p1',dmgDealtMul:'g_char_magicdamage_1',spRecoveryFlat:'g_char_sp_reduce_1',moveMul:'g_enemy_movespeed_1',defIgnorePct:'g_enemy_def_1',dodgePhys:'g_tsz_hp_immune_1'};
 const kinds={beastHeart:'g_char_tile_summon_1',gainTrait:'g_global_costrecovery_1',freeUpgrade:'g_global_costrecovery_1',hammerGrant:'g_char_atk_p1',playerHp:'g_char_hp_1',skillAtk:'g_char_atk_p1',items:'g_extra_cost_1',chess:'g_char_tile_summon_1',refresh:'g_global_costrecovery_1',normalEnemy:key==='moveMul'?'g_enemy_movespeed_1':'g_enemy_atk_1',skillSp:'g_char_sp_reduce_1',deployAspd:'g_char_deploy_attribute_add_1',weakness:'g_char_magicdamage_1',spCost:'g_char_sp_reduce_1',extraAttack:'g_char_atk_p1',income:'g_extra_cost_1',starterPack:'g_char_tile_summon_1',layers:'g_global_costrecovery_1',attackHeal:'g_zom_hprec_1',stealth:'g_tsz_hp_immune_1',harmony:'g_global_costrecovery_1',alliedDebuff:key==='resFlat'?'g_enemy_magical_reduction_1':key==='aspd'?'g_char_atkspeed_p1':key==='hpPct'?'g_enemy_hp_1':key==='defPct'?'g_char_def_1':'g_char_atk_p1',alliedDrain:'g_zom_hprec_1',recast:'g_char_tile_summon_1',equipmentAtk:'g_char_atk_p1',price:'g_char_cost_pioneer_1',skillAspd:'g_gx_char_attackspeed_1',corrosion:'g_ly_defres_1',elemental:'g_enemy_element_res_1',shields:'g_enemy_block_dmgreduce_1',statusDuration:'g_char_deploy_stun_1',regen:'g_zom_hprec_1',silenceImmune:'g_tsz_hp_immune_1',leak:'g_lyfrog_hplife_1'};
 return '/assets/custom/augments/'+(e.kind==='stats'?stats[key]:kinds[e.kind]||'g_extra_cost_1')+'.png';
}

/** Bounded history metadata for match records; executable effects never come from imported records. */
export function recordAugments(raw){
 if(!raw||typeof raw!=='object')return null;
 const text=(v,max)=>typeof v==='string'?v.slice(0,max):'';
 const history=(Array.isArray(raw.history)?raw.history:[]).filter(g=>Object.hasOwn(AUGMENT_GRADES,g)).slice(0,3);
 const picks=(Array.isArray(raw.picks)?raw.picks:[]).slice(0,32).flatMap(p=>{
  const a=p?.augment;if(!AUGMENT_ROUNDS.includes(p?.round)||!a||!Object.hasOwn(AUGMENT_GRADES,a.grade)||!['ally','enemy'].includes(p.side))return [];
  return [{round:p.round,grade:a.grade,side:p.side,playerId:text(p.playerId,128),augment:{id:text(a.id,128),name:text(a.name,80),grade:a.grade,side:p.side,description:text(a.description,2048),iconBond:/^[A-Za-z0-9_]+$/.test(a.iconBond||"")?text(a.iconBond,64):null,icon:typeof a.icon==='string'&&/^\/assets\/custom\/augments\/[A-Za-z0-9_-]+\.png$/.test(a.icon)?a.icon:null}}];
 });return {history,picks};
}

export function augmentEffectEntries(allies=[],enemies=[]){
 const entries=new Map();
 for(const [side,cards]of [['ally',allies],['enemy',enemies]])for(const card of cards){
  const a=card.effect?augmentView(card):card,id='augment:'+side+':'+a.id,entry=entries.get(id);
  if(entry){entry.counter=(entry.counter||1)+1;continue;}
  entries.set(id,{id,name:a.name,desc:a.description,iconKind:'augment',iconId:a.icon,iconBond:a.iconBond||null,grade:a.grade,counterText:side==='ally'?'아군 증강':'모든 적에게 적용'});
 }
 return [...entries.values()];
}

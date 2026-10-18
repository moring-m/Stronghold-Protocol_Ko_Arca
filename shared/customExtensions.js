import {withLaboratoryDummy,LAB_DUMMY_BOSS} from './laboratoryDummy.js';
import {RANDOM_BAND_ID,withRandomBands} from './randomBand.js';
import {eightUniteStage} from './cooperativeEight.js';
import { customFactionData, filterCustomFaction } from './customFactions.js';

export const RULE_VALUES = Object.freeze([
 {id:"augmentEnemyVote",name:"적 증강 선택 방식",category:"augments",default:0,min:0,max:1,step:1,unit:"",options:[{value:0,label:"방장 선택"},{value:1,label:"참가자 투표"}]},
 ...[["augmentSilver","실버 가중치",1,1000],["augmentGold","골드 가중치",2,1000],["augmentPrism","프리즘 가중치",1,1000],["augmentAllyRerolls","아군 리롤",1,10],["augmentEnemyRerolls","적 리롤",1,10]].map(([id,name,value,max])=>({id,name,category:"augments",default:value,min:0,max,step:1,unit:id.includes("Rerolls")?"회":""})),
 {id:'normalBattleTime',name:'일반 라운드 전투 시간',default:0,min:0,max:1800,step:1,unit:'초'},
 {id:'bossBattleTime',name:'보스 라운드 전투 시간',default:120,min:1,max:3600,step:1,unit:'초'},
 {id:'bossBattleSpeed',name:'보스전 진행 속도',default:1,min:1,max:2,step:1,unit:'',options:[{value:1,label:'1배속'},{value:2,label:'2배속 (시간 포함)'}]},
 {id:'maxDamage',name:'보스 단일 피해 상한',default:300000,min:0,step:10000,unit:''},
 {id:'stockPlayers',name:'상점 재고',default:0,min:-1,max:8,step:1,unit:'',options:[{value:0,label:'자동 (최대 4인 기준)'},...Array.from({length:8},(_,i)=>({value:i+1,label:`${i+1}인 기준`})),{value:-1,label:'무제한'}]},
 ...[['allyHp','최대 HP'],['allyAtk','공격력'],['allyDef','방어력'],['allyRes','마법 저항'],['allyAspd','공격 속도'],['allyBat','공격 간격'],['allyBlock','저지 수'],['allyCost','배치 비용'],['allyRedeploy','재배치 시간'],['allySpCost','최대 SP'],['allyInitSp','초기 SP'],['allySpRecovery','SP 회복 속도']].map(([id,name])=>({id,name,category:'allies',default:100,min:['allyHp','allyAspd','allyBat','allySpCost'].includes(id)?1:0,step:1,unit:'%'})),
 {id:'roundCount',name:'일반 라운드 수',default:13,min:1,max:100,step:1,unit:'라운드'},
 {id:'deployCap',name:'배치 수 제한',default:8,min:4,max:12,step:1,unit:'명'},
 ...[['enemyHp','적 최대 HP'],['enemyAtk','적 공격력'],['enemyDef','적 방어력'],['enemyRes','적 마법 저항'],['enemySpeed','적 이동 속도'],['enemyAspd','적 공격 속도']].map(([id,name])=>({id,name,default:100,min:id==='enemyHp'||id==='enemyAspd'?1:0,step:1,unit:'%'})),
 ...[['bossHp','보스 최대 HP'],['bossAtk','보스 공격력'],['bossDef','보스 방어력'],['bossRes','보스 마법 저항'],['bossSpeed','보스 이동 속도'],['bossAspd','보스 공격 속도']].map(([id,name])=>({id,name,category:'bossStats',default:100,min:['bossHp','bossAspd'].includes(id)?1:0,step:1,unit:'%'})),
]);
export function normalizeRuleValues(value={}) {
 return Object.fromEntries(RULE_VALUES.map(r=>[r.id,Number.isFinite(value?.[r.id])?Math.max(r.min,Math.min(r.max??Number.MAX_SAFE_INTEGER,Math.round(value[r.id]))):r.default]));
}
export function recordCustomExtensions(value) {
 if (!value || typeof value!=='object') return null;
 const out={};
 for(const {id} of EXTENSION_CATEGORIES) if(Array.isArray(value[id])) {const ids=[...new Set(value[id].filter(x=>typeof x==='string'&&x.length&&x.length<=128))].slice(0,64);if(ids.length)out[id]=ids;}
 const numbers=normalizeRuleValues(value.ruleValues);
 const changed=Object.fromEntries(RULE_VALUES.filter(r=>numbers[r.id]!==r.default).map(r=>[r.id,numbers[r.id]]));
 if(Object.keys(changed).length)out.ruleValues=changed;
 return Object.keys(out).length?out:null;
}
export function extensionSelectionCount(selection){
 const saved=recordCustomExtensions(selection);if(!saved)return 0;
 const augmentsEnabled=selection?.rules?.includes('augments');
 return Object.entries(saved).reduce((n,[key,value])=>n+(Array.isArray(value)?value.length:Object.keys(value).filter(id=>augmentsEnabled||RULE_VALUES.find(r=>r.id===id)?.category!=='augments').length),0);
}
export const EXTENSION_CATEGORIES = Object.freeze([
  {id:'rules',name:'게임 규칙'}, {id:'augmentSettings',name:'증강 설정'}, {id:'commonBands',name:'공통 적용 전략'}, {id:'allies',name:'아군 스펙 조정'}, {id:'bossStats',name:'보스 스펙 조정'},
  { id: 'bonds', name: '맹약 추가' }, { id: 'stages', name: '전장 추가' },
  {id:'forcedBonds',name:'맹약 금지'}, {id:'protectedBonds',name:'맹약 밴 제외'},
  {id:'forcedAuxBonds',name:'보조맹약 금지'}, {id:'protectedAuxBonds',name:'보조맹약 밴 제외'},
  {id:'bannedOperators',name:'오퍼레이터 밴'}, {id:'disabledBonds',name:'맹약 비활성화'}, {id:'disabledStages',name:'맵 비활성화'},
  {id:'disabledBosses',name:'보스 비활성화'}, {id:'disabledBands',name:'전략 비활성화'},
]);
export function isCustomStage(id, stage) {
  return id.startsWith('custom_') || stage?.customExtension === true || stage?.customExtension?.category === 'stages';
}
export const isBannableOperator = c => !!c && !!c.visible && !c.isGolden && !c.isHidden && !c.isDiy && !c.optionalRecruit && c.globalReleased !== false;
export function customExtensionCatalog(raw = {}) {
  const banCatalog=Object.entries(raw.bonds||{}).filter(([,b])=>b.isCore&&Number(b.weight)>0).map(([id,b])=>({id,name:b.name||id}));
  const auxCatalog=Object.entries(raw.bonds||{}).filter(([,b])=>!b.isCore&&Number(b.weight)>0).map(([id,b])=>({id,name:b.name||id}));
  return {
    bannedOperators:Object.entries(raw.chess||{}).filter(([,c])=>isBannableOperator(c)).sort(([a,x],[b,y])=>(x.tier||0)-(y.tier||0)||(x.shopSortId||0)-(y.shopSortId||0)||a.localeCompare(b)).map(([id,c])=>({id,name:c.name||id,description:'이번 게임의 상점과 오퍼레이터 획득 대상에서 제외합니다.'})),
    augmentSettings:[],allies:[],bossStats:[],commonBands:Object.entries(raw.bands||{}).filter(([id])=>id!==RANDOM_BAND_ID).map(([id,b])=>({id,name:b.name||id,description:b.desc||''})),
    rules:[{id:'augments',name:'증강 모드',description:'4·7·10라운드에 아군·적 증강을 선택합니다.'},{id:'unlimitedHpLoss',name:'HP 감소 상한 해제',description:'한 라운드에 감소하는 HP의 10 상한을 해제합니다.'},{id:'sharedHp',name:'아군 HP 공유',description:'모든 참가자의 HP를 합산해 공유합니다. 전투 종료 시 감소 예정 HP를 합산해 차감합니다.'},{id:'scarecrow',name:'허수아비 모드',description:'일반 보스와 히든 보스를 공격하지 않는 제셀톤 윌리엄스로 교체합니다.'},{id:'unlimitedLayers',name:'중첩 상한선 해제',description:'맹약의 999중첩 상한선을 해제합니다.'},{id:'defaultHarmony',name:'조화 기본 활성화',description:'조화 오퍼레이터가 없어도 조화 맹약을 활성화합니다.'},{id:'duplicateBands',name:'전략 중복 선택 허용',description:'여러 참가자가 같은 전략을 선택할 수 있습니다.'}],
    forcedAuxBonds:auxCatalog,protectedAuxBonds:auxCatalog,
    forcedBonds:banCatalog,protectedBonds:banCatalog,
    disabledBonds:Object.entries(raw.bonds||{}).filter(([,b])=>b.isCore).map(([id,b])=>({id,name:b.name||id,description:b.isCore?'핵심 맹약':'추가 맹약'})),
    disabledStages:[...new Set([...Object.values(raw.config?.modes||{}).flatMap(m=>m.stages||[]),...Object.keys(raw.stages||{}).filter(id=>isCustomStage(id,raw.stages[id]))])].filter(id=>raw.stages?.[id]).map(id=>({id,name:raw.stages[id].name||id,description:'게임의 전장 추첨에서 제외합니다.'})),
    disabledBosses:Object.entries(raw.bosses||{}).map(([id,b])=>({id,name:b.name||id,description:b.hidden?'히든 보스':'일반 보스'})),
    disabledBands:Object.entries(raw.bands||{}).filter(([id])=>id!==RANDOM_BAND_ID).map(([id,b])=>({id,name:b.name||id,description:'전략 선택에서 제외합니다.'})),
    bonds: [...(raw.bonds?.leithanienShip?[{id:'leithanien',name:'라이타니엔',description:'속세의 음 맹약과 오퍼레이터, 전용 장비, 위치킹 전략을 추가합니다.'}]:[]), { id: 'ursus', name: '우르수스', description: '우르수스 맹약과 오퍼레이터, 전용 장비, 카셰이 전략을 추가합니다.' }],
    stages: Object.entries(raw.stages || {}).filter(([id,s]) => isCustomStage(id,s)).map(([id,s]) => ({
      id, name: s.name || id, description: s.customExtension?.description || '선택하면 이번 게임의 전장 추첨 목록에 추가됩니다.',
    })),
  };
}
export function extensionSelectionShape(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(k => (k === 'ruleValues' || EXTENSION_CATEGORIES.some(c => c.id === k)))
    && (value.ruleValues === undefined || (value.ruleValues && typeof value.ruleValues === 'object' && !Array.isArray(value.ruleValues) && Object.entries(value.ruleValues).every(([id,n])=>{const r=RULE_VALUES.find(r=>r.id===id);return r&&Number.isSafeInteger(n)&&n>=r.min&&(r.max===undefined||n<=r.max);})))
    && EXTENSION_CATEGORIES.every(c => value[c.id] === undefined || (Array.isArray(value[c.id]) && value[c.id].length <= 64
      && value[c.id].every(id => typeof id === 'string' && id.length > 0 && id.length <= 128)
      && new Set(value[c.id]).size === value[c.id].length));
}
export function normalizeCustomExtensions(value, raw, legacy = false) {
  const catalog = customExtensionCatalog(raw);
  let input = value === undefined ? { bonds: legacy ? ['ursus'] : [] } : value || {};
  if(input.rules?.includes('unlimitedStock'))input={...input,ruleValues:{...input.ruleValues,stockPlayers:-1}};
  return {...(input.ruleValues?{ruleValues:normalizeRuleValues(input.ruleValues)}:{}),...Object.fromEntries(EXTENSION_CATEGORIES.map(c => [c.id, catalog[c.id].map(e => e.id).filter(id => input[c.id]?.includes(id))]).filter(([id,ids])=>['bonds','stages'].includes(id)||ids.length))};
}
/** Isolated match tables: only enabled and non-excluded content enters gameplay. */
export function applyCustomExtensions(raw, selection) {
  if(selection.rules?.includes('unlimitedStock'))selection={...selection,ruleValues:{...selection.ruleValues,stockPlayers:-1}};
  if(selection.rules?.includes('scarecrow'))raw=withLaboratoryDummy(raw);
  raw={...raw,bands:withRandomBands(raw.bands)};
  const enabled = selection.bonds.includes('ursus') && !(selection.disabledBonds||[]).includes('ursusShip');
  let data = customFactionData(raw, enabled);
  data=filterCustomFaction(data,'leithanien','leithanienShip',selection.bonds.includes('leithanien')&&!(selection.disabledBonds||[]).includes('leithanienShip'));
  const commonBandRecords=Object.fromEntries((selection.commonBands||[]).filter(id=>data.bands[id]&&id!==RANDOM_BAND_ID).map(id=>[id,data.bands[id]]));
  const denied=new Set((selection.disabledBonds||[]).filter(id=>raw.bonds?.[id]?.isCore));
  const chess=Object.fromEntries(Object.entries(data.chess||{}).filter(([,c])=>{const core=(c.bonds||[]).filter(b=>data.bonds?.[b]?.isCore);return !core.some(b=>denied.has(b))||core.some(b=>!denied.has(b));}).map(([id,c])=>[id,{...c,bonds:(c.bonds||[]).filter(b=>!denied.has(b))}]));
  data={...data,chess,bonds:Object.fromEntries(Object.entries(data.bonds||{}).filter(([id])=>!denied.has(id)).map(([id,b])=>[id,{...b,members:b.members?.filter(x=>chess[x]),visibleMembers:b.visibleMembers?.filter(x=>chess[x])}])),items:Object.fromEntries(Object.entries(data.items||{}).filter(([,i])=>!denied.has(i.giveBondId))),bands:Object.fromEntries(Object.entries(data.bands||{}).filter(([id,b])=>(id===RANDOM_BAND_ID||!(selection.disabledBands||[]).includes(id))&&!(b.bondIds||[]).some(x=>denied.has(x)))),bosses:Object.fromEntries(Object.entries(data.bosses||{}).filter(([id])=>(selection.rules?.includes('scarecrow')&&id===LAB_DUMMY_BOSS||!(selection.disabledBosses||[]).includes(id))))};
  const bannedEnemyKeys=new Set((selection.disabledBosses||[]).map(id=>raw.bosses?.[id]?.enemyKey).filter(id=>id&&!Object.values(data.bosses).some(b=>b.enemyKey===id)));
  data.enemies=Object.fromEntries(Object.entries(data.enemies||{}).filter(([id])=>!bannedEnemyKeys.has(id)));
  const chosen = new Set(selection.stages);
  const stages = Object.fromEntries(Object.entries(raw.stages || {}).filter(([id,s]) => (!isCustomStage(id,s) || chosen.has(id)) && !(selection.disabledStages||[]).includes(id)));
  const modes = Object.fromEntries(Object.entries(raw.config?.modes || {}).map(([id,m]) => [id, {
    ...m, activeBondIds:(m.activeBondIds||[]).filter(id=>!denied.has(id)),inactiveBondIds:(m.inactiveBondIds||[]).filter(id=>!denied.has(id)),bossWeights:Object.fromEntries(Object.entries(m.bossWeights||{}).filter(([id])=>data.bosses[id])),hiddenBossWeights:Object.fromEntries(Object.entries(m.hiddenBossWeights||{}).filter(([id])=>data.bosses[id])), stages: [...new Set([...(m.stages || []).filter(k => stages[k]), ...selection.stages.filter(k => stages[k]
      && (!Array.isArray(stages[k].customExtension?.modeIds) || stages[k].customExtension.modeIds.includes(id)))])],
  }]));
  if(selection.rules?.includes('scarecrow'))for(const m of Object.values(modes)){m.bossWeights={[LAB_DUMMY_BOSS]:1};m.hiddenBossWeights={[LAB_DUMMY_BOSS]:1};}
  const roundCount=normalizeRuleValues(selection.ruleValues).roundCount;
  if(roundCount!==13)for(const [id,m] of Object.entries(modes)){
    const original=raw.config.modes[id];
    const fallback=Object.values(raw.config.modes).find(x=>x.type===m.type&&x.rounds?.['13']&&!x.rounds['13'].isBoss);
    const regular=original.rounds?.['13']||fallback?.rounds?.['13'];
    if(!regular)continue;
    const rounds={},enemyScale={},roundSource={};
    const copy=(to,from,cfg)=>{rounds[to]={...cfg};enemyScale[to]={...(original.enemyScale?.[from]||fallback?.enemyScale?.[from]||{})};roundSource[to]=from;};
    for(let r=1;r<=roundCount;r++){const from=Math.min(r,13),cfg=original.rounds?.[from];copy(r,from,cfg&&!cfg.isBoss&&!cfg.isHidden?cfg:regular);}
    copy(roundCount+1,original.bossRound,original.rounds?.[original.bossRound]);
    if(original.hiddenRound)copy(roundCount+2,original.hiddenRound,original.rounds?.[original.hiddenRound]);
    Object.assign(m,{rounds,enemyScale,roundSource,bossRound:roundCount+1,lastRound:roundCount+1,hiddenRound:original.hiddenRound?roundCount+2:null,spRounds:(original.spRounds||[]).filter(r=>r<=roundCount)});
  }
  const battleStages={...stages,...Object.fromEntries(Object.values(stages).filter(s=>!s.coopEightStage).map(s=>{const four=eightUniteStage(s);return [four.id,four];}))};
  return { ...data, stages:battleStages, config: { ...raw.config, modes, deployCap:normalizeRuleValues(selection.ruleValues).deployCap, commonBandRecords,commonBands:Object.keys(commonBandRecords),lpCapPerRound:selection.rules?.includes('unlimitedHpLoss')?Number.MAX_SAFE_INTEGER:raw.config?.lpCapPerRound,customRules:{...normalizeRuleValues(selection.ruleValues),unlimitedStock:normalizeRuleValues(selection.ruleValues).stockPlayers===-1,...Object.fromEntries((selection.rules||[]).map(id=>[id,true]))} } };
}
/** Validate before creating/starting a match, with the same filtered tables used by combat. */
export function validateExtensionMinimums(raw,selection,{mode='coop',difficulty='NORMAL'}={}){
 const data=applyCustomExtensions(raw,selection);
 const modes=Object.values(data.config?.modes||{}).filter(m=>m.difficulty===difficulty&&(mode==='solo'?m.type==='SINGLE':m.type==='MULTI'));
 const errors=[];
 if(selection.rules?.includes("augments")){const v=normalizeRuleValues(selection.ruleValues);if(v.augmentSilver+v.augmentGold+v.augmentPrism<=0)errors.push("증강 등급 가중치를 최소 1개 설정해야 합니다.");else if(v.augmentGold+v.augmentPrism<=0)errors.push("실버 3회 연속 방지를 위해 골드 또는 프리즘 가중치가 필요합니다.");}
 if((selection.commonBands||[]).some(id=>!data.config.commonBandRecords?.[id]))errors.push('공통 적용 전략의 확장 콘텐츠를 활성화해야 합니다.');
 for(const m of modes){
  const allowed=Object.entries(data.bonds||{}).filter(([id,b])=>Number(b.weight)>0&&!(m.inactiveBondIds||[]).includes(id));
  const forced=selection.forcedBonds||[],protectedIds=selection.protectedBonds||[];
  const eligibleCore=new Set(allowed.filter(([,b])=>b.isCore).map(([id])=>id));
  const aux=new Set(allowed.filter(([,b])=>!b.isCore).map(([id])=>id));
  const forcedAux=selection.forcedAuxBonds||[],protectedAux=selection.protectedAuxBonds||[];
  if(forcedAux.some(id=>protectedAux.includes(id)))errors.push('같은 보조맹약에 항상 밴과 밴 제외를 함께 설정할 수 없습니다.');
  if([...forcedAux,...protectedAux].some(id=>!aux.has(id)))errors.push('보조맹약 밴 설정은 활성화된 보조맹약에만 적용할 수 있습니다.');
  if(forced.some(id=>protectedIds.includes(id)))errors.push('같은 맹약에 항상 밴과 밴 제외를 함께 설정할 수 없습니다.');
  if([...forced,...protectedIds].some(id=>!eligibleCore.has(id)))errors.push('밴 설정은 해당 난이도에서 활성화된 핵심 맹약에만 적용할 수 있습니다.');
  if(eligibleCore.size-forced.filter(id=>eligibleCore.has(id)).length<5)errors.push('항상 밴 적용 후 핵심 맹약을 최소 5개 남겨야 합니다.');
  if(allowed.filter(([,b])=>b.isCore).length<5)errors.push('핵심 맹약을 최소 5개 남겨야 합니다.');

  if(!(m.stages||[]).some(id=>data.stages[id]&&data.stages[id].active!==false&&Number(data.stages[id].weight)>0))errors.push('맵을 최소 1개 남겨야 합니다.');
  for(const [key,title,round] of [['bossWeights','일반 보스',m.bossRound],['hiddenBossWeights','히든 보스',m.hiddenRound]])if(round && !Object.entries(m[key]||{}).some(([id,w])=>data.bosses[id]&&w>0))errors.push(`${title}를 최소 1개 남겨야 합니다.`);
  const n=selection.rules?.includes('duplicateBands')?1:mode==='solo'?1:mode==='coop8'?8:4;
  if(Object.values(data.bands||{}).filter(b=>b.bandId!==RANDOM_BAND_ID&&(!b.modeTypeList||b.modeTypeList.includes(m.type))).length<n)errors.push(`전략을 최소 ${n}개 남겨야 합니다.`);
 }
 return [...new Set(errors)];
}

/** Eight-player mode skips bond bans, while explicit operator bans remain available. */
export function modeExtensionSelection(selection,mode){
 if(mode!=='coop8')return selection;
 const result={...selection};for(const key of ['forcedBonds','protectedBonds','forcedAuxBonds','protectedAuxBonds','disabledBonds','protectedOperators'])delete result[key];return result;
}

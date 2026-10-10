import { customFactionData } from './customFactions.js';

export const EXTENSION_CATEGORIES = Object.freeze([
  { id: 'bonds', name: '맹약 추가' }, { id: 'stages', name: '전장 추가' },
  {id:'forcedBonds',name:'맹약 금지'}, {id:'protectedBonds',name:'맹약 밴 제외'},
  {id:'forcedAuxBonds',name:'보조맹약 금지'}, {id:'protectedAuxBonds',name:'보조맹약 밴 제외'},
  {id:'disabledBonds',name:'맹약 비활성화'}, {id:'disabledStages',name:'맵 비활성화'},
  {id:'disabledBosses',name:'보스 비활성화'}, {id:'disabledBands',name:'전략 비활성화'},
]);
export function isCustomStage(id, stage) {
  return id.startsWith('custom_') || stage?.customExtension === true || stage?.customExtension?.category === 'stages';
}
export function customExtensionCatalog(raw = {}) {
  const banCatalog=Object.entries(raw.bonds||{}).filter(([,b])=>b.isCore&&Number(b.weight)>0).map(([id,b])=>({id,name:b.name||id}));
  const auxCatalog=Object.entries(raw.bonds||{}).filter(([,b])=>!b.isCore&&Number(b.weight)>0).map(([id,b])=>({id,name:b.name||id}));
  return {
    forcedAuxBonds:auxCatalog,protectedAuxBonds:auxCatalog,
    forcedBonds:banCatalog,protectedBonds:banCatalog,
    disabledBonds:Object.entries(raw.bonds||{}).filter(([,b])=>b.isCore).map(([id,b])=>({id,name:b.name||id,description:b.isCore?'핵심 맹약':'추가 맹약'})),
    disabledStages:[...new Set(Object.values(raw.config?.modes||{}).flatMap(m=>m.stages||[]))].filter(id=>raw.stages?.[id]&&!isCustomStage(id,raw.stages[id])).map(id=>({id,name:raw.stages[id].name||id,description:'게임의 전장 추첨에서 제외합니다.'})),
    disabledBosses:Object.entries(raw.bosses||{}).map(([id,b])=>({id,name:b.name||id,description:b.hidden?'히든 보스':'일반 보스'})),
    disabledBands:Object.entries(raw.bands||{}).map(([id,b])=>({id,name:b.name||id,description:'전략 선택에서 제외합니다.'})),
    bonds: [{ id: 'ursus', name: '우르수스', description: '우르수스 맹약과 오퍼레이터, 전용 장비, 카셰이 전략을 추가합니다.' }],
    stages: Object.entries(raw.stages || {}).filter(([id,s]) => isCustomStage(id,s)).map(([id,s]) => ({
      id, name: s.name || id, description: s.customExtension?.description || '선택하면 이번 게임의 전장 추첨 목록에 추가됩니다.',
    })),
  };
}
export function extensionSelectionShape(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every(k => EXTENSION_CATEGORIES.some(c => c.id === k))
    && EXTENSION_CATEGORIES.every(c => value[c.id] === undefined || (Array.isArray(value[c.id]) && value[c.id].length <= 64
      && value[c.id].every(id => typeof id === 'string' && id.length > 0 && id.length <= 128)
      && new Set(value[c.id]).size === value[c.id].length));
}
export function normalizeCustomExtensions(value, raw, legacy = false) {
  const catalog = customExtensionCatalog(raw);
  const input = value === undefined ? { bonds: legacy ? ['ursus'] : [] } : value || {};
  return Object.fromEntries(EXTENSION_CATEGORIES.map(c => [c.id, catalog[c.id].map(e => e.id).filter(id => input[c.id]?.includes(id))]).filter(([id,ids])=>['bonds','stages'].includes(id)||ids.length));
}
/** Isolated match tables: only enabled and non-excluded content enters gameplay. */
export function applyCustomExtensions(raw, selection) {
  const enabled = selection.bonds.includes('ursus') && !(selection.disabledBonds||[]).includes('ursusShip');
  let data = customFactionData(raw, enabled);
  const denied=new Set((selection.disabledBonds||[]).filter(id=>raw.bonds?.[id]?.isCore));
  const chess=Object.fromEntries(Object.entries(data.chess||{}).filter(([,c])=>{const core=(c.bonds||[]).filter(b=>data.bonds?.[b]?.isCore);return !core.some(b=>denied.has(b))||core.some(b=>!denied.has(b));}).map(([id,c])=>[id,{...c,bonds:(c.bonds||[]).filter(b=>!denied.has(b))}]));
  data={...data,chess,bonds:Object.fromEntries(Object.entries(data.bonds||{}).filter(([id])=>!denied.has(id)).map(([id,b])=>[id,{...b,members:b.members?.filter(x=>chess[x]),visibleMembers:b.visibleMembers?.filter(x=>chess[x])}])),items:Object.fromEntries(Object.entries(data.items||{}).filter(([,i])=>!denied.has(i.giveBondId))),bands:Object.fromEntries(Object.entries(data.bands||{}).filter(([id,b])=>!(selection.disabledBands||[]).includes(id)&&!(b.bondIds||[]).some(x=>denied.has(x)))),bosses:Object.fromEntries(Object.entries(data.bosses||{}).filter(([id])=>!(selection.disabledBosses||[]).includes(id)))};
  const bannedEnemyKeys=new Set((selection.disabledBosses||[]).map(id=>raw.bosses?.[id]?.enemyKey).filter(id=>id&&!Object.values(data.bosses).some(b=>b.enemyKey===id)));
  data.enemies=Object.fromEntries(Object.entries(data.enemies||{}).filter(([id])=>!bannedEnemyKeys.has(id)));
  const chosen = new Set(selection.stages);
  const stages = Object.fromEntries(Object.entries(raw.stages || {}).filter(([id,s]) => (!isCustomStage(id,s) || chosen.has(id)) && !(selection.disabledStages||[]).includes(id)));
  const modes = Object.fromEntries(Object.entries(raw.config?.modes || {}).map(([id,m]) => [id, {
    ...m, activeBondIds:(m.activeBondIds||[]).filter(id=>!denied.has(id)),inactiveBondIds:(m.inactiveBondIds||[]).filter(id=>!denied.has(id)),bossWeights:Object.fromEntries(Object.entries(m.bossWeights||{}).filter(([id])=>data.bosses[id])),hiddenBossWeights:Object.fromEntries(Object.entries(m.hiddenBossWeights||{}).filter(([id])=>data.bosses[id])), stages: [...new Set([...(m.stages || []).filter(k => stages[k]), ...selection.stages.filter(k => stages[k]
      && (!Array.isArray(stages[k].customExtension?.modeIds) || stages[k].customExtension.modeIds.includes(id)))])],
  }]));
  return { ...data, stages, config: { ...raw.config, modes } };
}
/** Validate before creating/starting a match, with the same filtered tables used by combat. */
export function validateExtensionMinimums(raw,selection,{mode='coop',difficulty='NORMAL'}={}){
 const data=applyCustomExtensions(raw,selection);
 const modes=Object.values(data.config?.modes||{}).filter(m=>m.difficulty===difficulty&&(mode==='solo'?m.type==='SINGLE':m.type==='MULTI'));
 const errors=[];
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
  const n=mode==='solo'?1:4;
  if(Object.values(data.bands||{}).filter(b=>!b.modeTypeList||b.modeTypeList.includes(m.type)).length<n)errors.push(`전략을 최소 ${n}개 남겨야 합니다.`);
 }
 return [...new Set(errors)];
}

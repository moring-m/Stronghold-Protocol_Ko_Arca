import { loadScreenStyles } from './lazyComponent.js';
import { Img } from './gameComponents.js';
import { matchesKoreanSearch } from '../../../shared/search.js';
import { tr } from '../i18n/i18n.js';
import { MAP_PREVIEWS } from './mapPreviews.js';
import { bondIconUrl, bandIconUrl, enemyIconUrl, chessAvatarUrl } from './assetUrls.js';
import { builtinExtensionPresets, loadExtensionPresets, saveExtensionPresets, copyExtensionSelection, resolveExtensionPreset } from './customExtensionPresets.js';
import { data } from '../data.js';
import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal, Fragment, Icon, TierChip } from './components.js';
import { Switch, Stepper, NavCount, ChangeCount, MenuButton } from './settingsFrame.js';
import { AUGMENT_STAT_BASES,isAugmentStatActive,extensionSelectionCount, RULE_VALUES, normalizeRuleValues, EXTENSION_CATEGORIES, validateExtensionMinimums, modeExtensionSelection, customExtensionCatalog, isBannableOperator, isCustomStage, additionalStagesForDifficulty, OPTIONAL_FIRST_STAGE } from '../../../shared/customExtensions.js';


export function stageDifficultyLabels(stage) {
 const modes=stage?.modes||[];
 const labels=[['funny','표준'],['normal','험지'],['hard','극한'],['abyss','초월'],['training','훈련']];
 return labels.filter(([key])=>modes.some(mode=>mode.includes(key))).map(([,label])=>label);
}
const CATEGORY_ICONS={bannedOperators:'user',enemyStats:'sword',bossStats:'sword',allies:'user',commonBands:'crown',augmentSettings:'star',rules:'edit',bonds:'shield',stages:'map',disabledBonds:'shield',disabledStages:'map',disabledBosses:'sword',disabledBands:'crown',forcedBonds:'shield',protectedBonds:'shield',forcedAuxBonds:'shield',protectedAuxBonds:'shield'};
function ExtensionArt({tab,entry,tables}) {
  const manifest=tables?.assets;
  const url=tab==='bannedOperators'?chessAvatarUrl(manifest,tables?.chess?.[entry.id]):tab==='augmentSettings'?(entry.iconBond?bondIconUrl(manifest,entry.iconBond):entry.icon):['bonds','disabledBonds','forcedBonds','protectedBonds','forcedAuxBonds','protectedAuxBonds'].includes(tab)?bondIconUrl(manifest,entry.id==='ursus'?'ursusShip':entry.id==='leithanien'?'leithanienShip':entry.id):['commonBands','disabledBands'].includes(tab)?bandIconUrl(manifest,entry.id):tab==='disabledBosses'?enemyIconUrl(manifest,tables?.bosses?.[entry.id]?.enemyKey):null;
  if(tab==='stages'||tab==='disabledStages')return html`<span class="extension-art extension-art--map" aria-hidden="true">${MAP_PREVIEWS[entry.id]?html`<img src=${MAP_PREVIEWS[entry.id]} alt="" loading="lazy" onError=${e=>{e.currentTarget.hidden=true;}}/>`:html`<${Icon} name="map" />`}</span>`;
  return html`<span class=${`extension-art extension-art--${tab}`} aria-hidden="true">${url?html`<img src=${url} alt="" onError=${e=>{e.currentTarget.hidden=true;}}/>`:html`<${Icon} name=${CATEGORY_ICONS[tab]} />`}</span>`;
}

/** Compact portrait cards use the same art, tier and grid styles as operator settings. */
export function OperatorBanGrid({entries,tables,selected=[],disabled=false,onToggle=()=>{}}) {
 return html`<div class="extension-operators"><div class="lo-grid extension-operator-grid" role="group" aria-label="밴할 오퍼레이터">
  ${entries.map(entry=>{const c=tables.chess[entry.id],picked=selected.includes(entry.id);return html`<button key=${entry.id} type="button" class=${`lo-card lo-card--t${c.tier}${picked?' is-sel is-banned':''}`} data-chess=${entry.id} aria-pressed=${picked} aria-label=${tr(entry.name)+(picked?' · 밴됨':' · 밴 설정')} title=${tr(entry.name)} disabled=${disabled} onClick=${()=>onToggle(entry.id)}>
   <span class="lo-card__art"><${Img} src=${chessAvatarUrl(tables.assets,c)} fallback=${html`<span class="lo-card__glyph">${[...tr(entry.name)][0]}</span>`}/></span>
   <${TierChip} tier=${c.tier} size="sm" class="lo-card__tier"/>
   ${picked?html`<span class="extension-operator-ban" aria-hidden="true"><${Icon} name="check"/></span>`:null}
   <span class="lo-card__name">${tr(entry.name)}</span>
  </button>`;})}
  ${!entries.length?html`<p class="lo-empty">검색 결과가 없습니다.</p>`:null}
 </div></div>`;
}

/** Strategy portraits share the operator picker layout and preserve multi-selection. */
export function CommonBandGrid({entries,tables,selected=[],disabled=false,blocked=()=>false,onToggle=()=>{}}) {
 return html`<div class="lo-grid extension-band-grid" role="group" aria-label="공통 적용 전략">
  ${entries.map(entry=>{const picked=selected.includes(entry.id),band=tables?.bands?.[entry.id];return html`<button key=${entry.id} type="button" class=${`lo-card extension-band-card${picked?' is-sel':''}`} data-band=${entry.id} aria-pressed=${picked} aria-label=${tr(entry.name)} title=${tr(band?.desc||entry.description||entry.name)} disabled=${disabled||blocked(entry.id)} onClick=${()=>onToggle(entry.id)}>
   <span class="lo-card__art"><${Img} src=${bandIconUrl(tables?.assets,entry.id)} fallback=${html`<span class="lo-card__glyph">${[...tr(entry.name)][0]}</span>`}/></span>
   ${picked?html`<span class="extension-operator-ban" aria-hidden="true"><${Icon} name="check"/></span>`:null}
   <span class="lo-card__name">${entry.name}</span><span class="lo-card__kit">${band?.effectName||''}</span>
  </button>`;})}
 </div>`;
}

export function setBondBanPolicy(selection,id,policy,auxiliary=false) {
  const forceKey=auxiliary?'forcedAuxBonds':'forcedBonds',protectKey=auxiliary?'protectedAuxBonds':'protectedBonds';
  return {...selection,
    [forceKey]:[...(selection[forceKey]||[]).filter(x=>x!==id),...(policy==='forced'?[id]:[])],
    [protectKey]:[...(selection[protectKey]||[]).filter(x=>x!==id),...(policy==='protected'?[id]:[])],
    disabledBonds:policy==='random'?[...(selection.disabledBonds||[])]:[...(selection.disabledBonds||[]).filter(x=>x!==id)],
  };
}

/** Number of individual differences between two selections (list entries and rule values). */
export function countSelectionChanges(a={},b={}) {
 let n=0;
 for(const {id} of EXTENSION_CATEGORIES){const x=new Set(a[id]||[]),y=new Set(b[id]||[]);for(const v of x)if(!y.has(v))n++;for(const v of y)if(!x.has(v))n++;}
 const va=normalizeRuleValues(a.ruleValues),vb=normalizeRuleValues(b.ruleValues);
 return n+RULE_VALUES.filter(r=>va[r.id]!==vb[r.id]).length;
}
const RULE_GROUPS=[['전투 시간·속도',['normalBattleTime','bossBattleTime','bossBattleSpeed','maxDamage']],['게임 진행',['roundCount','deployCap','stockPlayers']]];
const BULK_TABS=['bannedOperators','bonds','stages','disabledBonds','disabledStages','disabledBosses','disabledBands'];
function ExtensionDescription({children}) {
 return children?html`<span class="extension-description"><small>${children}</small></span>`:null;
}
export function ruleDescription(rule,category,draft) {
 const hints={normalBattleTime:'기본 시간은 라운드별로 적용',bossBattleTime:'종료 후 HP 감소 · 2배속 연동',maxDamage:'0: 무제한',roundCount:'14라운드부터 13라운드 규칙 반복',deployCap:'인사부 파일 사용 시 +1',augmentEnemyVote:'일반 투표: 과반수 획득 시 최대 10초 · 가중치 투표: 득표 비율로 추첨'};
 if(rule.id.endsWith('ByAugment'))return '고정 배율 · 증강 등급 누적';
 if(hints[rule.id])return hints[rule.id];
 if(category==='augmentSettings'){
  if(rule.id.includes('Rerolls'))return rule.id==='augmentEnemyRerolls'&&draft.ruleValues?.augmentEnemyVote>0?'전체 리롤 투표 횟수':'선택지당 리롤 횟수';
  const values=normalizeRuleValues(draft.ruleValues),total=['augmentSilver','augmentGold','augmentPrism'].reduce((n,id)=>n+values[id],0)||1;
  return `${(100*values[rule.id]/total).toFixed(1)}% 등장`;
 }
 return '';
}
function optionDescription(entry,tab) {
 if(tab==='bonds')return entry.id==='leithanien'?'속세의 음 · 위치킹 포함':'우르수스 · 카셰이 포함';
 if(tab!=='rules')return entry.description||'';
 return {augments:'4·7·10라운드에 선택',unlimitedHpLoss:'라운드당 HP 감소 상한 10 해제',sharedHp:'참가자 HP·손실 합산',scarecrow:'일반·히든 보스 → 비공격 제셀톤',unlimitedLayers:'999중첩 상한 해제',defaultHarmony:'조화 오퍼레이터 없이도 활성화',duplicateBands:''}[entry.id]||'';
}

export function CustomExtensionsDialog({ open, room, isHost, disabled, onClose, onSave, additionsOnly = false }) {
  const [tab,setTab] = useState('bonds');
  const [initial,setInitial]=useState(null),[tierFilter,setTierFilter]=useState(0),[bondFilter,setBondFilter]=useState('');
  const [query,setQuery]=useState('');
  const [notice,setNotice]=useState('');
  const [presets,setPresets]=useState(loadExtensionPresets),[presetId,setPresetId]=useState(''),[presetName,setPresetName]=useState('');
  useEffect(()=>{if(open)setPresets(loadExtensionPresets());},[open]);
  const [tables,setTables]=useState(null),[loadError,setLoadError]=useState('');
  useEffect(()=>{if(!open)return;let live=true;setTables(null);setLoadError('');const names=['chess','bonds','items','bands','bosses','stages','config','enemies','assets'];Promise.all([loadScreenStyles(['/css/screens/loadout.css']),...names.map(k=>data.load(k))]).then(()=>{if(live)setTables(Object.fromEntries(names.map(k=>[k,data.get(k)])));}).catch(()=>{if(live)setLoadError('목록을 불러오지 못했습니다. 창을 다시 열어주세요.');});return()=>{live=false;};},[open]);
  const [draft,setDraft] = useState({ bonds: [], stages: [] });
  const numericCount=category=>category==='augmentSettings'&&!draft.rules?.includes('augments')?0:RULE_VALUES.filter(r=>(r.category||'rules')===(category==='augmentSettings'?'augments':category)&&normalizeRuleValues(draft.ruleValues)[r.id]!==r.default).length;
  const banTab=tab==='forcedBonds'||tab==='forcedAuxBonds', protectKey=tab==='forcedAuxBonds'?'protectedAuxBonds':'protectedBonds';
  const errors=tables&&!additionsOnly?validateExtensionMinimums(tables,draft,{mode:room.mode,difficulty:room.difficulty}):[];
  useEffect(() => {
    if (open) {if(room.mode==='coop8'&&['forcedBonds','forcedAuxBonds','disabledBonds','protectedOperators'].includes(tab))setTab('rules');const selection=room.customExtensions || { bonds: room.customFactions ? ['ursus'] : [], stages: [] };const start=additionsOnly?{bonds:selection.bonds||[],stages:selection.stages||[],rules:selection.rules||[],commonBands:selection.commonBands||[],...(selection.ruleValues?{ruleValues:selection.ruleValues}:{})}:modeExtensionSelection(selection,room.mode);setDraft(start);setInitial(start);setQuery('');}
  }, [open,room.code,isHost]);
  useEffect(() => {
    if (open && !isHost) setDraft(room.customExtensions || {bonds:room.customFactions ? ['ursus'] : [],stages:[]});
  }, [open,isHost,room.customExtensions,room.customFactions]);
  const catalog = room.customExtensionCatalog ? {...customExtensionCatalog(tables||{}),...room.customExtensionCatalog} : customExtensionCatalog(tables||{});
  catalog.stages=additionalStagesForDifficulty(catalog.stages||[],room.difficulty);
  const customEntry=e=>tab.includes('Stages')||tab==='stages' ? isCustomStage(e.id,tables?.stages?.[e.id]) : ['ursus','ursusShip','leithanien','leithanienShip'].includes(e.id)||e.id.includes('custom_')||!!tables?.bonds?.[e.id]?.customExtension;
  const grouped=['bonds','stages','disabledBonds','disabledStages','forcedBonds','forcedAuxBonds'].includes(tab);
  const entries=(catalog[tab]||[]).filter(e=>typeof e.id==='string'&&typeof e.name==='string').filter(e=>tab!=='bannedOperators'||isBannableOperator(tables?.chess?.[e.id])).filter(e=>!query||matchesKoreanSearch(tr(e.name),query)||matchesKoreanSearch(e.name,query)||matchesKoreanSearch(e.id,query)).filter(e=>tab!=='bannedOperators'||((!tierFilter||tables?.chess?.[e.id]?.tier===tierFilter)&&(!bondFilter||(tables?.chess?.[e.id]?.bonds||[]).includes(bondFilter)))).sort((a,b)=>tab==='bannedOperators'?(tables.chess[a.id].tier-tables.chess[b.id].tier)||(tables.chess[a.id].shopSortId||0)-(tables.chess[b.id].shopSortId||0)||a.id.localeCompare(b.id):Number(customEntry(a))-Number(customEntry(b)));
  const heading=(e,i)=>grouped&&(i===0||customEntry(entries[i-1])!==customEntry(e))?html`<h3 class="extension-group-heading">${customEntry(e)?'커스텀':'기존'} ${tab.includes('Stages')||tab==='stages'?'맵':'맹약'}</h3>`:null;
  const normalDefaultTime=Object.values(tables?.config?.modes||{}).find(m=>m.type===(room.mode==='solo'?'SINGLE':'MULTI')&&m.difficulty===room.difficulty)?.rounds?.['1']?.combatTimeLimit||45;
  const selectedPreset=presets.find(p=>p.id===presetId);
  const savePreset=()=>{if(selectedPreset?.builtIn)return;const id=selectedPreset?.id||`extension-${Date.now()}`;setPresets(saveExtensionPresets([...presets.filter(p=>p.id!==id),{id,name:presetName.trim(),selection:copyExtensionSelection(draft)}]));setPresetId(id);};
  const context={mode:room.mode,difficulty:room.difficulty};
  const nextToggle=id=>{
    const enabled=!(draft[tab]||[]).includes(id);
    const next={...draft,[tab]:enabled?[...(draft[tab]||[]),id]:(draft[tab]||[]).filter(x=>x!==id)};
    if(tab==='disabledBonds'&&enabled){next.forcedBonds=(draft.forcedBonds||[]).filter(x=>x!==id);next.protectedBonds=(draft.protectedBonds||[]).filter(x=>x!==id);}
    return next;
  };
  const reason=next=>tables?(additionsOnly?'':validateExtensionMinimums(tables,next,context).join(' ')):'목록을 불러오는 중입니다.';
  const applyDraft=value=>{const next=modeExtensionSelection(value,room.mode);const blocked=reason(next);if(blocked){setNotice(blocked);return;}setNotice('');setDraft(next);};
  const toggle=id=>applyDraft(nextToggle(id));
  const resetSettings=()=>{applyDraft({bonds:[],stages:[]});setQuery('');setPresetId('');setPresetName('');};
  const lockedReasons = tables && tab!=='augmentSettings' ? [...new Set((catalog[tab]||[]).filter(e=>typeof e.id==='string').flatMap(e =>
    banTab ? ['random','forced','protected'].map(policy=>reason(setBondBanPolicy(draft,e.id,policy,tab==='forcedAuxBonds'))) : [reason(nextToggle(e.id))]
  ).filter(Boolean))] : [];
  const lockWarning = !isHost ? '방장만 설정을 수정할 수 있습니다.' : disabled ? '현재는 설정을 수정할 수 없습니다.' : lockedReasons.length ? '현재 구성·난이도 제한으로 일부 선택을 수정할 수 없습니다.' : '';
  const bulkNote=useRef('');
  useEffect(()=>{setNotice(bulkNote.current);bulkNote.current='';},[tab,draft,disabled,isHost,room.difficulty]);
  const locked=disabled||!isHost;
  const setRule=(id,n)=>setDraft(prev=>({...prev,ruleValues:normalizeRuleValues({...prev.ruleValues,[id]:n})}));
  const ruleCard=r=>html`<label key=${r.id} class=${`custom-ext__card extension-rule-value${r.options||r.id==='normalBattleTime'?' extension-rule-select':''}`}><span class="extension-card__text"><strong>${r.name}</strong>${tab==='allies'?null:html`<${ExtensionDescription}>${ruleDescription(r,tab,draft)}<//>`}</span>${r.id==='normalBattleTime'?html`<span class="extension-rule-time"><span class="extension-rule-time__default"><${Switch} label="일반 라운드 기본 시간 사용" checked=${!draft.ruleValues?.normalBattleTime} disabled=${locked} onChange=${e=>setRule('normalBattleTime',e.target.checked?0:normalDefaultTime)}/>기본 시간 (1라운드 ${normalDefaultTime}초·이후 라운드별)</span><${Stepper} label=${r.name} min=${1} max=${r.max} step=${1} value=${draft.ruleValues?.normalBattleTime||normalDefaultTime} disabled=${locked||!draft.ruleValues?.normalBattleTime} onChange=${n=>setRule('normalBattleTime',Math.max(1,n||1))}/><span>초</span></span>`:r.options?html`<select aria-label=${r.name} value=${normalizeRuleValues(draft.ruleValues)[r.id]} title=${r.id.endsWith('ByAugment')&&!draft.rules?.includes('augments')?'증강 모드를 켜면 사용할 수 있습니다.':undefined} disabled=${locked||(r.id.endsWith('ByAugment')&&!draft.rules?.includes('augments'))} onChange=${e=>setRule(r.id,Number(e.target.value))}>${r.options.map(o=>html`<option value=${o.value}>${o.label}</option>`)}</select>`:html`<${Stepper} label=${r.name} min=${r.min} max=${r.max} step=${r.step} value=${isAugmentStatActive(draft,r.id)?AUGMENT_STAT_BASES[r.id]:normalizeRuleValues(draft.ruleValues)[r.id]} disabled=${locked||isAugmentStatActive(draft,r.id)} onChange=${n=>setRule(r.id,n)}/>`}<span>${r.unit}</span></label>`;
  const ruleRows=t=>RULE_VALUES.filter(r=>(r.category||'rules')===(t==='augmentSettings'?'augments':t)).filter(r=>!(additionsOnly&&r.id==='deployCap')).filter(r=>!query||matchesKoreanSearch(tr(r.name),query)||matchesKoreanSearch(r.id,query));
  const ruleGrid=()=>{const rows=ruleRows(tab);if(tab!=='rules')return html`<div class="extension-grid">${rows.map(ruleCard)}</div>`;const grouped=RULE_GROUPS.map(([name,ids])=>[name,rows.filter(r=>ids.includes(r.id))]),rest=rows.filter(r=>!RULE_GROUPS.some(([,ids])=>ids.includes(r.id)));return [...grouped,['기타',rest]].filter(([,list])=>list.length).map(([name,list])=>html`<${Fragment} key=${name}><h3 class="extension-group-heading">${name}</h3><div class="extension-grid">${list.map(ruleCard)}</div><//>`);};
  const bulkSelect=()=>{let next=draft,skipped=0;for(const e of entries){if((next[tab]||[]).includes(e.id))continue;const cand=modeExtensionSelection({...next,[tab]:[...(next[tab]||[]),e.id],...(tab==='disabledBonds'?{forcedBonds:(next.forcedBonds||[]).filter(x=>x!==e.id),protectedBonds:(next.protectedBonds||[]).filter(x=>x!==e.id)}:{})},room.mode);if(reason(cand)){skipped++;continue;}next=cand;}bulkNote.current=skipped?`최소 구성 조건 때문에 ${skipped}개는 선택하지 않았습니다.`:'';setDraft(next);};
  const bulkClear=()=>{const ids=new Set(entries.map(e=>e.id));applyDraft({...draft,[tab]:(draft[tab]||[]).filter(id=>!ids.has(id))});};
  const tabCount=id=>(['rules','allies','enemyStats','bossStats','augmentSettings'].includes(id)?numericCount(id)+(id==='rules'?(draft.rules||[]).length:0):(draft[id]||[]).length)+(id==='forcedBonds'?(draft.protectedBonds||[]).length:id==='forcedAuxBonds'?(draft.protectedAuxBonds||[]).length:0);
  const matchCount=id=>!query||!tables?0:(['rules','allies','enemyStats','bossStats','augmentSettings'].includes(id)?ruleRows(id).length:0)+(catalog[id]||[]).filter(e=>typeof e.name==='string'&&(matchesKoreanSearch(tr(e.name),query)||matchesKoreanSearch(e.name,query))).length;
  const changes=initial?countSelectionChanges(initial,draft):0;
  const presetMenu0=html`<${MenuButton} label=${selectedPreset?selectedPreset.name:'프리셋'} icon="star" class="extension-presets-menu"><div class="extension-presets"><select aria-label="확장 프리셋" value=${presetId} onChange=${e=>{const id=e.target.value;setPresetId(id);setPresetName(presets.find(p=>p.id===id)?.name||'');}}><option value="">새 프리셋</option>${presets.map(p=>html`<option value=${p.id}>${p.name}</option>`)}</select><input aria-label="확장 프리셋 이름" placeholder="프리셋 이름" maxlength="40" disabled=${selectedPreset?.builtIn} value=${presetName} onInput=${e=>setPresetName(e.target.value)}/><div class="extension-presets__actions"><${Button} variant="secondary" disabled=${disabled||selectedPreset?.builtIn||!presetName.trim()||(!selectedPreset&&presets.filter(p=>!p.builtIn).length>=30)} onClick=${savePreset}>${selectedPreset?'덮어쓰기':'저장'}<//><${Button} variant="secondary" data-close disabled=${disabled||!selectedPreset||!tables} onClick=${()=>applyDraft(resolveExtensionPreset(selectedPreset,catalog))}>불러오기<//><${Button} variant="ghost" disabled=${disabled||!selectedPreset||selectedPreset?.builtIn} onClick=${()=>{if(selectedPreset?.builtIn)return;setPresets(saveExtensionPresets(presets.filter(p=>p.id!==presetId)));setPresetId('');setPresetName('');}}>삭제<//></div>${selectedPreset&&!selectedPreset.builtIn?html`<button type="button" class="extension-presets__saveas" disabled=${disabled||!presetName.trim()||presets.filter(p=>!p.builtIn).length>=30} onClick=${()=>{const id=`extension-${Date.now()}`;setPresets(saveExtensionPresets([...presets,{id,name:presetName.trim()===selectedPreset.name?presetName.trim()+' 복사':presetName.trim(),selection:copyExtensionSelection(draft)}]));setPresetId(id);}}>다른 이름으로 저장</button>`:null}</div><//>`;
  const presetMenu=isHost&&!additionsOnly?html`<span class="extension-mode-loads" role="group" aria-label="모드 기본 설정 불러오기">${builtinExtensionPresets().map(p=>html`<${Button} key=${p.id} variant="ghost" size="sm" icon="load" title=${p.name+' 기본 설정으로 바꿉니다. 적용을 눌러야 방에 반영됩니다.'} disabled=${disabled||!tables} onClick=${()=>{applyDraft(resolveExtensionPreset(p,catalog));setPresetId('');setPresetName('');}}>${p.name} 불러오기<//>`)}</span>${presetMenu0}`:null;
  return html`<${Modal} open=${open} title="커스텀 설정" micro="CUSTOM EXTENSIONS" class="custom-ext ui-editor" width="min(15rem,96vw)" onClose=${onClose}
    actions=${html`<${ChangeCount} count=${changes}/><span class="editor-status" aria-live="polite">${notice || (errors.length?errors.join(' '):loadError||(!tables?'목록 불러오는 중…':(additionsOnly?'실험실에 추가할 커스텀 콘텐츠를 선택하세요.':'최소 구성 조건 충족')))}</span>${isHost?html`<${Button} variant="ghost" disabled=${disabled||!tables} onClick=${resetSettings}>초기화<//>`:null}<${Button} variant="secondary" onClick=${onClose} disabled=${disabled}>${isHost ? '취소' : '닫기'}<//>
      ${isHost ? html`<${Button} variant="primary" disabled=${disabled || !tables || errors.length>0} onClick=${()=>onSave(additionsOnly?{bonds:draft.bonds,stages:draft.stages,rules:draft.rules||[],commonBands:draft.commonBands||[],...(draft.ruleValues?{ruleValues:draft.ruleValues}:{})}:draft)}>적용<//>` : null}`}>
    <div class="settings-head"><p class="lo-note">${additionsOnly?'선택한 커스텀 콘텐츠를 실험실에 추가합니다. 전장·전략 목록과 전투에 함께 적용됩니다.':isHost?'설정은 방 전체에 적용됩니다. 초기화 후 적용을 누르면 기본 설정으로 변경됩니다.':'방장이 선택한 구성이 방 전체에 적용됩니다.'}</p>${presetMenu}</div>
    <div class="extensions-layout"><nav class="extensions-nav" aria-label="설정 분류"><input class="editor-search extensions-search" type="search" aria-label="설정 목록 검색" placeholder="전체 설정 검색" value=${query} onInput=${e=>setQuery(e.target.value)}/><div class="extensions-menu"><h3>규칙</h3>
      ${EXTENSION_CATEGORIES.filter(c=>additionsOnly?['rules','allies','enemyStats','bossStats','commonBands','bonds','stages'].includes(c.id):!['protectedBonds','protectedAuxBonds',...(room.mode==='coop8'?['forcedBonds','forcedAuxBonds','disabledBonds']:[])].includes(c.id)).map((c,i)=>html`<${Fragment}>${c.id==='bonds'?html`<h3>추가 확장</h3>`:c.id==='forcedBonds'?html`<h3>금지 단계</h3>`:c.id==='disabledBonds'?html`<h3>콘텐츠 비활성화</h3>`:null}<button type="button" id=${'ext-tab-'+c.id} aria-controls=${'ext-panel-'+c.id} aria-pressed=${tab===c.id} class=${tab===c.id?'is-on':''} onClick=${()=>setTab(c.id)} data-dim=${!!query&&!matchCount(c.id)}><${Icon} name=${CATEGORY_ICONS[c.id]} /><span class="extensions-nav__label">${c.name}</span>${query?html`<span class="num num--match" title="검색 결과">${matchCount(c.id)||''}</span>`:html`<${NavCount} n=${tabCount(c.id)}/>`}</button><//>`)}
      </div>

    </nav><section class="extensions-editor" id=${'ext-panel-'+tab} aria-labelledby=${'ext-tab-'+tab}>
      <div class="editor-toolbar"><h3>${EXTENSION_CATEGORIES.find(c=>c.id===tab)?.name}</h3><span class="lo-count">선택 <b>${(['rules','allies','enemyStats','bossStats','augmentSettings'].includes(tab)?numericCount(tab)+(tab==='rules'?(draft.rules||[]).length:0):(draft[tab]||[]).length)+(banTab?(draft[protectKey]||[]).length:0)}</b></span>${tab==='bannedOperators'?html`<span class="ui-seg extension-tier-filter" role="group" aria-label="등급 필터">${[0,1,2,3,4,5,6].map(t=>html`<button type="button" class=${tierFilter===t?'is-on':''} aria-pressed=${tierFilter===t} onClick=${()=>setTierFilter(t)}>${t?['','I','II','III','IV','V','VI'][t]:'전체'}</button>`)}</span><select class="extension-bond-filter" aria-label="맹약 필터" value=${bondFilter} onChange=${e=>setBondFilter(e.target.value)}><option value="">모든 맹약</option>${Object.entries(tables?.bonds||{}).filter(([,b])=>!b.hidden).map(([id,b])=>html`<option value=${id}>${tr(b.name||id)}</option>`)}</select>`:null}${BULK_TABS.includes(tab)&&isHost?html`<span class="extension-bulk"><${Button} variant="ghost" size="sm" disabled=${locked||!tables||!entries.length} onClick=${bulkSelect}>${query||tierFilter||bondFilter?'보이는 항목 선택':'모두 선택'}<//><${Button} variant="ghost" size="sm" disabled=${locked||!entries.some(e=>(draft[tab]||[]).includes(e.id))} onClick=${bulkClear}>선택 해제<//></span>`:null}</div>
      <p class="editor-help">${tab==='bannedOperators'?'초상화를 누르면 밴을 설정하거나 해제합니다. 선발 오퍼레이터는 제외됩니다.':tab==='augmentSettings'?'등급 확률은 가중치 ÷ 총합으로 계산합니다. 실버는 3회 연속 등장하지 않습니다. 리롤은 선택지별 횟수입니다.':tab==='bossStats'?'일반 보스전·히든 보스전의 보스와 부위에만 적용합니다. 수배 보스는 일반 적 스펙 설정을 따릅니다.':tab==='enemyStats'?'일반 적과 수배 보스에 적용합니다.':tab==='allies'?'아군 오퍼레이터와 소환물의 기본 능력치에 적용할 비율입니다. 기본값은 100%입니다.':tab==='rules'?'선택한 규칙을 이번 시뮬레이션에 적용합니다.':tab==='disabledBonds'?'선택한 맹약과 소속 오퍼레이터를 제외합니다. 이중 맹약은 남은 맹약을 유지합니다.':banTab?'맹약별 밴 규칙을 선택하세요. 무작위는 기존 규칙을 따릅니다.':tab.startsWith('disabled')?'체크한 요소는 게임에 등장하지 않습니다.':'체크한 확장을 이번 게임에 추가합니다.'}</p>
      <div class="extension-settings-scroll">
      ${tab==='augmentSettings'?html`<label class="custom-ext__card"><input type="checkbox" role="switch" class="ui-switch" checked=${draft.rules?.includes('augments')} disabled=${disabled||!isHost} onChange=${()=>setDraft(prev=>({...prev,rules:prev.rules?.includes('augments')?prev.rules.filter(id=>id!=='augments'):[...(prev.rules||[]),'augments']}))}/><span class="extension-card__text"><strong>증강 모드 활성화</strong><small>4·7·10라운드에 아군·적 증강 선택</small></span></label>`:null}
      ${tab==='augmentSettings'?ruleGrid():null}
      ${['allies','enemyStats','bossStats','augmentSettings'].includes(tab)?null:tab==='commonBands'?html`<${CommonBandGrid} entries=${entries} tables=${tables} selected=${draft.commonBands||[]} disabled=${disabled||!isHost} blocked=${id=>!!reason(nextToggle(id))} onToggle=${toggle}/>`:tab==='bannedOperators'?html`<${OperatorBanGrid} entries=${entries} tables=${tables} selected=${draft.bannedOperators||[]} disabled=${disabled||!isHost} onToggle=${toggle}/>`:banTab?html`<div class="extension-grid extension-grid--forcedBonds">${entries.map((e,i)=>{
        const policy=(draft[tab]||[]).includes(e.id)?'forced':(draft[protectKey]||[]).includes(e.id)?'protected':'random';
        return html`<${Fragment}>${heading(e,i)}<div key=${e.id} class=${`custom-ext__card extension-card--ban${policy!=='random'?' is-selected':''}`}><${ExtensionArt} tab=${tab} entry=${e} tables=${tables}/><span class="extension-card__text"><strong>${e.name}</strong><span class="extension-ban-options" role="group" aria-label=${e.name+' 밴 규칙'}>${[['random','무작위'],['forced','항상 밴'],['protected','밴 제외']].map(([id,label])=>html`<button type="button" data-policy=${id} class=${policy===id?'is-on':''} aria-pressed=${policy===id} disabled=${disabled||!isHost||!!reason(setBondBanPolicy(draft,e.id,id,tab==='forcedAuxBonds'))} onClick=${()=>applyDraft(setBondBanPolicy(draft,e.id,id,tab==='forcedAuxBonds'))}>${label}</button>`)}</span></span></div><//>`;
      })}</div>`:html`<div class=${`extension-grid extension-grid--${tab}`}>${entries.map((e,i)=>html`<${Fragment}>${heading(e,i)}<label key=${e.id} class=${`custom-ext__card${(draft[tab]||[]).includes(e.id)?(tab.startsWith('disabled')?' is-selected is-excluded':' is-selected'):''}`}><input type="checkbox" role=${tab==='rules'?'switch':undefined} class=${tab==='rules'?'ui-switch':undefined} checked=${tab==='augmentSettings'?!(draft[tab]||[]).includes(e.id):(draft[tab]||[]).includes(e.id)} disabled=${disabled||!isHost||(tab!=='augmentSettings'&&!!reason(nextToggle(e.id)))} onChange=${()=>toggle(e.id)}/><${ExtensionArt} tab=${tab} entry=${e} tables=${tables}/><span class="extension-card__text"><strong>${e.name}</strong><${ExtensionDescription}>${['commonBands','disabledBands'].includes(tab)?(tables?.bands?.[e.id]?.effectName||''):tab==='disabledBosses'?(tables?.bosses?.[e.id]?.hidden?'히든 보스':'일반 보스'):(tab==='bonds'||tab==='rules'||tab==='augmentSettings')?optionDescription(e,tab):(tab==='stages'||tab==='disabledStages')?(tab==='stages'&&e.id===OPTIONAL_FIRST_STAGE?['험지','극한','초월']:stageDifficultyLabels(tables?.stages?.[e.id])).join(' · '):''}<//></span></label><//>`)}${!(catalog[tab]||[]).length&&!['allies','enemyStats','bossStats'].includes(tab)?html`<p class="lo-empty">등록된 요소가 없습니다.</p>`:null}</div>`}
      ${['rules','allies','enemyStats','bossStats'].includes(tab)?ruleGrid():null}
      </div>
      <div class="editor-minimums"><span>최소 유지</span><b>핵심 맹약 5</b><b>맵 1</b><b>일반·히든 보스 각 1</b><b>전략 ${room.mode==='solo'||draft.rules?.includes('duplicateBands')?1:room.mode==='coop8'?8:4}</b>${lockWarning?html`<span class="editor-limit-note" role="status" aria-live="polite">${lockWarning}</span>`:null}</div>
    </section></div>
  <//>`;
}

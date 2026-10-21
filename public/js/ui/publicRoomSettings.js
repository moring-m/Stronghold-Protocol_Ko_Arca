import {defaultRoomTitle}from'../../../shared/roomTitle.js';
import {useEffect,useState}from'../../vendor/hooks.module.js';
import {html,Modal,Button}from'./components.js';
import {data}from'../data.js';
import {tr}from'../i18n/i18n.js';
import {AUGMENT_STAT_BASES,isAugmentStatActive,RULE_VALUES,EXTENSION_CATEGORIES,normalizeRuleValues,customExtensionCatalog}from'../../../shared/customExtensions.js';
export function roomSettingsGroups(selection={},tables={}){
 const catalog=customExtensionCatalog(tables),values=normalizeRuleValues(selection.ruleValues),groups=[];
 for(const category of EXTENSION_CATEGORIES){
  const entries=(selection[category.id]||[]).map(id=>({name:catalog[category.id]?.find(e=>e.id===id)?.name||id,value:'적용'}));
  const numericCategory=category.id==='augmentSettings'?'augments':category.id;
  if(numericCategory!=='augments'||selection.rules?.includes('augments'))for(const rule of RULE_VALUES.filter(r=>(r.category||'rules')===numericCategory)){
   let value=values[rule.id];if(rule.id.endsWith('ByAugment')&&!selection.rules?.includes('augments'))value=0;if(isAugmentStatActive(selection,rule.id))value=AUGMENT_STAT_BASES[rule.id];
   if(value===rule.default)continue;
   entries.push({name:rule.name,value:rule.options?.find(o=>o.value===value)?.label||(rule.id==='normalBattleTime'&&value===0?'라운드별 기본 시간':`${value.toLocaleString()}${tr(rule.unit)}`)});
  }
  if(entries.length)groups.push({id:category.id,name:category.name,entries});
 }
 return groups;
}
export function PublicRoomSettings({room,onClose}){
 const[tables,setTables]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let live=true;const keys=['config','chess','items','bonds','bands','bosses','stages'];Promise.all(keys.map(k=>data.load(k))).then(()=>{if(live)setTables(Object.fromEntries(keys.map(k=>[k,data.get(k)])));}).catch(()=>{if(live)setError('설정 정보를 불러오지 못했습니다. 다시 열어주세요.');});return()=>{live=false;};},[room.code]);
 const groups=tables?roomSettingsGroups(room.customExtensions,tables):[];
 return html`<${Modal} open=${true} title="적용된 설정" micro="ROOM SETTINGS" class="room-settings-view" width="min(10rem,94vw)" onClose=${onClose} actions=${html`<${Button} variant="secondary" onClick=${onClose}>닫기<//>`}>
 <p class="room-settings-view__title" data-i18n-skip>${room.title===defaultRoomTitle(room.mode)?tr(room.title):room.title}</p>
 ${error?html`<p role="alert">${error}</p>`:!tables?html`<p>설정을 불러오는 중…</p>`:html`${!groups.length?html`<p class="room-settings-view__empty">기본 설정과 동일합니다.</p>`:null}<div class="room-settings-view__groups">${groups.map(group=>html`<section class="room-settings-group" data-category=${group.id}><h3>${group.name}</h3><dl>${group.entries.map(entry=>html`<div><dt>${tr(entry.name)}</dt><dd>${tr(entry.value)}</dd></div>`)}</dl></section>`)}</div>`}
 <//>`;
}

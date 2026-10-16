import { data } from '../data.js';
import { html, Icon } from './components.js';
import { useGameData } from './gameComponents.js';
import { tr } from '../i18n/i18n.js';
import { normalizeRuleValues, EXTENSION_CATEGORIES, RULE_VALUES, customExtensionCatalog, recordCustomExtensions } from '../../../shared/customExtensions.js';
export function customSettingsRows(selection,tables){
 const values=recordCustomExtensions(selection)||{},catalog=customExtensionCatalog(tables);
 return Object.entries(values).filter(([key,value])=>key==='ruleValues'?Object.keys(value).length:value.length).map(([key,value])=>({label:EXTENSION_CATEGORIES.find(c=>c.id===key)?.name||'규칙 수치',items:Array.isArray(value)?value.map(id=>tr(catalog[key]?.find(e=>e.id===id)?.name||tables.bonds?.[id]?.name||tables.bands?.[id]?.name||tables.bosses?.[id]?.name||tables.stages?.[id]?.name||id)):Object.entries(value).map(([id,n])=>{const r=RULE_VALUES.find(r=>r.id===id);return `${r?.category==='allies'?'아군 ':''}${r?.name||id} ${r?.options?.find(o=>o.value===n)?.label??`${n}${r?.unit||''}`}`;})}));
}
export function CustomSettingsInfo({pub}){
 const gd=useGameData(),tables=Object.fromEntries(['config','bonds','bands','bosses','stages','chess'].map(k=>[k,data.get(k)||{}])),rows=customSettingsRows(pub.customExtensions,tables);
 const av=normalizeRuleValues(pub.customExtensions?.ruleValues);
 return html`<section class="custom-game-info"><h3><${Icon} name="edit"/> 적용된 커스텀 설정</h3>${pub.augments?html`<section><h4>증강 설정</h4><p>등급 가중치: 실버 ${av.augmentSilver} · 골드 ${av.augmentGold} · 프리즘 ${av.augmentPrism}</p><p>리롤: 아군 ${av.augmentAllyRerolls}회 · 적 ${av.augmentEnemyRerolls}회 (선택지별)</p></section>`:null}${rows.length?rows.map(row=>html`<section><h4>${row.label}</h4><ul>${row.items.map(item=>html`<li>${item}</li>`)}</ul></section>`):html`<p>이 게임에는 커스텀 설정이 적용되지 않았습니다.</p>`}</section>`;
}

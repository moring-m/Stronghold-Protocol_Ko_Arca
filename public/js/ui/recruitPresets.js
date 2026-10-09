import {html,Modal,Button} from './components.js';
import {createStore,loadPref,savePref,useStore,store} from '../store.js';
import {data} from '../data.js';
import {useEffect,useState} from '../../vendor/hooks.module.js';
import {loadoutStore,setEntries,flushPendingLoadout} from './loadoutSync.js';
import {checkLoadout} from '../../../shared/protocol.js';
import {CHAT_FACTIONS,chatFaction} from '../../../shared/chat.js';
import {bindPresetFaction,normalizePresetFactions,canApplyRecruitPreset,replaceRecruitEntries} from './factionPresetModel.js';
import {toast} from './toasts.js';
import {Img} from './gameComponents.js';
import {chessPortraitUrl,bondIconUrl} from './assetUrls.js';
const KEY='recruitPresets';
export function normalizeRecruitPresets(raw){
 const presets=normalizePresetFactions((Array.isArray(raw?.presets)?raw.presets:[]).filter(p=>typeof p?.id==='string').slice(0,30).map(p=>({id:p.id,name:String(p.name||'선발 프리셋').slice(0,40),faction:p.faction,entries:Object.fromEntries(Object.entries(p.entries||{}).filter(([id,e])=>typeof id==='string'&&e&&typeof e==='object'&&!Array.isArray(e)&&e.selected===true))})));
 return {presets,active:presets.some(p=>p.id===raw?.active)?raw.active:presets[0]?.id||null};
}
export const recruitPresetStore=createStore({...normalizeRecruitPresets(loadPref(KEY,{})),open:false});
function save(next){const clean=normalizeRecruitPresets(next);savePref(KEY,clean);recruitPresetStore.set(clean);}
function capture(){return Object.fromEntries(Object.entries(loadoutStore.get().entries).filter(([id,e])=>data.lookup('chess',id)?.optionalRecruit&&e.selected).map(([id,e])=>[id,{...e}]));}
export function applyRecruitPreset(id,state=store.get()) {
 if(!canApplyRecruitPreset(state))return {ok:false,locked:true};
 const s=recruitPresetStore.get(),p=s.presets.find(p=>p.id===id);
 if(!p)return {ok:false};
 const next=replaceRecruitEntries(loadoutStore.get().entries,p.entries,id=>data.lookup('chess',id));
 if(Object.keys(p.entries).length&&!Object.entries(next).some(([id,e])=>data.lookup('chess',id)?.optionalRecruit&&e.selected))return {ok:false,detail:'선발 가능한 오퍼레이터가 없습니다.'};
 const check=checkLoadout(next,id=>data.lookup('chess',id));
 if(!check.ok)return {ok:false,detail:check.detail};
 setEntries(next);save({...s,active:id});return {ok:true,name:p.name};
}
export async function applyRecruitFaction(faction){
 if(!faction||!canApplyRecruitPreset(store.get()))return null;
 const p=recruitPresetStore.get().presets.find(p=>p.faction===faction);if(!p)return null;
 await data.load('chess');
 const result=applyRecruitPreset(p.id);
 if(!result.ok){if(!result.locked)toast('연결된 선발 프리셋을 적용하지 못했습니다. 단계별 선발 인원과 오퍼레이터 설정을 확인해주세요.','warn');return null;}
 await flushPendingLoadout();
 return result.name;
}
export function RecruitPresetButton({size='sm',class:cls=''}={}){return html`<${Button} variant="secondary" size=${size} class=${cls} icon="users" onClick=${()=>recruitPresetStore.set({open:true})}>선발 프리셋<//>`;}
export function RecruitPresetsHost(){
 const s=useStore(x=>x,Object.is,recruitPresetStore),app=useStore(x=>x),[ready,setReady]=useState(false);
 useEffect(()=>{if(!s.open)return;let live=true;Promise.all(['chess','assets'].map(k=>data.load(k))).then(()=>{if(live)setReady(true);}).catch(()=>{if(live)toast('선발 목록을 불러오지 못했습니다. 다시 열어주세요.','warn');});return()=>{live=false;};},[s.open]);
 if(!s.open)return null;
 const p=s.presets.find(p=>p.id===s.active),locked=!canApplyRecruitPreset(app);
 const update=patch=>save({...s,presets:s.presets.map(x=>x.id===p.id?{...x,...patch}:x)});
 const create=()=>{const id=`recruit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;save({...s,active:id,presets:[...s.presets,{id,name:`선발 프리셋 ${s.presets.length+1}`,entries:capture()}]});};
 return html`<${Modal} class="favorites-modal recruit-presets-modal ui-editor" width="min(12rem,96vw)" open=${true} title="선발 오퍼레이터 프리셋" micro="RECRUIT PRESETS" onClose=${()=>recruitPresetStore.set({open:false})} actions=${html`<${Button} onClick=${()=>recruitPresetStore.set({open:false})}>닫기<//>`}>
 <p class="lo-note">현재 선발 구성과 스킬·모듈·스킨을 저장합니다. 진영 연동과 불러오기는 전략 선택 단계가 끝나기 전까지만 적용됩니다.</p>
 <div class="favorites-layout"><aside class="favorites-presets"><h3>프리셋 목록</h3><${Button} disabled=${!ready||s.presets.length>=30} onClick=${create}>현재 구성으로 새 프리셋<//><div class="favorites-preset-list">${s.presets.map(x=>html`<button type="button" class=${`favorites-preset ${s.active===x.id?'is-on':''}`} aria-pressed=${s.active===x.id} onClick=${()=>save({...s,active:x.id})}><strong class="preset-name-row"><span>${x.name}</span>${x.faction?html`<${Img} class="preset-faction-icon" src=${bondIconUrl(data.get('assets'),chatFaction(x.faction)?.bondId)}/>`:null}</strong>${x.faction?html`<small class="preset-faction-label">${x.faction} 연동</small>`:null}<small>선발 ${Object.keys(x.entries).length}명</small></button>`)}</div></aside>
 <section class="favorites-editor">${p?html`<div class="favorites-toolbar favorites-titlebar"><input aria-label="선발 프리셋 이름" maxlength="40" value=${p.name} onInput=${e=>update({name:e.target.value})}/><${Button} onClick=${()=>save({...s,presets:s.presets.filter(x=>x.id!==p.id)})}>삭제<//></div>
 <div class="preset-faction-link"><label>진영 연동<select aria-label="선발 프리셋 연동 진영" value=${p.faction||''} onChange=${e=>save({...s,presets:bindPresetFaction(s.presets,p.id,e.target.value)})}><option value="">연동 안 함</option>${CHAT_FACTIONS.map(f=>html`<option value=${f.name}>${f.name}</option>`)}</select></label><p>진영당 선발 프리셋 하나만 연결할 수 있습니다. 기존 연결은 새 프리셋으로 이동합니다.</p></div>
 <div class="favorites-toolbar"><${Button} disabled=${!ready} onClick=${()=>{update({entries:capture()});toast('현재 선발 구성을 저장했습니다.');}}>현재 구성 덮어쓰기<//><${Button} disabled=${locked||!ready} onClick=${()=>{const r=applyRecruitPreset(p.id);toast(r.ok?'선발 프리셋을 적용했습니다.':'선발 프리셋을 적용하지 못했습니다.',r.ok?'info':'warn');}}>불러오기<//></div>
 ${locked?html`<p class="lo-locknote">전략 선택 단계가 끝나 이번 판의 선발 구성을 변경할 수 없습니다.</p>`:null}
 ${[5,6].map(t=>{const rows=Object.entries(p.entries).map(([id])=>data.lookup('chess',id)).filter(c=>c?.tier===t);return html`<section class="recruit-preset-tier"><h3>${t}단계 <span>${rows.length}/2</span></h3><div class="recruit-preset-cards">${rows.length?rows.map(c=>html`<div class="recruit-preset-card"><${Img} src=${chessPortraitUrl(data.get('assets'),c)}/><span>${c.name}</span></div>`):html`<p>선발 없음</p>`}</div></section>`;})}`:html`<p>추가 선발에서 구성한 뒤 새 프리셋으로 저장하세요.</p>`}</section></div><//>`;
}

import {normalizePresetStrategies,completedStrategy} from '../../../shared/recruitPresetLinks.js';
import {PresetLinks,PresetLinkIcons} from './presetLinks.js';
import { PresetManager, PresetNameField, PresetLinkChips } from './settingsFrame.js';
import { html, Modal, Button } from './components.js';
import { createStore, loadPref, savePref, useStore, store } from '../store.js';
import { data } from '../data.js';
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { loadoutStore, setEntries, flushPendingLoadout } from './loadoutSync.js';
import { checkLoadout } from '../../../shared/protocol.js';
import { normalizePresetFactions, canApplyRecruitPreset, replaceRecruitEntries } from './factionPresetModel.js';
import { toast } from './toasts.js';
import { Img } from './gameComponents.js';
import { chessPortraitUrl } from './assetUrls.js';
const KEY='recruitPresets';
export function normalizeRecruitPresets(raw){
 const presets=normalizePresetStrategies(normalizePresetFactions((Array.isArray(raw?.presets)?raw.presets:[]).filter(p=>typeof p?.id==='string').slice(0,30).map(p=>({id:p.id,name:String(p.name||'선발 프리셋').slice(0,40),faction:p.faction,strategy:p.strategy,entries:Object.fromEntries(Object.entries(p.entries||{}).filter(([id,e])=>typeof id==='string'&&e&&typeof e==='object'&&!Array.isArray(e)&&e.selected===true))}))));
 return {presets,active:presets.some(p=>p.id===raw?.active)?raw.active:presets[0]?.id||null};
}
export const recruitPresetStore=createStore({...normalizeRecruitPresets(loadPref(KEY,{})),open:false});
export function saveRecruitPresets(next){const clean=normalizeRecruitPresets(next),faction=store.get().chatFaction,linked=clean.presets.find(p=>p.faction===faction),old=recruitPresetStore.get().presets.find(p=>p.faction===faction);savePref(KEY,clean);recruitPresetStore.set(clean);syncStrategyPresets(clean);if(faction&&linked&&linked.id!==old?.id)applyRecruitFaction(faction,{guardFaction:true}).catch(error=>toast(error.message,'warn'));}
function syncStrategyPresets(state){const next=Object.fromEntries(state.presets.filter(p=>p.strategy).map(p=>[p.strategy,p.entries]));if(JSON.stringify(loadoutStore.get().strategyPresets)!==JSON.stringify(next))loadoutStore.set({strategyPresets:next});}
syncStrategyPresets(recruitPresetStore.get());
let lastStrategy=null;
store.subscribe(state=>{const done=completedStrategy(state);if(!done){if(!state.room?.inMatch||['LOBBY','INFO_CHECK','BAND_DRAFT'].includes(state.match?.public?.phase))lastStrategy=null;return;}
 if(state.match?.private?.strategyPresetApplied!==done.strategy||lastStrategy===done.key)return;
 const preset=recruitPresetStore.get().presets.find(p=>p.strategy===done.strategy);if(!preset)return;
 lastStrategy=done.key;applyRecruitPreset(preset.id,{}, {strategyMirror:true});
});
const save=saveRecruitPresets;
let factionSyncSeq=0,factionRequest=null;
if(typeof window!=='undefined'){let previousFaction=store.get().chatFaction,previousAllowed=canApplyRecruitPreset(store.get());store.subscribe(state=>{const faction=state.chatFaction,allowed=canApplyRecruitPreset(state);if(faction===previousFaction&&allowed===previousAllowed)return;previousFaction=faction;previousAllowed=allowed;if(!faction||!allowed){factionSyncSeq++;return;}applyRecruitFaction(faction,{guardFaction:true}).catch(error=>toast(error.message,'warn'));});}
function capture(){return Object.fromEntries(Object.entries(loadoutStore.get().entries).filter(([id,e])=>data.lookup('chess',id)?.optionalRecruit&&e.selected).map(([id,e])=>[id,{...e}]));}
export function applyRecruitPreset(id,state=store.get(),options={}) {
 if(!canApplyRecruitPreset(state))return {ok:false,locked:true};
 const s=recruitPresetStore.get(),p=s.presets.find(p=>p.id===id);
 if(!p)return {ok:false};
 const next=replaceRecruitEntries(loadoutStore.get().entries,p.entries,id=>data.lookup('chess',id));
 if(Object.keys(p.entries).length&&!Object.entries(next).some(([id,e])=>data.lookup('chess',id)?.optionalRecruit&&e.selected))return {ok:false,detail:'선발 가능한 오퍼레이터가 없습니다.'};
 const check=checkLoadout(next,id=>data.lookup('chess',id));
 if(!check.ok)return {ok:false,detail:check.detail};
 setEntries(next,options);save({...s,active:id});return {ok:true,name:p.name};
}
export function applyRecruitFaction(faction,{guardFaction=false}={}){
 const linked=recruitPresetStore.get().presets.find(p=>p.faction===faction);
 if(factionRequest?.faction===faction&&factionRequest?.id===linked?.id&&factionRequest.seq===factionSyncSeq)return factionRequest.promise;
 const seq=++factionSyncSeq;
 const promise=(async()=>{
 if(!faction||!canApplyRecruitPreset(store.get()))return null;
 const p=recruitPresetStore.get().presets.find(p=>p.faction===faction);if(!p)return null;
 await data.load('chess');
 if(seq!==factionSyncSeq||(guardFaction&&(store.get().chatFaction!==faction||recruitPresetStore.get().presets.find(p=>p.faction===faction)?.id!==p.id)))return null;
 const result=applyRecruitPreset(p.id);
 if(!result.ok){if(!result.locked)toast('연결된 선발 프리셋을 적용하지 못했습니다. 단계별 선발 인원과 오퍼레이터 설정을 확인해주세요.','warn');return null;}
 await flushPendingLoadout();
 return result.name;
})();
 const request={faction,id:linked?.id,seq,promise:null};request.promise=promise.finally(()=>{if(factionRequest===request)factionRequest=null;});factionRequest=request;return request.promise;
}
export function RecruitPresetButton({size='sm',class:cls=''}={}){const s=useStore(x=>x,Object.is,recruitPresetStore),p=s.presets.find(x=>x.id===s.active);return html`<${Button} variant="secondary" size=${size} class=${`lo-preset-button ${cls}`} icon="users" onClick=${()=>recruitPresetStore.set({open:true})}><span class="lo-preset-button__k">선발 프리셋</span>${p?html`<span class="lo-preset-button__v">${p.name}</span><${PresetLinkChips} preset=${p} manifest=${data.get('assets')}/>`:null}<//>`;}
export function RecruitPresetsHost(){
 const s=useStore(x=>x,Object.is,recruitPresetStore),app=useStore(x=>x),[ready,setReady]=useState(false);
 useEffect(()=>{if(!s.open)return;let live=true;Promise.all(['chess','assets','bands'].map(k=>data.load(k))).then(()=>{if(live)setReady(true);}).catch(()=>{if(live)toast('선발 목록을 불러오지 못했습니다. 다시 열어주세요.','warn');});return()=>{live=false;};},[s.open]);
 if(!s.open)return null;
 const p=s.presets.find(p=>p.id===s.active),locked=!canApplyRecruitPreset(app);
 const update=patch=>save({...s,presets:s.presets.map(x=>x.id===p.id?{...x,...patch}:x)});
 const create=()=>{const id=`recruit-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;save({...s,active:id,presets:[...s.presets,{id,name:`선발 프리셋 ${s.presets.length+1}`,entries:capture()}]});};
 return html`<${Modal} class="favorites-modal recruit-presets-modal ui-editor" width="min(12rem,96vw)" open=${true} title="선발 오퍼레이터 프리셋" micro="RECRUIT PRESETS" onClose=${()=>recruitPresetStore.set({open:false})} actions=${html`<${Button} onClick=${()=>recruitPresetStore.set({open:false})}>닫기<//>`}>
 <p class="lo-note">현재 선발 구성과 스킬·모듈·스킨을 저장합니다. 전략 연동은 전략 선택 완료 시 적용됩니다. 직접 불러오기는 전략 선택 단계까지 가능합니다.</p>
 <div class="favorites-layout"><${PresetManager} kind="stronghold.recruit-presets" state=${s} presets=${s.presets} active=${s.active} manifest=${data.get('assets')} disabled=${!ready} createLabel="현재 구성으로 새 프리셋" onSelect=${id=>save({...s,active:id})} onCreate=${create} onDuplicate=${x=>{const id=`recruit-${Date.now()}`;save({...s,active:id,presets:[...s.presets,{...x,id,faction:null,strategy:null,entries:{...x.entries},name:(x.name+' 복사').slice(0,40)}]});}} onDelete=${x=>save({...s,presets:s.presets.filter(y=>y.id!==x.id)})} onImport=${value=>save(normalizeRecruitPresets(value))}/>
 <section class="favorites-editor">${p?html`<div class="favorites-toolbar favorites-titlebar"><${PresetNameField} preset=${p} label="선발 프리셋 이름" onRename=${name=>update({name})}/></div>
 <${PresetLinks} preset=${p} presets=${s.presets} onChange=${presets=>save({...s,presets})}/>
 <div class="favorites-toolbar"><${Button} disabled=${!ready} onClick=${()=>{update({entries:capture()});toast('현재 선발 구성을 저장했습니다.');}}>현재 구성 덮어쓰기<//><${Button} disabled=${locked||!ready} onClick=${()=>{const r=applyRecruitPreset(p.id);toast(r.ok?'선발 프리셋을 적용했습니다.':'선발 프리셋을 적용하지 못했습니다.',r.ok?'info':'warn');}}>불러오기<//></div>
 ${locked?html`<p class="lo-locknote">전략 선택 단계가 끝나 이번 판의 선발 구성을 변경할 수 없습니다.</p>`:null}
 ${[5,6].map(t=>{const rows=Object.entries(p.entries).map(([id])=>data.lookup('chess',id)).filter(c=>c?.tier===t);return html`<section class="recruit-preset-tier"><h3>${t}단계 <span>${rows.length}/2</span></h3><div class="recruit-preset-cards">${rows.length?rows.map(c=>html`<div class="recruit-preset-card"><${Img} src=${chessPortraitUrl(data.get('assets'),c)}/><span>${c.name}</span></div>`):html`<p>선발 없음</p>`}</div></section>`;})}`:html`<p>추가 선발에서 구성한 뒤 새 프리셋으로 저장하세요.</p>`}</section></div><//>`;
}

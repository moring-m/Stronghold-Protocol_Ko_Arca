import {CHAT_FACTIONS,chatFaction} from '../../../shared/chat.js';
import {bindPresetFaction,normalizePresetFactions} from './factionPresetModel.js';
import {useEffect,useState} from '../../vendor/hooks.module.js';
import {html,Modal,Button,Icon} from './components.js';
import {createStore,loadPref,savePref,useStore} from '../store.js';
import {data} from '../data.js';
import {Img} from './gameComponents.js';
import {chessPortraitUrl,itemIconUrl,bondIconUrl} from './assetUrls.js';
const KEY='sp.pref.favorites';
export function normalizeFavorites(raw){
 const presets=(Array.isArray(raw?.presets)?raw.presets:[]).filter(p=>typeof p?.id==='string').slice(0,30).map(p=>({id:p.id,name:String(p.name||'프리셋').slice(0,40),operators:[...new Set((Array.isArray(p.operators)?p.operators:[]).filter(x=>typeof x==='string'))],faction:p.faction,items:[...new Set((Array.isArray(p.items)?p.items:[]).filter(x=>typeof x==='string'))]}));
 return {presets:normalizePresetFactions(presets),active:presets.some(p=>p.id===raw?.active)?raw.active:presets[0]?.id||null};
}
export const favoritesStore=createStore({...normalizeFavorites(loadPref(KEY,{})),open:false});
function save(next){const clean=normalizeFavorites(next);savePref(KEY,clean);favoritesStore.set(clean);}
export function applyFavoriteFaction(faction){const s=favoritesStore.get(),p=s.presets.find(p=>p.faction===faction);if(!faction||!p)return null;save({...s,active:p.id});return p.name;}
export function isFavorite(kind,id,getChess=(id)=>data.lookup('chess',id)){
 const s=favoritesStore.get(),p=s.presets.find(p=>p.id===s.active);if(!p)return false;
 const c=kind==='chess'?getChess(id):data.lookup('items',id);
 if(kind==='chess' && c?.optionalRecruit)return false;
 return (kind==='chess'?p.operators:p.items).includes(c?.baseId||c?.chessId||id);
}
export function FavoritesButton({class:cls='',view='shop'}){if(view==='editor')return html`<${Button} variant="secondary" size="sm" icon="star" class=${`lo-favorites ${cls}`} onClick=${()=>favoritesStore.set({open:true})} title="선호 오퍼레이터·장비 프리셋">선호 프리셋<//>`;return html`<button type="button" class=${`toolbtn toolbtn--favorite toolbtn--icon ${cls}`} onClick=${()=>favoritesStore.set({open:true})} title="선호 프리셋" aria-label="선호 프리셋"><${Icon} name="star" /></button>`;}
export function filterFavoriteOperators(rows,{query='',bond='',tier=''}={}) { return rows.filter(c=>c.globalReleased!==false&&!c.optionalRecruit&&String(c.name||'').toLowerCase().includes(query.toLowerCase())&&(!bond||(c.bonds||[]).includes(bond))&&(!tier||c.tier===Number(tier))); }
export function FavoritesHost(){
 const s=useStore(x=>x,Object.is,favoritesStore),[ready,setReady]=useState(false),[tab,setTab]=useState('operators'),[query,setQuery]=useState(''),[bond,setBond]=useState(''),[tier,setTier]=useState('');
 useEffect(()=>{if(s.open)Promise.all(['chess','items','bonds','assets','local'].map(k=>data.load(k))).then(()=>setReady(true));},[s.open]);
 if(!s.open)return null;
 const p=s.presets.find(p=>p.id===s.active),m=data.get('assets');
 const available=Object.values(data.get(tab==='operators'?'chess':'items')||{}).filter(c=>tab==='operators'?(c.globalReleased!==false&&!c.isGolden&&!c.isHidden&&!c.isDiy&&!c.optionalRecruit&&c.visible):(!c.isGolden&&!c.hideInShop&&!c.shopExcluded&&c.visible!==false));
 const rows=tab==='operators'?filterFavoriteOperators(available,{query,bond,tier}):available.filter(c=>String(c.name||'').toLowerCase().includes(query.toLowerCase()));
 const update=(patch)=>save({...s,presets:s.presets.map(x=>x.id===p.id?{...x,...patch}:x)});
 const create=()=>{const id=`fav-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;save({...s,active:id,presets:[...s.presets,{id,name:`프리셋 ${s.presets.length+1}`,operators:[],items:[]}]});};
 return html`<${Modal} class="favorites-modal ui-editor" width="min(15rem,96vw)" open=${true} title="선호 오퍼레이터·장비" micro="FAVORITE PRESETS" onClose=${()=>favoritesStore.set({open:false})} actions=${html`<${Button} onClick=${()=>favoritesStore.set({open:false})}>닫기<//>`}>
 <p class="lo-note">활성 프리셋의 오퍼레이터·장비를 상점에서 별표로 표시합니다. 자동 저장됩니다.</p>
 <div class="favorites-layout"><aside class="favorites-presets"><h3>프리셋 목록</h3><${Button} disabled=${s.presets.length>=30} onClick=${create}>새 프리셋<//><div class="favorites-preset-list">${s.presets.map(x=>html`<button type="button" class=${`favorites-preset ${s.active===x.id?'is-on':''}`} aria-pressed=${s.active===x.id} onClick=${()=>save({...s,active:x.id})}><strong class="preset-name-row"><span>${x.name}</span>${x.faction?html`<${Img} class="preset-faction-icon" src=${bondIconUrl(m,chatFaction(x.faction)?.bondId)}/>`:null}</strong>${x.faction?html`<small class="preset-faction-label">${x.faction} 연동</small>`:null}<small>오퍼레이터 ${x.operators.length} · 장비 ${x.items.length}</small></button>`)}</div></aside><section class="favorites-editor">
 ${p?html`<div class="favorites-toolbar favorites-titlebar"><input aria-label="프리셋 이름" maxlength="40" value=${p.name} onInput=${e=>update({name:e.target.value})}/><${Button} onClick=${()=>{const id=`fav-${Date.now()}`;save({...s,active:id,presets:[...s.presets,{...p,id,faction:null,name:p.name+' 복사'}]});}} disabled=${s.presets.length>=30}>복제<//><${Button} onClick=${()=>save({...s,presets:s.presets.filter(x=>x.id!==p.id)})}>삭제<//></div>`:null}
 ${p?html`<div class="preset-faction-link"><label>진영 연동<select aria-label="선호 프리셋 연동 진영" value=${p.faction||''} onChange=${e=>save({...s,presets:bindPresetFaction(s.presets,p.id,e.target.value)})}><option value="">연동 안 함</option>${CHAT_FACTIONS.map(f=>html`<option value=${f.name}>${f.name}</option>`)}</select></label><p>채팅에서 진영을 선택하면 자동 적용됩니다. 이미 연결된 진영은 이 프리셋으로 연결이 이동합니다.</p></div>`:null}
 ${p?html`<div class="favorites-toolbar lo-seg">${['operators','items'].map(t=>html`<${Button} variant="ghost" class=${t===tab?'is-on':''} onClick=${()=>setTab(t)}>${t==='operators'?'오퍼레이터':'장비'} (${p[t].length})<//>`)}<input aria-label="선호 목록 검색" placeholder="이름 검색" value=${query} onInput=${e=>setQuery(e.target.value)}/></div>
 ${tab==='operators'?html`<div class="favorites-toolbar"><select aria-label="맹약 필터" value=${bond} onChange=${e=>setBond(e.target.value)}><option value="">모든 맹약</option>${Object.entries(data.get('bonds')||{}).map(([id,b])=>html`<option value=${id}>${b.name||id}</option>`)}</select><select aria-label="등급 필터" value=${tier} onChange=${e=>setTier(e.target.value)}><option value="">모든 등급</option>${[1,2,3,4,5,6].map(t=>html`<option value=${t}>${t}단계</option>`)}</select><${Button} variant="ghost" onClick=${()=>{setBond('');setTier('');setQuery('');}}>필터 초기화<//></div>`:null}
 <div class="favorites-grid">${ready?rows.map(c=>{const id=c.chessId||c.itemId||c.id||c.key;if(!id)return null;const checked=p[tab].includes(id);return html`<button type="button" class=${`favorites-card ${checked?'is-on':''}`} aria-pressed=${checked} title=${c.name||id} onClick=${()=>update({[tab]:checked?p[tab].filter(x=>x!==id):[...p[tab],id]})}><${Img} src=${tab==='operators'?chessPortraitUrl(m,c):itemIconUrl(m,c)} /><span>${c.name||id}</span><b>${checked?'★':'☆'}</b></button>`;}):'목록 불러오는 중…'}</div>`:html`<p>새 프리셋을 만들어 선호 목록을 추가하세요.</p>`}
 </section></div><//>`;
}

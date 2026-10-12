import {withLaboratoryDummy,LAB_DUMMY_BOSS,LAB_DUMMY_FIELDS} from '../../../shared/laboratoryDummy.js';
import { useEffect, useMemo, useState } from '../../vendor/hooks.module.js';
import { matchesKoreanSearch, laboratoryEquipment } from '../../../shared/search.js';
import { html, Button, Icon, MicroLabel, TierChip, TextField, Modal } from './components.js';
import { data, useData, matchData } from '../data.js';
import { tr } from '../i18n/i18n.js';
import { net } from '../net.js';
import { store, useStore, loadPref, savePref } from '../store.js';
import { toastError } from './toasts.js';
import { extensionSelectionCount,customExtensionCatalog, applyCustomExtensions } from '../../../shared/customExtensions.js';
import { laboratoryOptions } from '../../../shared/laboratoryOptions.js';
import { MAP_PREVIEWS } from './mapPreviews.js';
import { useSettings } from './settings.js';
import { hotkeyLabel } from './gameLogic/shortcuts.js';
import { SettingsButton } from './settings.js';
import { CustomExtensionsDialog } from './customExtensions.js';
import { LoadoutButton } from '../screens/loadout.js';
import { startLaboratory, captureLaboratorySetup, restoreLaboratorySetup, restartLaboratory } from '../laboratory.js';
import { BOND_LAYER_CAP } from '../../../shared/constants.js';
import { Img, BandIcon, BondGlyph, RichText, GAME_FILES } from './gameComponents.js';
import { ChessCard, ItemCard, useTwoTap, mergeHint } from './shopBar.js';
import { shopBlockReason } from './gameLogic.js';
import { chessAvatarUrl, itemIconUrl, enemyIconUrl } from './assetUrls.js';

const sortedBonds = () => [...matchData.list('bonds')].sort((a,b)=>Number(!!b.isCore)-Number(!!a.isCore)||(a.bondOrder??0)-(b.bondOrder??0));

export function LaboratoryScreen() {
  const entry = useStore(s=>s.ui.laboratorySetup);
  return html`<div class="screen lab-screen"><header class="topbar"><div class="topbar__left"><${Button} variant="ghost" icon="chevronLeft" disabled=${!!entry?.busy} onClick=${()=>store.patch('ui',{laboratorySetup:null})}>돌아가기<//></div><div class="topbar__center"><${MicroLabel} tone="mint">LABORATORY SETUP<//><h1 class="topbar__title">실험실 설정</h1></div><div class="topbar__right"><${SettingsButton}/></div></header><main class="screen__scroll lab-screen__body"><${LaboratorySetup} difficulty=${entry?.difficulty||'NORMAL'}/></main></div>`;
}

export function LaboratorySetup({difficulty}) {
  const ready = useData(...GAME_FILES);
  const [setup, setSetup] = useState({ stageId: '', bossId: '', bandId: '', kind: 'boss', players:1 });
  const [busy, setBusy] = useState(false);
  const [search,setSearch] = useState('');
  const [customOpen,setCustomOpen] = useState(false), [extensions,setExtensions] = useState(null);
  const raw=Object.fromEntries(GAME_FILES.map(k=>[k,data.get(k)||{}]));
  const catalog=customExtensionCatalog(raw);
  const customExtensions=extensions||{bonds:catalog.bonds.map(r=>r.id),stages:catalog.stages.map(r=>r.id)};
  const configured=withLaboratoryDummy(applyCustomExtensions(raw,customExtensions));
  const options = laboratoryOptions(configured.config, configured.bosses, difficulty);
  const kind = setup.kind === 'hidden' && options.hiddenBossIds.length ? 'hidden' : 'boss';
  const stages = customExtensionCatalog(configured).disabledStages.filter(r => options.stageIds.includes(r.id));
  const bosses = (kind === 'hidden' ? options.hiddenBossIds : options.bossIds).map(id => configured.bosses[id]);
  const bands = Object.values(configured.bands);
  const selected = { ...setup, kind, stageId: stages.some(r=>r.id===setup.stageId)?setup.stageId:stages[0]?.id||'',
    bossId: bosses.some(b=>b.bossId===setup.bossId)?setup.bossId:bosses[0]?.bossId||'', bandId: bands.some(r=>r.bandId===setup.bandId)?setup.bandId:bands[0]?.bandId||'' };
  const start = async () => { setBusy(true); store.patch('ui',{laboratorySetup:{difficulty,busy:true}}); try { await startLaboratory({...selected,difficulty,customExtensions}); } catch(e) { toastError(e); setBusy(false); store.patch('ui',{laboratorySetup:{difficulty,busy:false}}); } };
  const boss = bosses.find(b=>b.bossId===selected.bossId), band=bands.find(b=>b.bandId===selected.bandId);
  const heading=(n,label,sub)=>html`<div class="section-label"><span class="section-label__idx num">${n}</span>${label}<${MicroLabel}>${sub}<//></div>`;
  return html`<section class="lab-setup lab-setup--cards">
    <div class="lab-panel">${heading('01','전장 선택','BATTLEFIELD')}<div class="lab-map-grid">${stages.map(r=>html`<button type="button" class=${'lab-map-card'+(selected.stageId===r.id?' is-selected':'')} aria-pressed=${selected.stageId===r.id} disabled=${busy} onClick=${()=>setSetup({...selected,stageId:r.id})}><${Img} src=${MAP_PREVIEWS[r.id]} fallback=${html`<${Icon} name="book"/>`}/><span>${r.name}</span>${selected.stageId===r.id?html`<span class="lab-check">✓</span>`:null}</button>`)}</div></div>
    <div class="lab-panel">${heading('02','보스 선택','TARGET')}<div class="lab-kind">${[['boss','일반 보스'],...(options.hiddenBossIds.length ? [['hidden','히든 보스']] : [])].map(([id,name])=>html`<button type="button" aria-pressed=${selected.kind===id} disabled=${busy} class=${selected.kind===id?'is-selected':''} onClick=${()=>setSetup({...selected,kind:id,bossId:''})}>${name}</button>`)}</div><div class="lab-player-count"><span>인원 기준</span><div role="group" aria-label="실험실 인원 기준" title="플레이는 1인으로 진행하며 선택한 인원의 적 수치와 보스 체력을 적용합니다.">${[1,2,3,4].map(n=>html`<button type="button" aria-pressed=${(selected.players||1)===n} disabled=${busy} onClick=${()=>setSetup({...selected,players:n})}>${n}인</button>`)}</div></div><div class="lab-choice-grid">${bosses.map(r=>html`<button type="button" data-boss=${r.bossId} class=${'lab-choice'+(r.bossId===selected.bossId?' is-selected':'')} aria-pressed=${r.bossId===selected.bossId} disabled=${busy} onClick=${()=>setSetup({...selected,bossId:r.bossId})}><${Img} src=${enemyIconUrl(data.get('assets'),r.laboratoryDummy?'enemy_1516_jakill':r.enemyKey)} fallback=${html`<${Icon} name="shield"/>`}/><span>${r.name}</span></button>`)}</div><div class="lab-selection-detail"><b>${boss?.name}</b><${RichText} text=${(boss?.abilities||[]).map(t=>tr(t)).join('\n')}/></div></div>
    <div class="lab-panel">${heading('03','전략 선택','STRATEGY')}<label class="lab-search-field"><${Icon} name="search"/><input aria-label="전략 검색" placeholder="전략 검색" value=${search} disabled=${busy} onInput=${e=>setSearch(e.currentTarget.value)}/></label><div class="lab-choice-grid lab-strategies">${bands.filter(r=>!search||r.name?.toLowerCase().includes(search.toLowerCase())).map(r=>html`<button type="button" data-band=${r.bandId} class=${'lab-choice'+(r.bandId===selected.bandId?' is-selected':'')} aria-pressed=${r.bandId===selected.bandId} disabled=${busy} onClick=${()=>setSetup({...selected,bandId:r.bandId})}><${BandIcon} bandId=${r.bandId}/><span>${r.name}</span></button>`)}</div><div class="lab-selection-detail"><b>${band?.effectName||band?.name}</b><${RichText} text=${band?.desc}/></div></div>
    <footer class="lab-start"><div class="lab-start__summary"><${Icon} name="flask"/><span><b>${stages.find(r=>r.id===selected.stageId)?.name} · ${boss?.name}</b><small>${band?.name} 전략 · ${selected.kind==='hidden'?'히든':'일반'} 보스 · ${selected.players||1}인 기준 · 전투 1회</small></span></div><div class="lab-start__actions"><${LoadoutButton} from="lobby" size="xl" class="lab-loadout" disabled=${busy}/><${Button} size="xl" icon="plus" disabled=${!ready||busy} onClick=${()=>setCustomOpen(true)}>커스텀 설정 <span class="lo-entry__n num">${extensionSelectionCount(customExtensions)}</span><//><${Button} class="lab-start-battle" variant="primary" size="xl" loading=${busy} disabled=${!ready||busy||!selected.bossId||!selected.stageId||!selected.bandId} onClick=${start}>전투 준비<//></div></footer>
    <${CustomExtensionsDialog} open=${customOpen} room=${{code:'LAB-SETUP',mode:'solo',difficulty,customExtensions,customExtensionCatalog:catalog}} isHost=${true} disabled=${busy} additionsOnly=${true} onClose=${()=>setCustomOpen(false)} onSave=${selection=>{setExtensions(selection);setCustomOpen(false);}}/>
  </section>`;
}

function StackEditor({ bond, layers, disabled, limit=BOND_LAYER_CAP }) {
  const [value,setValue] = useState(String(layers));
  useEffect(()=>setValue(String(layers)),[layers]);
  const apply = async () => { const n=Number(value); if(!Number.isInteger(n)||n<0||n>limit)return; try { await net.request('g.labStack',{bondId:bond.bondId,layers:n}); }catch(e){toastError(e);} };
  return html`<div class="scard scard--item lab-stack"><span class="scard__bg" aria-hidden="true"></span><span class="lab-stack__icon"><${BondGlyph} bondId=${bond.bondId}/></span><span class="scard__body"><span class="scard__name">${bond.name}</span><small>현재 ${layers} 중첩</small><span class="lab-stack__controls"><input type="number" min="0" max=${limit===Number.MAX_SAFE_INTEGER?undefined:limit} step="1" aria-label=${bond.name+' 중첩'} value=${value} disabled=${disabled} onInput=${e=>setValue(e.currentTarget.value)} onKeyDown=${e=>{if(e.key==='Enter')apply();}}/><${Button} size="sm" disabled=${disabled||value.trim()===''||!Number.isInteger(Number(value))||Number(value)<0||Number(value)>limit} onClick=${apply}>적용<//></span></span></div>`;
}

function LaboratoryPresets({disabled}) {
 const [open,setOpen]=useState(null),[name,setName]=useState('실험실 설정 1'),[selected,setSelected]=useState(''),[saved,setSaved]=useState(()=>{const v=loadPref('laboratory.presets',[]);return Array.isArray(v)?v.filter(p=>p?.snapshot?.kind==='stronghold.laboratory').slice(0,20):[];});
 const persist=next=>{savePref('laboratory.presets',next);if(JSON.stringify(loadPref('laboratory.presets',null))!==JSON.stringify(next))throw new Error('브라우저 저장 공간이 부족해 설정을 저장하지 못했습니다.');setSaved(next);};
 const save=()=>{try{const label=name.trim();if(!label)return;const snapshot=captureLaboratorySetup(),entry={name:label,snapshot,savedAt:Date.now()};persist([entry,...saved.filter(p=>p.name!==label)].slice(0,20));setOpen(null);}catch(e){toastError(e);}};
 const load=()=>{try{const entry=saved.find(p=>p.name===selected);if(!entry)return;restoreLaboratorySetup(entry.snapshot);setOpen(null);}catch(e){toastError(e);}};
 return html`<span class="lab-presets"><button type="button" disabled=${disabled} onClick=${()=>setOpen('save')}><${Icon} name="save"/>저장</button><button type="button" disabled=${disabled||!saved.length} onClick=${()=>{setSelected(saved[0]?.name||'');setOpen('load');}}><${Icon} name="load"/>불러오기</button>
 <${Modal} open=${!!open} title=${open==='save'?'실험실 설정 저장':'실험실 설정 불러오기'} micro="LABORATORY PRESETS" onClose=${()=>setOpen(null)} actions=${html`<${Button} variant="secondary" onClick=${()=>setOpen(null)}>취소<//><${Button} variant="primary" disabled=${open==='save'?!name.trim():!selected} onClick=${open==='save'?save:load}>${open==='save'?'저장':'불러오기'}<//>`}>
 ${open==='save'?html`<${TextField} value=${name} placeholder="저장 이름" aria-label="저장 이름" onInput=${setName}/><p class="t-lo">오퍼레이터·장비와 배치만 이 브라우저에 저장합니다. 오퍼레이터 설정과 선발 설정은 저장하지 않습니다. 같은 이름은 덮어씁니다.</p>`:html`<div class="lab-preset-list">${saved.map(entry=>html`<button type="button" aria-pressed=${selected===entry.name} onClick=${()=>setSelected(entry.name)}><b>${entry.name}</b><small>${matchData.lookup('stages',entry.snapshot.stageId)?.name||'저장된 맵'} · ${new Date(entry.savedAt).toLocaleDateString('ko-KR')}</small></button>`)}</div><p class="t-lo">같은 맵에서는 배치를 복원합니다. 다른 맵에서는 현재 대기석을 비우고 저장한 오퍼레이터와 장비를 대기석·임시 대기석에 놓습니다. 현재 선발하지 않은 오퍼레이터는 불러오지 않습니다.</p>`}
 <//></span>`;
}

export function LaboratoryBar({priv,editable,collapsed,onCollapse,barRef,onDetail,onDetailClose,onArm}) {
  const lab=useStore(s=>s.match.public?.laboratory);
 const unlimited=useStore(s=>s.match.public?.customExtensions?.rules?.includes('unlimitedLayers'));
  const [tab,setTab]=useState('bonds'), [pending,setPending]=useState(null), [filters,setFilters]=useState({});
  const {query='',tier=null,bondFilter=''}=filters[tab]||{};
  const updateFilter=patch=>setFilters(previous=>({...previous,[tab]:{...previous[tab],...patch}}));
  const setQuery=query=>updateFilter({query}),setTier=tier=>updateFilter({tier}),setBondFilter=bondFilter=>updateFilter({bondFilter});
  const remaining=Math.max(0,(priv?.deployCap??8)-(priv?.deployCount??0));
  const m=data.get('assets');
  const preferences=useSettings();
  const collapseKey=hotkeyLabel(preferences.keys.collapseShop);
  const [page,setPage]=useState(0);
  useEffect(()=>{setPage(0);},[tab,query,tier,bondFilter,priv.loadout]);
  const gain=async(kind,id)=>{if(pending)return;setPending(id);try{await net.request('g.labGain',{kind,id});}catch(e){toastError(e);}finally{setPending(null);}};
  const rows = useMemo(() => (tab==='bonds'?sortedBonds().filter(b=>!b.noStack):tab==='chess'?matchData.list('chess').filter(c=>c.visible&&!c.isHidden&&!c.isGolden&&(!c.optionalRecruit||priv.loadout?.[c.baseId||c.chessId]?.selected===true)):matchData.list('items').filter(i=>laboratoryEquipment(i)&&!i.isGolden)).filter(r=>matchesKoreanSearch(tr(r.name||''),query)&&(tab==='bonds'||tier==null||r.tier===tier)&&(tab!=='chess'||!bondFilter||r.bonds?.includes(bondFilter))).sort((a,b)=>tab==='bonds'?0:(a.tier??0)-(b.tier??0)||(a.sortId??0)-(b.sortId??0)||String(a.chessId||a.id).localeCompare(String(b.chessId||b.id))), [tab,query,tier,bondFilter,priv.loadout]);
  const pageCount=Math.max(1,Math.ceil(rows.length/7)), currentPage=Math.min(page,pageCount-1);
  const visibleRows=rows.slice(currentPage*7,(currentPage+1)*7);
  const keys=new Set(collapsed?[]:visibleRows.map(r=>(tab==='chess'?'chess:':'item:')+(r.chessId||r.id)));
  const [armed,setArmed]=useTwoTap({editable:editable&&!pending,keys});
  useEffect(()=>{onArm?.(armed?{kind:tab==='chess'?'chess':'item',id:armed.slice(armed.indexOf(':')+1)}:null);},[armed,tab]);
  useEffect(()=>()=>onArm?.(null),[]);
  const tap=(r,reason)=>{const id=r.chessId||r.id,kind=tab==='chess'?'chess':'item',key=kind+':'+id;if(armed!==key){setArmed(key);onDetail?.(id,kind,kind==='chess'?mergeHint(priv,id):null);return;}if(reason)return;setArmed(null);onDetailClose?.();gain(kind,id);};
  if(collapsed)return html`<div class="shopbar-tab" ref=${barRef}><button class="shopbar-tab__btn" onClick=${()=>onCollapse(false)}><${Icon} name="chevronLeft"/>실험실 메뉴 <kbd>${collapseKey}</kbd></button></div>`;
  return html`<section class=${'shopbar lab-bar'+(armed?' has-armed':'')} ref=${barRef} aria-label="실험실 메뉴">
    <div class="shopbar__tools lab-menu-tabs"><${LaboratoryPresets} disabled=${!editable}/><span class="shopbar__remain">배치 가능 오퍼레이터: <b class="num">${remaining}</b></span>${[['bonds','맹약','shield'],['chess','오퍼레이터','user'],['items','장비','sword'],...(lab?.bossId===LAB_DUMMY_BOSS?[['target','대상 스펙','shield']]:[])].map(([id,label,icon])=>html`<button type="button" class=${'lab-menu-tab'+(tab===id?' is-on':'')} aria-pressed=${tab===id} onClick=${()=>{setTab(id);}}><${Icon} name=${icon}/>${label}</button>`)}</div>
    ${tab==='target'?html`<div class="lab-shop-panel shopbar__row"><${LaboratoryTargetEditor} disabled=${!editable}/></div>`:html`<div class="lab-shop-panel shopbar__row"><div class="lab-filters"><div class="lab-tier-filter lo-chips" aria-label="등급 필터">${tab!=='bonds'?['전체','I','II','III','IV','V','VI'].map((label,index)=>html`<button type="button" aria-label=${label==='전체'?'모든 단계':label+' 단계'} aria-pressed=${tier===(index||null)} class=${'lo-chip'+(index?' lo-chip--tier lo-chip--t'+index:'')+(tier===(index||null)?' is-on':'')} onClick=${()=>setTier(tier===index?null:index||null)}><span class="num">${label}</span></button>`):null}</div>${tab==='chess'?html`<label class="lo-select"><span class="lo-select__k">맹약</span><select aria-label="맹약 필터" value=${bondFilter} onChange=${e=>setBondFilter(e.currentTarget.value)}><option value="">모든 맹약</option>${sortedBonds().map(r=>html`<option value=${r.bondId}>${r.name}</option>`)}</select></label>`:null}<${TextField} size="sm" icon="search" class="lo-search lab-filter-search" value=${query} placeholder="검색" aria-label="실험실 검색" onInput=${v=>setQuery(v)}/></div>
    <div class=${'lab-catalog lab-catalog--'+tab}>${visibleRows.map(r=>{if(tab==='bonds')return html`<${StackEditor} key=${r.bondId} bond=${r} limit=${unlimited?Number.MAX_SAFE_INTEGER:BOND_LAYER_CAP} layers=${(priv.bonds||[]).find(b=>b.bondId===r.bondId)?.layers||0} disabled=${!editable}/>`;const slot={kind:tab==='chess'?'chess':'item',id:r.chessId||r.id,price:0,basePrice:0,sold:false};const reason=shopBlockReason('buy',{priv,editable:editable&&!pending,slot,getChess:id=>matchData.lookup('chess',id),getItem:id=>matchData.lookup('items',id)});const props={key:slot.id,slot,idx:slot.id,priv,free:false,hidePrice:true,showFavorite:false,reason,armed:armed===slot.kind+':'+slot.id,onTap:()=>tap(r,reason),onBuy:()=>gain(slot.kind,slot.id),onDetail:onDetail||(()=>{})};return tab==='chess'?html`<${ChessCard} ...${props}/>`:html`<${ItemCard} ...${props}/>`;})}${!rows.length?html`<p class="lab-empty t-dim">검색 결과가 없습니다.</p>`:null}</div><div class="funds lab-pages"><button type="button" class="lab-page-arrow" aria-label="이전 항목" disabled=${currentPage===0} onClick=${()=>{setArmed(null);setPage(currentPage-1);}}><${Icon} name="chevronUp"/></button><span class="num lab-pages__count">${currentPage+1} / ${pageCount}</span><button type="button" class="lab-page-arrow" aria-label="다음 항목" disabled=${currentPage>=pageCount-1} onClick=${()=>{setArmed(null);setPage(currentPage+1);}}><${Icon} name="chevronDown"/></button><button type="button" class="funds__collapse" onClick=${()=>onCollapse(true)}><${Icon} name="chevronLeft"/>접기 <kbd>${collapseKey}</kbd></button></div></div>
  `}</section>`;
}

export function LaboratoryRestartButton({class:cls='',disabled=false}={}){
 const [busy,setBusy]=useState(false);
 return html`<button type="button" class=${cls||'lab-restart'} disabled=${disabled||busy} onClick=${async()=>{setBusy(true);try{await restartLaboratory();}catch(e){toastError(e);}finally{setBusy(false);}}}><span class="readybtn__box"><${Icon} name="refresh"/></span><span class="readybtn__label">재시작</span></button>`;
}

export function LaboratoryTargetEditor({disabled=false}={}){
 const current=useStore(s=>s.match.public?.laboratory?.dummyStats),[draft,setDraft]=useState(current||{}),[busy,setBusy]=useState(false);
 useEffect(()=>{setDraft(current||{});},[current]);
 const valid=LAB_DUMMY_FIELDS.every(f=>String(draft[f.id]??'').trim()!==''&&Number.isFinite(Number(draft[f.id]))&&Number(draft[f.id])>=f.min&&Number(draft[f.id])<=f.max);
 const apply=async reset=>{setBusy(true);try{await net.request('g.labDummyStats',reset?{reset:true}:{stats:Object.fromEntries(LAB_DUMMY_FIELDS.map(f=>[f.id,Number(draft[f.id])]))});}catch(e){toastError(e);}finally{setBusy(false);}};
 return html`<div class="lab-target-editor">${LAB_DUMMY_FIELDS.map(f=>html`<label><span>${f.name}</span><input type="number" min=${f.min} max=${f.max} step="any" aria-label=${'제셀톤 '+f.name} value=${draft[f.id]??''} disabled=${disabled||busy} onInput=${e=>setDraft({...draft,[f.id]:e.target.value})}/></label>`)}<div class="lab-target-editor__actions"><${Button} variant="secondary" disabled=${disabled||busy} onClick=${()=>apply(true)}>스펙 초기화<//><${Button} variant="primary" disabled=${disabled||busy||!valid} onClick=${()=>apply(false)}>적용<//></div></div>`;
}
export function LaboratoryTargetButton(){
 const [open,setOpen]=useState(false);
 return html`<button type="button" class="gm__gear" aria-label="제셀톤 대상 스펙" title="대상 스펙" onClick=${()=>setOpen(true)}><${Icon} name="shield"/></button><${Modal} open=${open} title="제셀톤 윌리엄스 · 대상 스펙" micro="DAMAGE TARGET" onClose=${()=>setOpen(false)}><${LaboratoryTargetEditor}/><//>`;
}

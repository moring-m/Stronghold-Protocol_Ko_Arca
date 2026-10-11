import { useEffect, useMemo, useState } from '../../vendor/hooks.module.js';
import { matchesKoreanSearch, laboratoryEquipment } from '../../../shared/search.js';
import { html, Button, Icon, MicroLabel, TierChip, TextField } from './components.js';
import { data, useData, matchData } from '../data.js';
import { tr } from '../i18n/i18n.js';
import { net } from '../net.js';
import { store, useStore } from '../store.js';
import { toastError } from './toasts.js';
import { customExtensionCatalog, applyCustomExtensions } from '../../../shared/customExtensions.js';
import { laboratoryOptions } from '../../../shared/laboratoryOptions.js';
import { MAP_PREVIEWS } from './mapPreviews.js';
import { useSettings } from './settings.js';
import { hotkeyLabel } from './gameLogic/shortcuts.js';
import { SettingsButton } from './settings.js';
import { CustomExtensionsDialog } from './customExtensions.js';
import { LoadoutButton } from '../screens/loadout.js';
import { startLaboratory } from '../laboratory.js';
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
  const [setup, setSetup] = useState({ stageId: '', bossId: '', bandId: '', kind: 'boss' });
  const [busy, setBusy] = useState(false);
  const [search,setSearch] = useState('');
  const [customOpen,setCustomOpen] = useState(false), [extensions,setExtensions] = useState(null);
  const raw=Object.fromEntries(GAME_FILES.map(k=>[k,data.get(k)||{}]));
  const catalog=customExtensionCatalog(raw);
  const customExtensions=extensions||{bonds:catalog.bonds.map(r=>r.id),stages:catalog.stages.map(r=>r.id)};
  const configured=applyCustomExtensions(raw,customExtensions);
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
    <div class="lab-panel">${heading('02','보스 선택','TARGET')}<div class="lab-kind">${[['boss','일반 보스'],...(options.hiddenBossIds.length ? [['hidden','히든 보스']] : [])].map(([id,name])=>html`<button type="button" aria-pressed=${selected.kind===id} disabled=${busy} class=${selected.kind===id?'is-selected':''} onClick=${()=>setSetup({...selected,kind:id,bossId:''})}>${name}</button>`)}</div><div class="lab-choice-grid">${bosses.map(r=>html`<button type="button" data-boss=${r.bossId} class=${'lab-choice'+(r.bossId===selected.bossId?' is-selected':'')} aria-pressed=${r.bossId===selected.bossId} disabled=${busy} onClick=${()=>setSetup({...selected,bossId:r.bossId})}><${Img} src=${enemyIconUrl(data.get('assets'),r.enemyKey)} fallback=${html`<${Icon} name="shield"/>`}/><span>${r.name}</span></button>`)}</div><div class="lab-selection-detail"><b>${boss?.name}</b><${RichText} text=${(boss?.abilities||[]).map(t=>tr(t)).join('\n')}/></div></div>
    <div class="lab-panel">${heading('03','전략 선택','STRATEGY')}<label class="lab-search-field"><${Icon} name="search"/><input aria-label="전략 검색" placeholder="전략 검색" value=${search} disabled=${busy} onInput=${e=>setSearch(e.currentTarget.value)}/></label><div class="lab-choice-grid lab-strategies">${bands.filter(r=>!search||r.name?.toLowerCase().includes(search.toLowerCase())).map(r=>html`<button type="button" data-band=${r.bandId} class=${'lab-choice'+(r.bandId===selected.bandId?' is-selected':'')} aria-pressed=${r.bandId===selected.bandId} disabled=${busy} onClick=${()=>setSetup({...selected,bandId:r.bandId})}><${BandIcon} bandId=${r.bandId}/><span>${r.name}</span></button>`)}</div><div class="lab-selection-detail"><b>${band?.effectName||band?.name}</b><${RichText} text=${band?.desc}/></div></div>
    <footer class="lab-start"><div class="lab-start__summary"><${Icon} name="flask"/><span><b>${stages.find(r=>r.id===selected.stageId)?.name} · ${boss?.name}</b><small>${band?.name} 전략 · ${selected.kind==='hidden'?'히든':'일반'} 보스 · 전투 1회</small></span></div><div class="lab-start__actions"><${LoadoutButton} from="lobby" size="xl" class="lab-loadout" disabled=${busy}/><${Button} size="xl" icon="plus" disabled=${!ready||busy} onClick=${()=>setCustomOpen(true)}>커스텀 설정 <span class="lo-entry__n num">${customExtensions.bonds.length+customExtensions.stages.length}</span><//><${Button} class="lab-start-battle" variant="primary" size="xl" loading=${busy} disabled=${!ready||busy||!selected.bossId||!selected.stageId||!selected.bandId} onClick=${start}>전투 준비<//></div></footer>
    <${CustomExtensionsDialog} open=${customOpen} room=${{code:'LAB-SETUP',mode:'solo',difficulty,customExtensions,customExtensionCatalog:catalog}} isHost=${true} disabled=${busy} additionsOnly=${true} onClose=${()=>setCustomOpen(false)} onSave=${selection=>{setExtensions(selection);setCustomOpen(false);}}/>
  </section>`;
}

function StackEditor({ bond, layers, disabled }) {
  const [value,setValue] = useState(String(layers));
  useEffect(()=>setValue(String(layers)),[layers]);
  const apply = async () => { const n=Number(value); if(!Number.isInteger(n)||n<0||n>BOND_LAYER_CAP)return; try { await net.request('g.labStack',{bondId:bond.bondId,layers:n}); }catch(e){toastError(e);} };
  return html`<div class="scard scard--item lab-stack"><span class="scard__bg" aria-hidden="true"></span><span class="lab-stack__icon"><${BondGlyph} bondId=${bond.bondId}/></span><span class="scard__body"><span class="scard__name">${bond.name}</span><small>현재 ${layers} 중첩</small><span class="lab-stack__controls"><input type="number" min="0" max=${BOND_LAYER_CAP} step="1" aria-label=${bond.name+' 중첩'} value=${value} disabled=${disabled} onInput=${e=>setValue(e.currentTarget.value)} onKeyDown=${e=>{if(e.key==='Enter')apply();}}/><${Button} size="sm" disabled=${disabled||value.trim()===''||!Number.isInteger(Number(value))||Number(value)<0||Number(value)>BOND_LAYER_CAP} onClick=${apply}>적용<//></span></span></div>`;
}

export function LaboratoryBar({priv,editable,collapsed,onCollapse,barRef,onDetail,onDetailClose,onArm}) {
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
    <div class="shopbar__tools lab-menu-tabs"><span class="shopbar__remain">배치 가능 오퍼레이터: <b class="num">${remaining}</b></span>${[['bonds','맹약','shield'],['chess','오퍼레이터','user'],['items','장비','sword']].map(([id,label,icon])=>html`<button type="button" class=${'lab-menu-tab'+(tab===id?' is-on':'')} aria-pressed=${tab===id} onClick=${()=>{setTab(id);}}><${Icon} name=${icon}/>${label}</button>`)}</div>
    <div class="lab-shop-panel shopbar__row"><div class="lab-filters"><div class="lab-tier-filter lo-chips" aria-label="등급 필터">${tab!=='bonds'?['전체','I','II','III','IV','V','VI'].map((label,index)=>html`<button type="button" aria-label=${label==='전체'?'모든 단계':label+' 단계'} aria-pressed=${tier===(index||null)} class=${'lo-chip'+(index?' lo-chip--tier lo-chip--t'+index:'')+(tier===(index||null)?' is-on':'')} onClick=${()=>setTier(tier===index?null:index||null)}><span class="num">${label}</span></button>`):null}</div>${tab==='chess'?html`<label class="lo-select"><span class="lo-select__k">맹약</span><select aria-label="맹약 필터" value=${bondFilter} onChange=${e=>setBondFilter(e.currentTarget.value)}><option value="">모든 맹약</option>${sortedBonds().map(r=>html`<option value=${r.bondId}>${r.name}</option>`)}</select></label>`:null}<${TextField} size="sm" icon="search" class="lo-search lab-filter-search" value=${query} placeholder="검색" aria-label="실험실 검색" onInput=${v=>setQuery(v)}/></div>
    <div class=${'lab-catalog lab-catalog--'+tab}>${visibleRows.map(r=>{if(tab==='bonds')return html`<${StackEditor} key=${r.bondId} bond=${r} layers=${(priv.bonds||[]).find(b=>b.bondId===r.bondId)?.layers||0} disabled=${!editable}/>`;const slot={kind:tab==='chess'?'chess':'item',id:r.chessId||r.id,price:0,basePrice:0,sold:false};const reason=shopBlockReason('buy',{priv,editable:editable&&!pending,slot,getChess:id=>matchData.lookup('chess',id),getItem:id=>matchData.lookup('items',id)});const props={key:slot.id,slot,idx:slot.id,priv,free:false,hidePrice:true,reason,armed:armed===slot.kind+':'+slot.id,onTap:()=>tap(r,reason),onBuy:()=>gain(slot.kind,slot.id),onDetail:onDetail||(()=>{})};return tab==='chess'?html`<${ChessCard} ...${props}/>`:html`<${ItemCard} ...${props}/>`;})}${!rows.length?html`<p class="lab-empty t-dim">검색 결과가 없습니다.</p>`:null}</div><div class="funds lab-pages"><button type="button" class="lab-page-arrow" aria-label="이전 항목" disabled=${currentPage===0} onClick=${()=>{setArmed(null);setPage(currentPage-1);}}><${Icon} name="chevronUp"/></button><span class="num lab-pages__count">${currentPage+1} / ${pageCount}</span><button type="button" class="lab-page-arrow" aria-label="다음 항목" disabled=${currentPage>=pageCount-1} onClick=${()=>{setArmed(null);setPage(currentPage+1);}}><${Icon} name="chevronDown"/></button><button type="button" class="funds__collapse" onClick=${()=>onCollapse(true)}><${Icon} name="chevronLeft"/>접기 <kbd>${collapseKey}</kbd></button></div></div>
  </section>`;
}

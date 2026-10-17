import {useState} from '../../vendor/hooks.module.js';
import {html,Button,Icon,MicroLabel} from './components.js';
import {useData,data} from '../data.js';
import {GAME_FILES,Img,BandIcon,RichText} from './gameComponents.js';
import {customExtensionCatalog,applyCustomExtensions,extensionSelectionCount} from '../../../shared/customExtensions.js';
import {CustomExtensionsDialog} from './customExtensions.js';
import {LoadoutButton} from './loadoutEntry.js';
import {MAP_PREVIEWS} from './mapPreviews.js';
import {startLaboratory} from '../laboratory.js';
import {store} from '../store.js';
import {toastError} from './toasts.js';
import {tr} from '../i18n/i18n.js';
import {enemyIconUrl} from './assetUrls.js';
export function PracticeSetup({difficulty}){
 const ready=useData(...GAME_FILES),[setup,setSetup]=useState({round:1,players:1,stageId:'',bandId:'',bossId:'',hiddenBossId:'',factions:[],bannedBonds:[]}),[busy,setBusy]=useState(false),[extensions,setExtensions]=useState(null),[customOpen,setCustomOpen]=useState(false),[bossKind,setBossKind]=useState('bossId');
 const raw=Object.fromEntries(GAME_FILES.map(k=>[k,data.get(k)||{}])),catalog=customExtensionCatalog(raw),customExtensions=extensions||{bonds:catalog.bonds.map(r=>r.id),stages:catalog.stages.map(r=>r.id)},configured=applyCustomExtensions(raw,customExtensions);
 const mode=Object.values(configured.config?.modes||{}).find(m=>m.type===(setup.players>1?'MULTI':'SINGLE')&&m.difficulty===difficulty);
 const pool=weights=>Object.keys(weights||{}).filter(id=>weights[id]>0&&configured.bosses?.[id]?.templates?.[mode?.modeId]?.template);
 const options={stageIds:mode?.stages||[],bossIds:pool(mode?.bossWeights),hiddenBossIds:pool(mode?.hiddenBossWeights)},stages=customExtensionCatalog(configured).disabledStages.filter(r=>options.stageIds.includes(r.id)),bands=Object.values(configured.bands||{}),maxRound=mode?.hiddenRound||mode?.lastRound||14;
 const selected={...setup,round:Math.min(setup.round,maxRound),stageId:stages.some(r=>r.id===setup.stageId)?setup.stageId:stages[0]?.id||'',bandId:bands.some(r=>r.bandId===setup.bandId)?setup.bandId:bands[0]?.bandId||'',bossId:options.bossIds.includes(setup.bossId)?setup.bossId:options.bossIds[0],hiddenBossId:options.hiddenBossIds.includes(setup.hiddenBossId)?setup.hiddenBossId:options.hiddenBossIds[0]};
 const set=patch=>setSetup({...selected,...patch}),toggle=(field,key)=>set({[field]:selected[field].includes(key)?selected[field].filter(k=>k!==key):[...selected[field],key]});
 const heading=(n,label,micro)=>html`<div class="section-label"><span class="section-label__idx num">${n}</span>${label}<${MicroLabel}>${micro}<//></div>`;
 const band=bands.find(b=>b.bandId===selected.bandId);
 const start=async()=>{setBusy(true);store.patch('ui',{laboratorySetup:{difficulty,practice:true,busy:true}});try{await startLaboratory({...selected,practice:true,difficulty,customExtensions});}catch(e){toastError(e);setBusy(false);store.patch('ui',{laboratorySetup:{difficulty,practice:true,busy:false}});}};
 return html`<section class="practice-setup lab-setup lab-setup--cards">
 <div class="lab-panel">${heading('01','전장 선택','BATTLEFIELD')}<div class="lab-map-grid">${stages.map(r=>html`<button type="button" class=${'lab-map-card'+(selected.stageId===r.id?' is-selected':'')} aria-pressed=${selected.stageId===r.id} disabled=${busy} onClick=${()=>set({stageId:r.id})}><${Img} src=${MAP_PREVIEWS[r.id]}/><span>${r.name}</span></button>`)}</div></div>
 <div class="lab-panel">${heading('02','진행 설정','ROUND')}<label class="practice-field">시작 라운드<select aria-label="시작 라운드" value=${selected.round} disabled=${busy} onChange=${e=>set({round:Number(e.currentTarget.value)})}>${Array.from({length:maxRound},(_,i)=>i+1).map(r=>html`<option value=${r}>${r}라운드${r===mode?.bossRound?' · 보스전':r===mode?.hiddenRound?' · 히든 보스전':''}</option>`)}</select></label>
 <label class="practice-field">인원 기준<select aria-label="연습실 인원 기준" value=${selected.players} onChange=${e=>set({players:Number(e.currentTarget.value)})}>${[1,2,3,4].map(n=>html`<option value=${n}>${n}인 기준</option>`)}</select></label>
 <div class="lab-kind" role="group" aria-label="보스 유형">${[['bossId','일반 보스',options.bossIds],['hiddenBossId','히든 보스',options.hiddenBossIds]].filter(([, ,ids])=>ids.length).map(([field,label])=>html`<button type="button" aria-pressed=${bossKind===field} class=${bossKind===field?'is-selected':''} disabled=${busy} onClick=${()=>setBossKind(field)}>${label}</button>`)}</div>
 <div class="lab-choice-grid practice-bosses">${(bossKind==='hiddenBossId'?options.hiddenBossIds:options.bossIds).map(id=>{const boss=configured.bosses[id];return html`<button type="button" data-boss=${id} class=${'lab-choice'+(selected[bossKind]===id?' is-selected':'')} aria-pressed=${selected[bossKind]===id} disabled=${busy} onClick=${()=>set({[bossKind]:id})}><${Img} src=${enemyIconUrl(data.get('assets'),boss.enemyKey)} fallback=${html`<${Icon} name="shield"/>`}/><span>${boss.name}</span></button>`;})}</div>
 <p class="t-lo">선택한 라운드부터 일반 게임처럼 진행 · 무제한 자금</p></div>
 <div class="lab-panel">${heading('03','전략 선택','STRATEGY')}<div class="lab-choice-grid lab-strategies">${bands.map(r=>html`<button type="button" data-band=${r.bandId} class=${'lab-choice'+(r.bandId===selected.bandId?' is-selected':'')} aria-pressed=${r.bandId===selected.bandId} disabled=${busy} onClick=${()=>set({bandId:r.bandId})}><${BandIcon} bandId=${r.bandId}/><span>${r.name}</span></button>`)}</div><div class="lab-selection-detail"><b>${band?.effectName||band?.name}</b><${RichText} text=${band?.desc}/></div></div>
 <div class="lab-panel practice-options">${heading('04','적 특훈 선택','TRAINING')}<p class="t-lo">최대 3개 선택 · 미선택 시 특이 특훈만 등장합니다.</p><div class="practice-chips">${Object.values(configured.factions?.types||{}).filter(t=>t.involveRandom).map(t=>html`<button type="button" aria-pressed=${selected.factions.includes(t.type)} disabled=${busy||!selected.factions.includes(t.type)&&selected.factions.length>=3} class=${selected.factions.includes(t.type)?'is-on':''} onClick=${()=>toggle('factions',t.type)}>${tr(t.name)}</button>`)}</div></div>
 <div class="lab-panel practice-options">${heading('05','맹약 밴 선택','BANS')}<p class="t-lo">선택한 맹약과 해당 오퍼레이터를 제외합니다. 미선택 시 무작위 밴은 없습니다.</p><div class="practice-chips">${Object.entries(configured.bonds||{}).filter(([,b])=>b.weight>0).map(([id,b])=>html`<button type="button" aria-pressed=${selected.bannedBonds.includes(id)} class=${selected.bannedBonds.includes(id)?'is-on':''} disabled=${busy} onClick=${()=>toggle('bannedBonds',id)}>${tr(b.name)}</button>`)}</div></div>
 <footer class="lab-start"><div class="lab-start__summary"><${Icon} name="flask"/><span><b>연습실 · ${selected.round}라운드부터</b><small>일반 상점 · 무제한 자금 · ${selected.players}인 기준</small></span></div><div class="lab-start__actions"><${LoadoutButton} from="lobby" size="xl" disabled=${busy}/><${Button} disabled=${busy||!ready} onClick=${()=>setCustomOpen(true)}>커스텀 설정 ${extensionSelectionCount(customExtensions)}<//><${Button} variant="primary" loading=${busy} disabled=${busy||!ready||!selected.stageId||!selected.bandId} onClick=${start}>연습 시작<//></div></footer>
 <${CustomExtensionsDialog} open=${customOpen} room=${{code:'PRACTICE-SETUP',mode:'solo',difficulty,customExtensions,customExtensionCatalog:catalog}} isHost=${true} disabled=${busy} additionsOnly=${true} onClose=${()=>setCustomOpen(false)} onSave=${v=>{setExtensions(v);setCustomOpen(false);}}/>
 </section>`;
}

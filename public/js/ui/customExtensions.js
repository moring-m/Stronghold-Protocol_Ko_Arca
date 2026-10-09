import {MAP_PREVIEWS} from './mapPreviews.js';
import {bondIconUrl,bandIconUrl,enemyIconUrl} from './assetUrls.js';
import {loadExtensionPresets,saveExtensionPresets,copyExtensionSelection,resolveExtensionPreset} from './customExtensionPresets.js';
import {data} from '../data.js';
import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal, Fragment, Icon } from './components.js';
import { EXTENSION_CATEGORIES,validateExtensionMinimums,customExtensionCatalog } from '../../../shared/customExtensions.js';


export function stageDifficultyLabels(stage) {
 const modes=stage?.modes||[];
 const labels=[['funny','표준'],['normal','험지'],['hard','극한'],['abyss','초월'],['training','훈련']];
 return labels.filter(([key])=>modes.some(mode=>mode.includes(key))).map(([,label])=>label);
}
const CATEGORY_ICONS={bonds:'shield',stages:'map',disabledBonds:'shield',disabledStages:'map',disabledBosses:'sword',disabledBands:'crown',forcedBonds:'shield',protectedBonds:'shield'};
function ExtensionArt({tab,entry,tables}) {
  const manifest=tables?.assets;
  const url=['bonds','disabledBonds','forcedBonds','protectedBonds'].includes(tab)?bondIconUrl(manifest,entry.id==='ursus'?'ursusShip':entry.id):tab==='disabledBands'?bandIconUrl(manifest,entry.id):tab==='disabledBosses'?enemyIconUrl(manifest,tables?.bosses?.[entry.id]?.enemyKey):null;
  if(tab==='stages'||tab==='disabledStages')return html`<span class="extension-art extension-art--map" aria-hidden="true">${MAP_PREVIEWS[entry.id]?html`<img src=${MAP_PREVIEWS[entry.id]} alt="" loading="lazy" onError=${e=>{e.currentTarget.hidden=true;}}/>`:html`<${Icon} name="map" />`}</span>`;
  return html`<span class=${`extension-art extension-art--${tab}`} aria-hidden="true">${url?html`<img src=${url} alt="" onError=${e=>{e.currentTarget.hidden=true;}}/>`:html`<${Icon} name=${CATEGORY_ICONS[tab]} />`}</span>`;
}

export function setBondBanPolicy(selection,id,policy) {
  return {...selection,
    forcedBonds:[...(selection.forcedBonds||[]).filter(x=>x!==id),...(policy==='forced'?[id]:[])],
    protectedBonds:[...(selection.protectedBonds||[]).filter(x=>x!==id),...(policy==='protected'?[id]:[])],
    disabledBonds:policy==='random'?[...(selection.disabledBonds||[])]:[...(selection.disabledBonds||[]).filter(x=>x!==id)],
  };
}

export function CustomExtensionsDialog({ open, room, isHost, disabled, onClose, onSave }) {
  const [tab,setTab] = useState('bonds');
  const [query,setQuery]=useState('');
  const [notice,setNotice]=useState('');
  const [presets,setPresets]=useState(loadExtensionPresets),[presetId,setPresetId]=useState(''),[presetName,setPresetName]=useState('');
  useEffect(()=>{if(open)setPresets(loadExtensionPresets());},[open]);
  const [tables,setTables]=useState(null),[loadError,setLoadError]=useState('');
  useEffect(()=>{if(!open)return;let live=true;setTables(null);setLoadError('');const names=['chess','bonds','items','bands','bosses','stages','config','enemies','assets'];Promise.all(names.map(k=>data.load(k))).then(()=>{if(live)setTables(Object.fromEntries(names.map(k=>[k,data.get(k)])));}).catch(()=>{if(live)setLoadError('목록을 불러오지 못했습니다. 창을 다시 열어주세요.');});return()=>{live=false;};},[open]);
  const [draft,setDraft] = useState({ bonds: [], stages: [] });
  const errors=tables?validateExtensionMinimums(tables,draft,{mode:room.mode,difficulty:room.difficulty}):[];
  useEffect(() => {
    if (open) setDraft(room.customExtensions || { bonds: room.customFactions ? ['ursus'] : [], stages: [] });
  }, [open,room.code,isHost]);
  useEffect(() => {
    if (open && !isHost) setDraft(room.customExtensions || {bonds:room.customFactions ? ['ursus'] : [],stages:[]});
  }, [open,isHost,room.customExtensions,room.customFactions]);
  const catalog = room.customExtensionCatalog ? {...customExtensionCatalog(tables||{}),...room.customExtensionCatalog} : { bonds: [{ id:'ursus',name:'우르수스',description:'우르수스 맹약과 오퍼레이터, 전용 장비, 카셰이 전략을 추가합니다.' }], stages: [] };
  const selectedPreset=presets.find(p=>p.id===presetId);
  const savePreset=()=>{const id=selectedPreset?.id||`extension-${Date.now()}`;setPresets(saveExtensionPresets([...presets.filter(p=>p.id!==id),{id,name:presetName.trim(),selection:copyExtensionSelection(draft)}]));setPresetId(id);};
  const context={mode:room.mode,difficulty:room.difficulty};
  const nextToggle=id=>{
    const enabled=!(draft[tab]||[]).includes(id);
    const next={...draft,[tab]:enabled?[...(draft[tab]||[]),id]:(draft[tab]||[]).filter(x=>x!==id)};
    if(tab==='disabledBonds'&&enabled){next.forcedBonds=(draft.forcedBonds||[]).filter(x=>x!==id);next.protectedBonds=(draft.protectedBonds||[]).filter(x=>x!==id);}
    return next;
  };
  const reason=next=>tables?validateExtensionMinimums(tables,next,context).join(' '):'목록을 불러오는 중입니다.';
  const applyDraft=next=>{const blocked=reason(next);if(blocked){setNotice(blocked);return;}setNotice('');setDraft(next);};
  const toggle=id=>applyDraft(nextToggle(id));
  const lockedReasons = tables ? [...new Set((catalog[tab]||[]).flatMap(e =>
    tab==='forcedBonds' ? ['random','forced','protected'].map(policy=>reason(setBondBanPolicy(draft,e.id,policy))) : [reason(nextToggle(e.id))]
  ).filter(Boolean))] : [];
  const lockWarning = !isHost ? '방장만 설정을 수정할 수 있습니다.' : disabled ? '현재는 설정을 수정할 수 없습니다.' : lockedReasons.length ? '현재 구성·난이도 제한으로 일부 선택을 수정할 수 없습니다.' : '';
  useEffect(()=>setNotice(''),[tab,draft,disabled,isHost,room.difficulty]);
  return html`<${Modal} open=${open} title="커스텀 확장 설정" micro="CUSTOM EXTENSIONS" class="custom-ext ui-editor" width="min(15rem,96vw)" onClose=${onClose}
    actions=${html`<span class="editor-status" aria-live="polite">${notice || (errors.length?errors.join(' '):loadError||(!tables?'목록 불러오는 중…':'최소 구성 조건 충족'))}</span><${Button} variant="secondary" onClick=${onClose} disabled=${disabled}>${isHost ? '취소' : '닫기'}<//>
      ${isHost ? html`<${Button} variant="primary" disabled=${disabled || !tables || errors.length>0} onClick=${()=>onSave(draft)}>적용<//>` : null}`}>
    <p class="lo-note">${isHost?'설정은 방 전체에 적용됩니다.':'방장이 선택한 구성이 방 전체에 적용됩니다.'}</p>
    <div class="extensions-layout"><nav class="extensions-nav" aria-label="설정 분류"><div class="extensions-menu"><h3>추가 확장</h3>
      ${EXTENSION_CATEGORIES.filter(c=>c.id!=='protectedBonds').map((c,i)=>html`<${Fragment}>${c.id==='forcedBonds'?html`<h3>금지 단계</h3>`:c.id==='disabledBonds'?html`<h3>콘텐츠 비활성화</h3>`:null}<button type="button" id=${'ext-tab-'+c.id} aria-controls=${'ext-panel-'+c.id} aria-pressed=${tab===c.id} class=${tab===c.id?'is-on':''} onClick=${()=>{setTab(c.id);setQuery('');}}><${Icon} name=${CATEGORY_ICONS[c.id]} /><span class="extensions-nav__label">${c.name}</span><span class="num">${(draft[c.id]||[]).length+(c.id==='forcedBonds'?(draft.protectedBonds||[]).length:0)}</span></button><//>`)}
      </div>
      ${isHost?html`<div class="extension-presets"><h3>프리셋</h3><select aria-label="확장 프리셋" value=${presetId} onChange=${e=>{const id=e.target.value;setPresetId(id);setPresetName(presets.find(p=>p.id===id)?.name||'');}}><option value="">새 프리셋</option>${presets.map(p=>html`<option value=${p.id}>${p.name}</option>`)}</select><input aria-label="확장 프리셋 이름" placeholder="프리셋 이름" maxlength="40" value=${presetName} onInput=${e=>setPresetName(e.target.value)}/><div class="extension-presets__actions"><${Button} variant="secondary" disabled=${disabled||!presetName.trim()||(!selectedPreset&&presets.length>=30)} onClick=${savePreset}>저장<//><${Button} variant="secondary" disabled=${disabled||!selectedPreset||!tables} onClick=${()=>applyDraft(resolveExtensionPreset(selectedPreset,catalog))}>불러오기<//><${Button} variant="ghost" disabled=${disabled||!selectedPreset} onClick=${()=>{setPresets(saveExtensionPresets(presets.filter(p=>p.id!==presetId)));setPresetId('');setPresetName('');}}>삭제<//></div></div>`:null}
    </nav><section class="extensions-editor" id=${'ext-panel-'+tab} aria-labelledby=${'ext-tab-'+tab}>
      <div class="editor-toolbar"><h3>${EXTENSION_CATEGORIES.find(c=>c.id===tab)?.name}</h3><input class="editor-search" aria-label="금지 목록 검색" placeholder="이름 검색" value=${query} onInput=${e=>setQuery(e.target.value)}/><span class="lo-count">선택 <b>${(draft[tab]||[]).length+(tab==='forcedBonds'?(draft.protectedBonds||[]).length:0)}</b></span></div>
      <p class="editor-help">${tab==='disabledBonds'?'선택한 맹약과 소속 오퍼레이터를 제외합니다. 이중 맹약은 남은 맹약을 유지합니다.':tab==='forcedBonds'?'맹약별 밴 규칙을 선택하세요. 무작위는 기존 규칙을 따릅니다.':tab.startsWith('disabled')?'체크한 요소는 게임에 등장하지 않습니다.':'체크한 확장을 이번 게임에 추가합니다.'}</p>
      ${tab==='forcedBonds'?html`<div class="extension-grid extension-grid--forcedBonds">${(catalog.forcedBonds||[]).filter(e=>!query||e.name.includes(query)||e.id.includes(query)).map(e=>{
        const policy=(draft.forcedBonds||[]).includes(e.id)?'forced':(draft.protectedBonds||[]).includes(e.id)?'protected':'random';
        return html`<div key=${e.id} class=${`custom-ext__card extension-card--ban${policy!=='random'?' is-selected':''}`}><${ExtensionArt} tab="forcedBonds" entry=${e} tables=${tables}/><span class="extension-card__text"><strong>${e.name}</strong><span class="extension-ban-options" role="group" aria-label=${e.name+' 밴 규칙'}>${[['random','무작위'],['forced','항상 밴'],['protected','밴 제외']].map(([id,label])=>html`<button type="button" data-policy=${id} class=${policy===id?'is-on':''} aria-pressed=${policy===id} disabled=${disabled||!isHost||!!reason(setBondBanPolicy(draft,e.id,id))} onClick=${()=>applyDraft(setBondBanPolicy(draft,e.id,id))}>${label}</button>`)}</span></span></div>`;
      })}</div>`:html`<div class=${`extension-grid extension-grid--${tab}`}>${(catalog[tab]||[]).filter(e=>!query||e.name.includes(query)||e.id.includes(query)).map(e=>html`<label key=${e.id} class=${`custom-ext__card${(draft[tab]||[]).includes(e.id)?(tab.startsWith('disabled')?' is-selected is-excluded':' is-selected'):''}`}><input type="checkbox" checked=${(draft[tab]||[]).includes(e.id)} disabled=${disabled||!isHost||!!reason(nextToggle(e.id))} onChange=${()=>toggle(e.id)}/><${ExtensionArt} tab=${tab} entry=${e} tables=${tables}/><span class="extension-card__text"><strong>${e.name}</strong><small>${tab==='disabledBands'?(tables?.bands?.[e.id]?.effectName||''):tab==='disabledBosses'?(tables?.bosses?.[e.id]?.hidden?'히든 보스':'일반 보스'):tab==='bonds'?e.description:(tab==='stages'||tab==='disabledStages')?stageDifficultyLabels(tables?.stages?.[e.id]).join(' · '):''}</small></span></label>`)}${!(catalog[tab]||[]).length?html`<p class="lo-empty">등록된 요소가 없습니다.</p>`:null}</div>`}
      <div class="editor-minimums"><span>최소 유지</span><b>핵심 맹약 5</b><b>맵 1</b><b>일반·히든 보스 각 1</b><b>전략 ${room.mode==='solo'?1:4}</b>${lockWarning?html`<span class="editor-limit-note" role="status" aria-live="polite">${lockWarning}</span>`:null}</div>
    </section></div>
  <//>`;
}

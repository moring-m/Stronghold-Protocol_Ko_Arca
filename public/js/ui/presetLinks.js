import {html,Button,Modal,Icon} from './components.js';
import {useEffect,useState} from '../../vendor/hooks.module.js';
import {data} from '../data.js';
import {CHAT_FACTIONS,chatFaction} from '../../../shared/chat.js';
import {bindPresetFaction} from './factionPresetModel.js';
import {bindPresetStrategy,validStrategyLink} from '../../../shared/recruitPresetLinks.js';
import {matchesKoreanSearch} from '../../../shared/search.js';
import {tr} from '../i18n/i18n.js';
import {Img} from './gameComponents.js';
import {bondIconUrl,bandIconUrl} from './assetUrls.js';
export function PresetLinkIcons({preset,manifest}){
 const faction=chatFaction(preset.faction),strategy=data.lookup('bands',preset.strategy);
 return html`<span class="preset-link-icons">${faction?html`<span title=${tr(faction.name)}><${Img} class="preset-faction-icon" src=${bondIconUrl(manifest,faction.bondId)}/></span>`:null}${strategy?html`<span title=${tr(strategy.name)}><${Img} class="preset-faction-icon preset-strategy-icon" src=${bandIconUrl(manifest,preset.strategy)}/></span>`:null}</span>`;
}
export function PresetLinks({preset,presets,onChange}){
 const [mode,setMode]=useState(null),[query,setQuery]=useState(''),[ready,setReady]=useState(false);
 useEffect(()=>{setMode(null);setQuery('');},[preset.id]);
 useEffect(()=>{if(!mode)return;let live=true;Promise.all(['bands','assets','bonds'].map(k=>data.load(k))).then(()=>{if(live)setReady(true);}).catch(()=>{if(live)setReady(false);});return()=>{live=false;};},[mode]);
 const m=data.get('assets'),strategy=data.lookup('bands',preset.strategy);
 const open=value=>{setQuery('');setMode(value);};
 const choose=value=>{onChange(mode==='faction'?bindPresetFaction(presets,preset.id,value):bindPresetStrategy(presets,preset.id,value));setMode(null);};
 const rows=mode==='faction'?CHAT_FACTIONS.filter(f=>f.presetLink!==false).map(f=>({id:f.name,name:f.name,icon:bondIconUrl(m,f.bondId),color:f.color})):Object.values(data.get('bands')||{}).filter(b=>validStrategyLink(b.bandId)&&b.visible!==false&&(matchesKoreanSearch(tr(b.name||''),query)||matchesKoreanSearch(b.name||'',query))).map(b=>({id:b.bandId,name:b.name,icon:bandIconUrl(m,b.bandId)}));
 const value=mode==='faction'?preset.faction:preset.strategy;
 return html`<div class="preset-link-controls">
 <${Button} class="preset-link-button" icon="link" onClick=${()=>open('faction')}><span>진영 연동</span><strong>${tr(chatFaction(preset.faction)?.name||'연동 안 함')}</strong><${Icon} name="chevronRight"/><//>
 <${Button} class="preset-link-button" icon="users" onClick=${()=>open('strategy')}><span>전략 연동</span><strong>${tr(strategy?.name||'연동 안 함')}</strong><${Icon} name="chevronRight"/><//>
 <${Modal} open=${!!mode} title=${mode==='faction'?'연동할 진영 선택':'연동할 전략 선택'} micro="PRESET LINK" width="min(9rem,94vw)" onClose=${()=>setMode(null)} actions=${html`<${Button} disabled=${!value} onClick=${()=>choose(null)}>연동 해제<//><${Button} onClick=${()=>setMode(null)}>닫기<//>`}>
 ${mode==='strategy'?html`<input class="preset-link-search" aria-label="연동 전략 검색" placeholder="전략 검색" value=${query} onInput=${e=>setQuery(e.target.value)}/>`:null}
 <div class=${`preset-link-grid ${mode==='strategy'?'preset-link-grid--portraits':''}`} aria-label=${mode==='faction'?'진영 목록':'전략 초상화 목록'}>${ready?rows.map(row=>{const linked=presets.find(p=>(mode==='faction'?p.faction:p.strategy)===row.id);return html`<button type="button" key=${row.id} class=${`preset-link-card ${value===row.id?'is-on':''}`} style=${row.color?`--link-color:${row.color}`:undefined} aria-pressed=${value===row.id} title=${linked&&linked.id!==preset.id?`${tr(row.name)} · ${linked.name}에서 연결 이동`:tr(row.name)} onClick=${()=>choose(row.id)}><${Img} src=${row.icon}/><span>${tr(row.name)}</span>${value===row.id?html`<${Icon} name="check"/>`:null}</button>`;}):html`<p>목록 불러오는 중…</p>`}</div>
 <p class="lo-note">${mode==='faction'?'진영 선택 시 적용됩니다.':'전략 선택 완료 시 적용됩니다.'} 기존 연결은 이 프리셋으로 이동합니다.</p>
 <//></div>`;
}

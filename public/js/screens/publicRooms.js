import {defaultRoomTitle} from '../../../shared/roomTitle.js';
import {tr} from '../i18n/i18n.js';
import {PublicRoomSettings} from '../ui/publicRoomSettings.js';
import {t} from '../../../shared/i18n.js';
import {html,Button,MicroLabel,Icon} from '../ui/components.js';
import {useState,useEffect} from '../../vendor/hooks.module.js';
import {net} from '../net.js';
import {DIFFICULTY_NAMES,DIFFICULTY_COLORS} from '../../../shared/constants.js';
import {GAMEPLAY_MODE_NAMES} from '../../../shared/gameplayModes.js';
export function PublicRoomsScreen({headerLeft,headerRight,onJoin,onSpectate,onCounts}){
 const[inspect,setInspect]=useState(null),[inspecting,setInspecting]=useState(null);
 const[rooms,setRooms]=useState([]),[loading,setLoading]=useState(false),[error,setError]=useState('');
 const[updated,setUpdated]=useState(null),[now,setNow]=useState(Date.now());
 const[mode,setMode]=useState(''),[size,setSize]=useState(''),[difficulty,setDifficulty]=useState(''),[running,setRunning]=useState(false);
 useEffect(()=>{
  let active=true,inFlight=false;
  const refresh=async()=>{
   if(inFlight)return;inFlight=true;setLoading(true);
   try{const r=await net.request('room.list');if(active){setRooms(r.rooms||[]);setError('');if(r.counts)onCounts?.(r.counts);setUpdated(Date.now());}}
   catch(e){if(active)setError('방 목록을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');}
   finally{inFlight=false;if(active)setLoading(false);}
  };
  refresh();const timer=setInterval(refresh,10000),clock=setInterval(()=>setNow(Date.now()),1000);
  return()=>{active=false;clearInterval(timer);clearInterval(clock);};
 },[]);
 const filtersOn=!!(mode||size||difficulty||running);
 const ago=updated?Math.max(0,Math.round((now-updated)/1000)):null;
 const canJoin=r=>!r.started&&r.mode!=='solo'&&r.players+r.bots<r.capacity;
 const filtered=rooms.filter(r=>(running||!r.started)&&(!mode||r.gameplayMode===mode)&&(!size||r.mode===size)&&(!difficulty||r.difficulty===difficulty));
 return html`<div class="screen public-rooms-screen"><header class="topbar app-topbar">${headerLeft}<div class="topbar__center"><${MicroLabel} tone="mint">PUBLIC ROOMS<//><h1 class="topbar__title">공개 방 목록</h1></div>${headerRight}</header><main class="screen__scroll public-rooms-page"><div class="public-rooms-page__content">
 <div class="public-rooms__toolbar"><div class="public-rooms__counts" aria-live="polite"><span>참가 가능 <b>${rooms.filter(canJoin).length}</b></span><span>전체 <b>${rooms.length}</b></span></div><div class="public-rooms__filters"><select aria-label="게임 모드 필터" value=${mode} onChange=${e=>setMode(e.target.value)}><option value="">모든 모드</option><option value="classic">클래식</option><option value="augment">증강</option><option value="custom">커스텀</option></select><select aria-label="인원 필터" value=${size} onChange=${e=>setSize(e.target.value)}><option value="">모든 인원</option><option value="coop">4인</option><option value="coop8">8인</option></select><select aria-label="난이도 필터" value=${difficulty} onChange=${e=>setDifficulty(e.target.value)}><option value="">모든 난이도</option>${Object.entries(DIFFICULTY_NAMES).map(([id,name])=>html`<option value=${id}>${name}</option>`)}</select><label class="public-rooms__running"><input type="checkbox" role="switch" class="ui-switch" checked=${running} onChange=${e=>setRunning(e.target.checked)}/>진행 중 포함</label><span class="public-rooms__updated" aria-live="off" title="10초마다 자동으로 갱신됩니다.">${ago==null?'':ago<5?'방금 갱신':`${ago}초 전 갱신`}</span></div></div>
 <div class="public-rooms__error" role="alert">${error}</div><div class="public-rooms public-rooms--cards">${!filtered.length?html`<div class="public-rooms__empty"><${Icon} name="users"/><strong>${loading&&!updated?'공개 방을 불러오는 중입니다.':filtersOn?'조건에 맞는 공개 방이 없습니다.':'지금 열려 있는 공개 방이 없습니다.'}</strong><span>${filtersOn?'필터를 바꾸거나 초기화해 보세요.':'로비에서 연합 시뮬레이션을 공개로 만들면 이 목록에 표시됩니다.'}</span>${filtersOn?html`<${Button} size="sm" variant="secondary" icon="refresh" onClick=${()=>{setMode('');setSize('');setDifficulty('');setRunning(false);}}>필터 초기화<//>`:null}</div>`:filtered.map(r=>html`<article key=${r.code} class="public-room panel brackets"><div class="public-room__host"><strong title=${r.title} data-room-title data-i18n-skip>${r.title===defaultRoomTitle(r.mode)?tr(r.title):r.title}</strong><small>${r.code}</small></div><dl class="public-room__details"><div class="public-room__mode"><dt>모드</dt><dd data-mode=${r.gameplayMode}>${GAMEPLAY_MODE_NAMES[r.gameplayMode]}${r.gameplayMode==='custom'?html`<${Button} size="sm" variant="secondary" icon="info" class="public-room__settings" aria-label="설정 보기" title="설정 보기" disabled=${inspecting===r.code} onClick=${async()=>{setInspecting(r.code);try{const res=await net.request('room.inspect',{code:r.code});setInspect(res.room);}catch(e){setError('설정을 불러오지 못했습니다. 방 목록을 확인해주세요.');}finally{setInspecting(null);}}}/>`:null}</dd></div><div><dt>난이도</dt><dd style=${`color:${DIFFICULTY_COLORS[r.difficulty]}`} data-difficulty=${r.difficulty}>${t(DIFFICULTY_NAMES[r.difficulty]||'').replace(/\s*시뮬레이션$/,'')}</dd></div><div><dt>${r.mode==='solo'?'단독':'연합'} · 인원</dt><dd class="public-room__population"><span>${r.players+r.bots}<small> / ${r.capacity}명</small></span>${r.bots?html`<span class="public-room__bots">AI ${r.bots}</span>`:null}</dd></div><div><dt>진행 상태</dt><dd data-state=${r.started?'running':'waiting'}>${r.started?'진행 중':'대기 중'}</dd></div></dl><div class="public-room__actions"><${Button} size="sm" variant="primary" icon="users" disabled=${!canJoin(r)} onClick=${()=>onJoin(r.code)}>참가<//><${Button} size="sm" variant="secondary" icon="eye" disabled=${r.mode==='solo'||r.spectatorCap<=r.spectators} title=${r.spectatorCap?'관전하기':'관전이 허용되지 않은 방입니다.'} onClick=${()=>onSpectate(r.code)}>관전<//></div></article>`)}</div></div></main>${inspect?html`<${PublicRoomSettings} room=${inspect} onClose=${()=>setInspect(null)}/>`:null}</div>`;
}

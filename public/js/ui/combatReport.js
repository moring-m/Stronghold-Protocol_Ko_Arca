import { DAMAGE_TYPES } from '../../../shared/damageTypes.js';
import { useState } from '../../vendor/hooks.module.js';
import { html, Icon } from './components.js';
import { loadPref, savePref } from '../store.js';
import { combatGroup, COMBAT_GROUPS, combatShares } from './combatPresentation.js';
import { UnitThumb, useGameData } from './gameComponents.js';
import { fmtNum } from './gameLogic.js';
import { combatMetrics, sumCombatMetrics } from '../../../shared/combatStats.js';

export const COMBAT_COLUMNS=[['dmg','총 피해'],...DAMAGE_TYPES.slice(0,-1).map(t=>[t.key,t.label]),['heal','회복'],['taken','받은 피해'],['takenPhysical','받은 물리 피해'],['takenArts','받은 마법 피해'],['takenTrue','받은 고정 피해'],['takenElemental','받은 원소 피해'],['shieldAbsorbed','보호막 흡수'],['kills','처치'],['attacks','공격'],['skillUses','스킬 사용'],['redeploys','재배치'],['deaths','전투불능'],['activeTime','전투 시간(초)']];
const DAMAGE_COLORS=Object.fromEntries(DAMAGE_TYPES.slice(0,-1).map(t=>[t.key,t.className]));
export function combatChartRows(rows,metric){return rows.map(u=>({...u,value:Number.isFinite(Number(u[metric]))?Math.max(0,Number(u[metric])):0})).sort((a,b)=>b.value-a.value);}
export function combatDamageSegments(unit){
 const total=Math.max(0,Number(unit.dmg)||0),segments=Object.entries(DAMAGE_COLORS).map(([key,color])=>({key,color,value:Math.max(0,Number(unit[key])||0)}));
 const typed=segments.reduce((n,s)=>n+s.value,0),denominator=Math.max(total,typed,1);
 if(total>typed)segments.push({key:'unclassifiedDamage',color:'unclassified',value:total-typed});
 return segments.filter(s=>s.value>0).map(s=>({...s,width:s.value/denominator*100}));
}
export function aggregateCombatUnits(rounds) {
  const rows=new Map();
  for(const round of rounds.filter(r=>r.available!==false))for(const u of round.units||[]){
    const key=u.uid!=null?`uid:${u.uid}:${u.defId}`:`${u.kind}:${u.defId}`;
    const row=rows.get(key)||{...u,...combatMetrics()};
    const m=combatMetrics(u);for(const k of Object.keys(m))row[k]+=m[k];rows.set(key,row);
  }
  return [...rows.values()].sort((a,b)=>b.dmg-a.dmg);
}

export function groupCombatReport(rounds,groupBy='unit',lookup=()=>null){
 const groups=new Map();
 for(const round of rounds.filter(r=>r.available!==false))for(const u of round.units||[]){
  const meta=combatGroup({...u,playerId:round.playerId,playerName:round.playerName},groupBy,lookup),key=meta.key;
  let row=groups.get(key);if(!row){row={...u,...meta,uid:groupBy==='unit'?u.uid:null,defId:meta.kind==='group'?null:u.defId,...combatMetrics(),groupKey:key};groups.set(key,row);}
  for(const [k,n]of Object.entries(combatMetrics(u)))row[k]+=n;
 }
 return [...groups.values()].sort((a,b)=>b.dmg-a.dmg);
}
const SERIES_COLORS=['#5ed9bb','#91b8e2','#b89fdb','#e9bd77','#e08c8c','#83b8ac','#aebabb','#637b75'];
function ReportChart({rows,metric,display,nameOf,rounds,title}){
 const chartRows=combatChartRows(rows,metric),peak=Math.max(1,...chartRows.map(r=>r.value));
 const shares=combatShares(rows.map(r=>({...r,name:nameOf(r)})),metric);
 const label=COMBAT_COLUMNS.find(([k])=>k===metric)?.[1]||metric;
 const points=rounds.filter(r=>r.available!==false).map(r=>({round:r.round,value:r.totals?.[metric]??sumCombatMetrics(r.units||[])[metric]}));
 const merged=new Map();for(const p of points)merged.set(p.round,(merged.get(p.round)||0)+p.value);
 const trend=[...merged].sort((a,b)=>a[0]-b[0]),trendPeak=Math.max(1,...trend.map(p=>p[1]));
 return html`<section class="combat-chart" aria-label=${title||label}><h3>${display==='trend'?'라운드별 · ':''}${title||label}<small>${display==='trend'?`${trend.length}개 라운드`:`${rows.length}개 항목`}</small></h3>
 ${display==='share'?html`<div class="combat-share"><div class="combat-share__ring" role="img" aria-label=${shares.map(s=>`${s.name} ${(s.share*100).toFixed(1)}%`).join(', ')} style=${{background:shares.length?`conic-gradient(${shares.map((s,i)=>{const start=shares.slice(0,i).reduce((n,s)=>n+s.share,0)*100;return `${SERIES_COLORS[i%8]} ${start}% ${start+s.share*100}%`;}).join(',')})`:'var(--line-2)'}}><span>${label}<b>${fmtNum(rows.reduce((n,r)=>n+(Number(r[metric])||0),0))}</b></span></div><ol class="combat-share__legend">${shares.map((s,i)=>html`<li><i style=${{background:SERIES_COLORS[i%8]}}></i><span>${s.name}</span><b>${(s.share*100).toFixed(1)}%</b></li>`)}</ol></div>`
 :display==='trend'?html`<div class="combat-trend"><svg viewBox="0 0 600 190" role="img" aria-label=${`라운드별 ${label}`}><line x1="24" x2="576" y1="160" y2="160" class="combat-trend__axis"/><polyline fill="none" points=${trend.map(([r,n],i)=>`${24+i/Math.max(1,trend.length-1)*552},${160-n/trendPeak*140}`).join(' ')} />${trend.map(([r,n],i)=>html`<circle cx=${24+i/Math.max(1,trend.length-1)*552} cy=${160-n/trendPeak*140} r="4"><title>${r}라운드 · ${fmtNum(n)}</title></circle>`)}</svg><div class="combat-trend__labels">${trend.map(([r,n])=>html`<span>${r}R<b>${fmtNum(n)}</b></span>`)}</div></div>`
 :html`<div class="combat-chart__ranking">${chartRows.length?chartRows.map(u=>html`<div class="combat-chart__row"><span class="combat-chart__name">${u.defId&&u.kind!=='group'?html`<${UnitThumb} kind=${u.kind==='token'?'token':'chess'} id=${u.defId} size="sm" />`:html`<${Icon} name="user"/>`}<span title=${nameOf(u)}>${nameOf(u)}${u.uid!=null?html`<small>#${u.uid}</small>`:null}</span></span><div class="combat-chart__track" role="img" aria-label=${`${nameOf(u)}: ${fmtNum(u.value)}`}><div class="combat-chart__bar" style=${`width:${u.value/peak*100}%`}>${metric==='dmg'?combatDamageSegments(u).map(({color,width})=>html`<i class=${`is-${color}`} style=${`width:${width}%`}></i>`):html`<i style="width:100%"></i>`}</div></div><b class="num">${fmtNum(u.value)}</b></div>`):html`<p class="t-dim">표시할 기록이 없습니다.</p>`}</div>`}
 </section>`;
}
export function CombatReport({players,myId}) {
 const gd=useGameData();
 const [detail,setDetail]=useState(()=>loadPref('combatReport.detail',false)===true),[display,setDisplay]=useState('bar'),[metric,setMetric]=useState('dmg'),[secondary,setSecondary]=useState('heal'),[groupBy,setGroupBy]=useState('operator');
 const [pid,setPid]=useState(myId||players[0]?.playerId),[roundKey,setRoundKey]=useState('all');
 const p=players.find(p=>p.playerId===pid)||players[0],chosenPlayers=pid==='all'?players:[p].filter(Boolean);
 const rounds=chosenPlayers.flatMap(p=>(p.combatRounds||[]).map(r=>({...r,playerId:p.playerId,playerName:p.name})));
 const roundOptions=[...new Set(rounds.map(r=>r.round))].sort((a,b)=>a-b);
 const selected=roundKey==='all'?rounds:rounds.filter(r=>String(r.round)===roundKey);
 const rows=groupCombatReport(selected,groupBy,id=>gd.chess(id)),totals=sumCombatMetrics(rows);
 const name=u=>u.name||gd.chess(u.defId)?.name||u.defId;
 const shown=detail?rows:combatChartRows(rows,metric).slice(0,8),columns=detail?COMBAT_COLUMNS:COMBAT_COLUMNS.filter(([k])=>['dmg','heal','taken','kills'].includes(k));
 return html`<section class=${`combat-report ${detail?'is-detailed':'is-simple'}`} aria-label="전투 통계">
  <header class="combat-report__heading"><div><span class="micro">COMBAT ANALYSIS</span><h2>전투 통계</h2></div><nav class="combat-report__views" aria-label="통계 상세도">${[[false,'간소'],[true,'상세']].map(([on,label])=>html`<button type="button" aria-pressed=${detail===on} onClick=${()=>{setDetail(on);savePref('combatReport.detail',on);}}>${label}</button>`)}</nav></header>
  <nav class="combat-report__players" aria-label="팀원 선택"><button type="button" aria-pressed=${pid==='all'} onClick=${()=>{setPid('all');setRoundKey('all');}}>팀 전체</button>${players.map(player=>html`<button type="button" aria-pressed=${pid===player.playerId} onClick=${()=>{setPid(player.playerId);setRoundKey('all');}}>${player.name}${player.isBot?' · AI':''}</button>`)}</nav>
  <div class="combat-report__controls"><label>라운드<select aria-label="통계 라운드" value=${roundKey} onChange=${e=>setRoundKey(e.target.value)}><option value="all">전체 라운드</option>${roundOptions.map(r=>html`<option value=${String(r)}>${r}라운드</option>`)}</select></label>
  <label>병합 기준<select aria-label="통계 병합 기준" value=${groupBy} onChange=${e=>setGroupBy(e.target.value)}>${COMBAT_GROUPS.map(([id,label])=>html`<option value=${id}>${label}</option>`)}</select></label>
  <label>그래프<select aria-label="통계 그래프 종류" value=${display} onChange=${e=>setDisplay(e.target.value)}>${[['bar','막대'],['share','기여 비중'],['trend','라운드 추이'],['table','표']].map(([id,label])=>html`<option value=${id}>${label}</option>`)}</select></label>
  <label>비교 항목<select aria-label="그래프 비교 항목" value=${metric} onChange=${e=>setMetric(e.target.value)}>${COMBAT_COLUMNS.map(([k,label])=>html`<option value=${k}>${label}</option>`)}</select></label>
  ${detail&&display!=='table'?html`<label>추가 그래프<select aria-label="추가 그래프 항목" value=${secondary} onChange=${e=>setSecondary(e.target.value)}><option value="none">표시 안 함</option>${COMBAT_COLUMNS.map(([k,label])=>html`<option value=${k}>${label}</option>`)}</select></label>`:null}</div>
  ${!rounds.length?html`<p class="combat-report__empty">이 게임에는 상세 전투 기록이 없습니다.</p>`:html`
   ${selected.some(r=>r.available===false)?html`<p class="t-dim">상세 기록이 없는 전투는 집계에서 제외됩니다.</p>`:null}
   <div class="combat-report__summary">${(detail?COMBAT_COLUMNS.slice(0,7):columns).map(([k,label])=>html`<div><span>${label}</span><b>${fmtNum(totals[k])}</b></div>`)}</div>
   ${display==='table'?html`<div class="combat-report__table" tabindex="0" role="region" aria-label="오퍼레이터별 통계 · 가로 스크롤 가능"><table><thead><tr><th scope="col">항목</th>${columns.map(([,label])=>html`<th scope="col">${label}</th>`)}</tr></thead><tbody><tr class="combat-report__total"><th scope="row">합계</th>${columns.map(([k])=>html`<td>${fmtNum(totals[k])}</td>`)}</tr>${shown.map(u=>html`<tr><th scope="row">${name(u)}</th>${columns.map(([k])=>html`<td>${fmtNum(u[k])}</td>`)}</tr>`)}</tbody></table></div>`:html`<div class="combat-charts"><${ReportChart} rows=${display==='share'?rows:shown} metric=${metric} display=${display} nameOf=${name} rounds=${selected}/>${detail&&secondary!=='none'?html`<${ReportChart} rows=${rows} metric=${secondary} display=${display} nameOf=${name} rounds=${selected}/>`:null}</div>`}
   <p class="combat-report__note">${detail?'전체 항목 표시':'순위·표는 상위 8개 표시 · 비중·추이는 전체 기록 기준'} · 피해는 실제 체력 차감량입니다.${groupBy==='operator'?' 같은 오퍼레이터의 승급·소속 참가자를 합산합니다.':''} 소환물은 별도로 집계합니다.</p>
  `}
 </section>`;
}

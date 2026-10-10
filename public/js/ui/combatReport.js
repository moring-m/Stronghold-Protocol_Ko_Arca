import {useState} from '../../vendor/hooks.module.js';
import {html} from './components.js';
import {UnitThumb,useGameData} from './gameComponents.js';
import {fmtNum} from './gameLogic.js';
import {combatMetrics,sumCombatMetrics} from '../../../shared/combatStats.js';

export const COMBAT_COLUMNS=[['dmg','총 피해'],['physicalDamage','물리 피해'],['artsDamage','마법 피해'],['trueDamage','고정 피해'],['elementalDamage','원소 피해'],['heal','회복'],['taken','받은 피해'],['takenPhysical','받은 물리 피해'],['takenArts','받은 마법 피해'],['takenTrue','받은 고정 피해'],['takenElemental','받은 원소 피해'],['shieldAbsorbed','보호막 흡수'],['kills','처치'],['attacks','공격'],['skillUses','스킬 사용'],['redeploys','재배치'],['deaths','전투불능'],['activeTime','전투 시간(초)']];
const DAMAGE_COLORS={physicalDamage:'phys',artsDamage:'arts',trueDamage:'true',elementalDamage:'element'};
export function combatChartRows(rows,metric){return rows.map(u=>({...u,value:Number.isFinite(Number(u[metric]))?Math.max(0,Number(u[metric])):0})).sort((a,b)=>b.value-a.value);}
const KIND={normal:'일반 전투',unite:'협력방어',boss:'보스전',hidden:'히든 보스전'};
export function aggregateCombatUnits(rounds) {
  const rows=new Map();
  for(const round of rounds.filter(r=>r.available!==false))for(const u of round.units||[]){
    const key=u.uid!=null?`uid:${u.uid}:${u.defId}`:`${u.kind}:${u.defId}`;
    const row=rows.get(key)||{...u,...combatMetrics()};
    const m=combatMetrics(u);for(const k of Object.keys(m))row[k]+=m[k];rows.set(key,row);
  }
  return [...rows.values()].sort((a,b)=>b.dmg-a.dmg);
}
export function CombatReport({players,myId}) {
  const gd=useGameData();
  const [display,setDisplay]=useState('chart'),[metric,setMetric]=useState('dmg');
  const [pid,setPid]=useState(myId||players[0]?.playerId),[roundKey,setRoundKey]=useState('all');
  const p=players.find(p=>p.playerId===pid)||players[0];
  const rounds=p?.combatRounds||[];
  const selected=roundKey==='all'?rounds:rounds.filter((r,i)=>String(i)===roundKey);
  const rows=aggregateCombatUnits(selected),totals=sumCombatMetrics(rows);
  const chartRows=combatChartRows(rows,metric),peak=Math.max(1,...chartRows.map(u=>u.value)),roundPeak=Math.max(1,...selected.map(r=>r.totals?.[metric]||sumCombatMetrics(r.units||[])[metric]));
  const name=u=>gd.chess(u.defId)?.name||u.name||u.defId;
  return html`<section class="combat-report" aria-label="상세 전투 통계">
    <h2>상세 전투 통계</h2>
    <nav class="combat-report__players" aria-label="팀원 선택">${players.map(player=>html`<button type="button" aria-pressed=${p?.playerId===player.playerId} onClick=${()=>{setPid(player.playerId);setRoundKey('all');}}>${player.name}${player.isBot?' · AI':''}</button>`)}</nav>
    <label class="combat-report__round">라운드 <select value=${roundKey} onChange=${e=>setRoundKey(e.target.value)}><option value="all">전체 라운드</option>${rounds.map((r,i)=>html`<option value=${String(i)}>${r.round}라운드 · ${KIND[r.kind]||r.kind} · ${fmtNum(r.duration)}초</option>`)}</select></label>
    <div class="combat-report__controls"><nav class="combat-report__views" aria-label="통계 보기"><button type="button" aria-pressed=${display==='chart'} onClick=${()=>setDisplay('chart')}>그래프</button><button type="button" aria-pressed=${display==='table'} onClick=${()=>setDisplay('table')}>표</button></nav><label>비교 항목 <select aria-label="그래프 비교 항목" value=${metric} onChange=${e=>setMetric(e.target.value)}>${COMBAT_COLUMNS.map(([k,label])=>html`<option value=${k}>${label}</option>`)}</select></label></div>
    ${!rounds.length?html`<p>이 게임에는 상세 전투 기록이 없습니다.</p>`:html`
      ${selected.some(r=>r.available===false)?html`<p class="t-dim">강제 종료하거나 상세 기록이 없는 전투는 집계에서 제외됩니다.</p>`:null}
      <div class="combat-report__summary">${COMBAT_COLUMNS.slice(0,7).map(([k,label])=>html`<div><span>${label}</span><b>${fmtNum(totals[k])}</b></div>`)}</div>
      ${display==='chart'?html`<div class="combat-charts">
        <section class="combat-chart" aria-label="오퍼레이터별 그래프"><h3>오퍼레이터별 · ${COMBAT_COLUMNS.find(([k])=>k===metric)?.[1]}</h3>
          ${chartRows.length?chartRows.map(u=>html`<div class="combat-chart__row"><span class="combat-chart__name"><${UnitThumb} kind=${u.kind==='token'?'token':'chess'} id=${u.defId} size="sm" /><span>${name(u)}${u.uid!=null?html`<small>#${u.uid}</small>`:null}</span></span><div class="combat-chart__track" role="img" aria-label=${`${name(u)}: ${fmtNum(u.value)}`}><div class="combat-chart__bar" style=${`width:${u.value/peak*100}%`}>
            ${metric==='dmg'?Object.entries(DAMAGE_COLORS).map(([key,color])=>html`<i class=${`is-${color}`} style=${`width:${u.value?u[key]/u.value*100:0}%`} title=${`${COMBAT_COLUMNS.find(([k])=>k===key)[1]} ${fmtNum(u[key])}`}></i>`):html`<i style="width:100%"></i>`}</div></div><b class="num">${fmtNum(u.value)}</b></div>`):html`<p class="t-dim">표시할 기록이 없습니다.</p>`}
          ${metric==='dmg'?html`<div class="combat-chart__legend">${Object.entries(DAMAGE_COLORS).map(([key,color])=>html`<span><i class=${`is-${color}`}></i>${COMBAT_COLUMNS.find(([k])=>k===key)[1]}</span>`)}</div>`:null}
        </section>
        <section class="combat-chart" aria-label="라운드별 그래프"><h3>라운드별 · ${COMBAT_COLUMNS.find(([k])=>k===metric)?.[1]}</h3>${selected.filter(r=>r.available!==false).map(r=>{const value=r.totals?.[metric]??sumCombatMetrics(r.units||[])[metric];return html`<div class="combat-chart__row"><span class="combat-chart__name">${r.round}라운드<small>${KIND[r.kind]||r.kind}</small></span><div class="combat-chart__track" role="img" aria-label=${`${r.round}라운드: ${fmtNum(value)}`}><div class="combat-chart__bar" style=${`width:${value/roundPeak*100}%`}><i style="width:100%"></i></div></div><b class="num">${fmtNum(value)}</b></div>`;})}</section>
      </div>`:null}
      <div hidden=${display!=='table'} class="combat-report__table" tabindex="0" role="region" aria-label="오퍼레이터별 통계 · 가로 스크롤 가능"><table><thead><tr><th scope="col">오퍼레이터 / 소환물</th>${COMBAT_COLUMNS.map(([,label])=>html`<th scope="col">${label}</th>`)}</tr></thead><tbody>
        <tr class="combat-report__total"><th scope="row">합계</th>${COMBAT_COLUMNS.map(([k])=>html`<td>${fmtNum(totals[k])}</td>`)}</tr>
        ${rows.map(u=>html`<tr><th scope="row"><span><${UnitThumb} kind=${u.kind==='token'?'token':'chess'} id=${u.defId} size="sm" />${gd.chess(u.defId)?.name||u.name||u.defId}${u.uid!=null?html`<small>#${u.uid}</small>`:null}</span></th>${COMBAT_COLUMNS.map(([k])=>html`<td>${fmtNum(u[k])}</td>`)}</tr>`)}
      </tbody></table></div>
      <p class="t-dim">피해는 실제 체력 차감량으로 집계합니다. 소환물은 별도 표시하며 재배치는 최초 배치 이후 전투 중 복귀 횟수입니다.</p>
    `}
  </section>`;
}

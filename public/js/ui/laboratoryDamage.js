import {useEffect,useRef,useState} from '../../vendor/hooks.module.js';
import {html,Icon} from './components.js';
import {tr} from '../i18n/i18n.js';
import {DAMAGE_TYPES} from '../../../shared/damageTypes.js';
const TYPES=DAMAGE_TYPES.map(({label,color})=>[label,color]);
const sum=v=>v.reduce((a,b)=>a+b,0);
const number=n=>Math.round(n).toLocaleString('ko-KR');
export function appendDamageSample(previous,sample){
 if(!sample)return previous;
 const totals=[0,0,0,0,0,0];for(const row of sample.rows)row.values.forEach((v,i)=>totals[i]+=(v||0));
 if(!previous||previous.battleId!==sample.battleId||sample.time<previous.time)return {...sample,totals,points:[{time:sample.time,values:[0,0,0,0,0,0]}]};
 const dt=sample.time-previous.time;if(dt<.2)return previous;
 const values=totals.map((v,i)=>Math.max(0,v-previous.totals[i])/dt);
 return {...sample,totals,points:[...previous.points,{time:sample.time,values}].filter(p=>p.time>=sample.time-60).slice(-241)};
}
export function LaboratoryDamage({runner,fieldId}){
 const [open,setOpen]=useState(false),[state,setState]=useState(null),[metric,setMetric]=useState('dps');
 const current=useRef(null);
 useEffect(()=>{current.current=null;setState(null);const update=()=>{const next=appendDamageSample(current.current,runner?.damageSample());if(next!==current.current){current.current=next;setState(next);}};update();const timer=setInterval(update,250);return()=>clearInterval(timer);},[runner,fieldId]);
 const totals=state?.totals||[0,0,0,0,0,0],points=state?.points||[],last=points.at(-1)?.values||[0,0,0,0,0,0];
 const rows=(state?.rows||[]).filter(r=>sum(r.values)>0).sort((a,b)=>sum(b.values)-sum(a.values)),maxRow=Math.max(1,...rows.map(r=>sum(r.values)));
 const scale=Math.max(1,...points.flatMap(p=>p.values)),start=points[0]?.time||0,end=Math.max(start+1,state?.time||0);
 return html`<aside class=${'lab-damage'+(open?' is-open':'')} aria-label="실험실 실시간 피해 그래프">
 <button type="button" class="lab-damage__toggle" aria-expanded=${open} aria-controls="lab-damage-content" onClick=${()=>setOpen(!open)}><${Icon} name="chart"/><span>실시간 피해</span><b class="num">${number(sum(last))}<small> /초</small></b><${Icon} name=${open?'chevronDown':'chevronUp'}/></button>
 ${open?html`<div id="lab-damage-content" class="lab-damage__content"><div class="lab-damage__tabs">${[['dps','피해 /초'],['total','누적 피해']].map(([id,label])=>html`<button type="button" class=${metric===id?'is-on':''} aria-pressed=${metric===id} onClick=${()=>setMetric(id)}>${label}</button>`)}<span class="num">${(state?.time||0).toFixed(1)}초</span></div>
 <div class="lab-damage__legend">${TYPES.map(([name,color],i)=>html`<span style=${{color}}><i></i>${name}<b class="num">${number(metric==='dps'?last[i]:totals[i])}</b></span>`)}</div>
 ${metric==='dps'?html`<div class="lab-damage__plot"><span class="lab-damage__axis num">${number(scale)}</span><svg viewBox="0 0 320 100" preserveAspectRatio="none" role="img" aria-label="최근 60초 피해 유형별 초당 피해"><path d="M0 25H320 M0 50H320 M0 75H320" stroke="rgba(130,185,175,.15)" fill="none"/>${TYPES.map(([,color],i)=>html`<polyline points=${points.map(p=>`${(p.time-start)/(end-start)*320},${96-p.values[i]/scale*90}`).join(' ')} fill="none" stroke=${color} stroke-width="2" vector-effect="non-scaling-stroke"/>`)}</svg><div class="lab-damage__time num"><span>${start.toFixed(0)}초</span><span>${end.toFixed(0)}초</span></div></div>`:html`<div class="lab-damage__ranking">${rows.map(r=>html`<div class="lab-damage__row"><span title=${tr(r.name)}>${tr(r.name)}</span><div class="lab-damage__bar">${TYPES.map(([,color],i)=>html`<i style=${{background:color,width:`${r.values[i]/maxRow*100}%`}}></i>`)}</div><b class="num">${number(sum(r.values))}</b></div>`)}${!rows.length?html`<p>아직 기록된 피해가 없습니다.</p>`:null}</div>`}
 </div>`:null}</aside>`;
}

import {uiCssZoom} from './mobileScale.js';
import { useEffect, useLayoutEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { html, Icon, useTicker } from './components.js';
import { UnitThumb, useGameData } from './gameComponents.js';
import { loadPref, savePref } from '../store.js';
import { groupLiveCombat, COMBAT_GROUPS } from './combatPresentation.js';
import { battleRunner } from '../battle/runner.js';
import { t, N_ } from '../../../shared/i18n.js';
import { combatMetricsLayout } from './combatMetricsLayout.js';

const TYPES = Object.freeze([
  { id: 'phys', label: N_('物理') }, { id: 'arts', label: N_('法术') },
  { id: 'true', label: N_('真实') }, { id: 'elemental', label: N_('元素') },
]);
const number = (n) => Math.round(n || 0).toLocaleString('zh-CN');
const rate = (n) => (n || 0).toLocaleString('zh-CN', { maximumFractionDigits: 1 });

/** A modeless panel: the battlefield stays visible and keeps playing. Mounted only while open. */
export function CombatMetricsPanel({ myId, onClose, practice=false, preparing=false, round=null, runner = battleRunner }) {
  const [scope, setScope] = useState('battle');
  const [metric,setMetric]=useState('damage');
  const gd=useGameData();
  const [detail,setDetail]=useState(()=>loadPref('combatMetrics.detail',false)===true);
  const [groupBy,setGroupBy]=useState('operator'),[chart,setChart]=useState('bar');
  const [period,setPeriod]=useState('previous');
 useEffect(()=>{if(preparing)setPeriod('previous');},[preparing]);
  const closeRef = useRef(null);
  const panelRef = useRef(null);
  useTicker(250);
  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus();
    const onKey = (e) => {
      if (e.key !== 'Escape' || document.querySelector('.modal, .guide')) return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.(); };
  }, []);
  useLayoutEffect(() => {
    const panel = panelRef.current;
    const corner = panel?.parentElement;
    const viewport = window.visualViewport;
    const measure = () => {
      if (!panel || !corner) return;
      const rect = corner.getBoundingClientRect(),zoom=uiCssZoom();
      const rootStyle = getComputedStyle(document.documentElement);
      const layout = combatMetricsLayout({
        cornerTop: rect.top/zoom, cornerBottom: rect.bottom/zoom,
        viewportHeight: (viewport?.height || window.innerHeight)/zoom,
        viewportTop: (viewport?.offsetTop || 0)/zoom,
        rem: parseFloat(rootStyle.fontSize) || 40,
        safeTop: parseFloat(rootStyle.getPropertyValue('--sa-t')) || 0,
        safeBottom: parseFloat(rootStyle.getPropertyValue('--sa-b')) || 0,
      });
      panel.style.setProperty('--combat-corner-height', `${(rect.height || 44)/zoom}px`);
      panel.style.setProperty('--combat-available-height', `${layout.availableHeight}px`);
      panel.style.setProperty('--combat-viewport-height', `${layout.viewportSpace}px`);
      panel.style.setProperty('--combat-viewport-top', `${layout.viewportPanelTop}px`);
      panel.dataset.viewportDocked = String(layout.viewportDocked);
    };
    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    if (corner) observer?.observe(corner);
    window.addEventListener('resize', measure);
    viewport?.addEventListener('resize', measure);
    viewport?.addEventListener('scroll', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      viewport?.removeEventListener('resize', measure);
      viewport?.removeEventListener('scroll', measure);
    };
  }, []);
  const result = (myId ? runner?.combatMetrics({ scope, ownerId: myId, round:practice&&scope==='battle'?Math.max(1,round-(preparing&&period==='previous'?1:0)):null }) : null) || { rows: [], damage: 0, healing: 0 };
  const grouped=groupLiveCombat(result.rows,groupBy,id=>gd.chess(id)).sort((a,b)=>(b[metric]||0)-(a[metric]||0));
  const rows=detail?grouped:grouped.slice(0,8);
  const metricTotal=grouped.reduce((n,r)=>n+(r[metric]||0),0),rateMetric=['dps','hps','lps'].includes(metric);
  const maximum = Math.max(1, ...(chart==='share'?[metricTotal]:grouped.map(r=>r[metric]||0)));
  const chartTypes=metric==='layers'||metric==='lps'?null:metric==='healing'||metric==='hps'?'healing':null;
  return html`<section ref=${panelRef} id="combat-metrics-panel" class=${`combat-metrics brackets ${detail?'is-detailed':'is-simple'}`} role="dialog" aria-label=${t('作战统计')}
      onKeyDown=${(e) => { if (e.key === 'Escape') onClose(); e.stopPropagation(); }}>
    <header class="combat-metrics__head">
      <div><span class="combat-metrics__micro">COMBAT ANALYSIS</span><h2>${t('作战统计')}</h2></div>
      <button ref=${closeRef} type="button" class="combat-metrics__close" aria-label=${t('关闭作战统计')} onClick=${onClose}><${Icon} name="close" /></button>
      ${practice&&preparing?html`<div class="combat-metrics__scopes" role="group" aria-label="휴식 중 통계 라운드"><button type="button" aria-pressed=${period==='previous'} onClick=${()=>setPeriod('previous')}>이전 라운드</button><button type="button" aria-pressed=${period==='current'} onClick=${()=>setPeriod('current')}>이번 라운드</button></div>`:null}
      <div class="combat-metrics__scopes combat-metrics__density" role="group" aria-label="실시간 통계 상세도">${[[false,'간소'],[true,'상세']].map(([id,label])=>html`<button type="button" aria-pressed=${detail===id} onClick=${()=>{setDetail(id);savePref('combatMetrics.detail',id);}}>${label}</button>`)}</div>
      <div class="combat-metrics__tools"><div class="combat-metrics__scopes" role="group" aria-label="통계 항목"><label>항목 <select aria-label="실시간 통계 항목" value=${metric} onChange=${e=>setMetric(e.target.value)}>${[['damage','피해'],['healing','회복'],['layers','중첩 획득'],['dps','DPS'],['hps','HPS'],['lps','중첩 /초']].map(([id,label])=>html`<option value=${id}>${label}</option>`)}</select></label></div>
        <div class="combat-metrics__scopes" role="group" aria-label=${t('统计范围')}>
          ${[['battle', practice&&preparing&&period==='previous'?'이전 라운드':practice?'이번 라운드':t('当前战斗')], ['match', t('本局累计')]].map(([id, label]) => html`<button type="button" key=${id}
            aria-pressed=${scope === id} onClick=${() => setScope(id)}>${label}</button>`)}
        </div>
      </div>
      <div class="combat-metrics__filters"><label>병합 <select aria-label="실시간 통계 병합 기준" value=${groupBy} onChange=${e=>setGroupBy(e.target.value)}>${COMBAT_GROUPS.filter(([id])=>!['unit','player'].includes(id)).map(([id,label])=>html`<option value=${id}>${label}</option>`)}</select></label><label>그래프 <select aria-label="실시간 그래프 종류" value=${chart} onChange=${e=>setChart(e.target.value)}><option value="bar">막대</option><option value="share">기여 비중</option></select></label></div>
    </header>
    <div class="combat-metrics__body" tabindex="0">
    <div class="combat-metrics__totals">
      <span>${t('总伤害')} <b>${number(result.damage)}</b></span><span>${t('总治疗')} <b>${number(result.healing)}</b></span><span>총 중첩 획득 <b>${number(result.layers)}</b></span>
    </div>
    <div class="combat-metrics__legend" aria-label=${t('伤害类型图例')}>
      ${metric!=='damage'?html`<span>${metric==='layers'||metric==='lps'?'실제 중첩 획득량':metric==='healing'||metric==='hps'?'실제 회복량':'초당 피해량'}</span>`:TYPES.map((type) => html`<span key=${type.id} class=${`combat-metrics__type combat-metrics__type--${type.id}`}>${t(type.label)}</span>`)}
      <span class="combat-metrics__sort">${metric==='layers'?'중첩 획득순':'선택 항목 내림차순'}</span>
    </div>
    <ol class="combat-metrics__list" tabindex="0" aria-label=${metric==='layers'?'오퍼레이터 중첩 획득 순위':t('干员伤害排行')}>
      ${rows.length ? rows.map((r, i) => {
        const description = metric==='layers'?`중첩 획득 ${number(r.layers)}`:TYPES.map((type) => `${t(type.label)} ${number(r.types[type.id])}`).join('，');
        return html`<li key=${r.key} class="combat-metrics__row">
          <span class="combat-metrics__rank">${String(i + 1).padStart(2, '0')}</span>
          ${r.defId?html`<${UnitThumb} kind=${r.kind === 'token' ? 'token' : 'chess'} id=${r.defId} showTier=${false} size="sm" />`:html`<${Icon} name="plus"/>`}
          <div class="combat-metrics__unit">
            <div class="combat-metrics__name"><b title=${r.name}>${r.name || r.defId}</b></div>
            <div class="combat-metrics__bar" role="img" aria-label=${description} title=${description}>
              ${metric==='damage'?TYPES.map((t) => html`<span key=${t.id} class=${`combat-metrics__segment combat-metrics__segment--${t.id}`} style=${{width:`${(r.types[t.id]||0)/maximum*100}%`}}></span>`):html`<span class=${`combat-metrics__segment combat-metrics__segment--${chartTypes?'heal':'arts'}`} style=${{width:`${(r[metric]||0)/maximum*100}%`}}></span>`}
            </div>
            <div class="combat-metrics__primary"><b class="num">${rateMetric?rate(r[metric]):number(r[metric])}</b><small>${metricTotal?((r[metric]||0)/metricTotal*100).toFixed(1):'0.0'}%</small></div>
            <div class="combat-metrics__values" hidden=${!detail}>
              <span><small>${t('伤害')}</small><b>${number(r.damage)}</b></span>
              <span><small>DPS</small><b>${rate(r.dps)}</b></span>
              <span class="combat-metrics__heal"><small>${t('治疗')}</small><b>${number(r.healing)}</b></span>
              <span class="combat-metrics__heal"><small>HPS</small><b>${rate(r.hps)}</b></span><span><small>중첩 획득</small><b>${number(r.layers)}</b></span><span><small>중첩 /초</small><b>${rate(r.lps)}</b></span>
            </div>
          </div>
        </li>`;
      }) : html`<li class="combat-metrics__empty">${t('暂无本地战斗记录')}<br /><small>${t('开始战斗后实时显示干员数据')}</small></li>`}
    </ol>
    <p class="combat-metrics__note">본인 기록 · 소환물은 원래 오퍼레이터에 포함 · ${detail?'전체 순위':`상위 8개 / 전체 ${grouped.length}개`}<br />${t('实际扣血 / 有效治疗，DPS / HPS 按自己的战斗秒数计算。刷新后重新累计。')}</p>
    </div>
  </section>`;
}

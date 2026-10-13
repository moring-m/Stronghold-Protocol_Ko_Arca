import {useState,useEffect} from '../../vendor/hooks.module.js';
import {html,Button,Icon,Countdown,MicroLabel} from './components.js';
import {Img,RichText,PlayerAvatar} from './gameComponents.js';
import {bondIconUrl} from './assetUrls.js';
import {data} from '../data.js';
import {tr} from '../i18n/i18n.js';
import {net} from '../net.js';
import {toastError} from './toasts.js';
import {AUGMENT_GRADES} from '../../../shared/augments.js';
const rich=s=>String(s||'').replace(/([+-]?\d+(?:\.\d+)?%?)/g,'<@ba.vup>$1</>');
export function AugmentOverlay({pub,priv,myId}){
 const s=pub.augments?.selection,[armed,setArmed]=useState(null),[busy,setBusy]=useState(false);
 const own=priv?.augments?.selection,cards=s?.side==='ally'?(own?.cards||[]):s?.cards||[],rerolls=s?.side==='ally'?(own?.rerolls||[]):s?.rerolls||[];
 const picked=s?.side==='ally'?own?.picked!=null:s?.bossPicked;
 const canChoose=!!s&&!s.settling&&!picked&&!busy&&(s.side==='ally'?!!own:myId===s.hostId);
 const fingerprint=cards.map(c=>c?.id||'').join('|');useEffect(()=>setArmed(null),[s?.id,s?.side,fingerprint]);
 if(!s)return null;const grade=AUGMENT_GRADES[s.grade],host=pub.players?.find(p=>p.playerId===s.hostId),chosen=cards[s.side==='ally'?own?.picked:-1];
 const request=async(idx,reroll=false)=>{if(!canChoose||!cards[idx])return;setBusy(true);try{await net.request(reroll?'g.augmentReroll':'g.augmentPick',{eventId:s.id,side:s.side,idx,cardId:cards[idx].id});setArmed(null);}catch(e){toastError(e);}finally{setBusy(false);}};
 const tap=idx=>{if(!canChoose)return;if(armed===idx)request(idx);else setArmed(idx);};
 return html`<section class="spov augment-overlay" role="dialog" aria-modal="true" aria-label=${s.side==='ally'?'아군 증강 선택':'적 증강 선택'} style=${{'--augment-color':grade.color}}>
  <div class="spov__veil"></div><div class="spov__inner augment-inner">
   <header class="spov__head"><div class="spov__titles"><${MicroLabel}>AUGMENT // ROUND ${s.round}<//><h2 class="spov__title"><${Icon} name=${s.side==='ally'?'bolt':'shield'}/>${s.side==='ally'?'아군 증강':'적 증강'}<span class="augment-grade">${grade.name}</span></h2><p class="spov__desc">${s.side==='ally'?'각자의 선택지 3개 중 하나를 선택하세요.':'방장이 선택한 증강은 모든 적에게 적용됩니다.'}</p></div><${Countdown} deadline=${pub.deadline} total=${s.settling?3:60} label=${s.settling?'선택 완료':'선택 시간'}/></header>
   <div class="augment-progress">${(pub.players||[]).filter(p=>p.alive&&!p.left).map(p=>html`<span key=${p.playerId} class=${`spov__who ${s.picked[p.playerId]?'is-done':''}`}><${PlayerAvatar} player=${p} size="sm"/><b>${tr(p.name)}</b><${Icon} name=${s.picked[p.playerId]?'check':'hourglass'}/></span>`)}</div>
   <p class="augment-status" role="status">${s.settling?'선택 완료 · 다음 단계로 이동합니다.':picked?(chosen?`${chosen.name} 선택 완료 · 다른 참가자를 기다리고 있습니다.`:'선택 완료'):s.side==='enemy'&&myId!==s.hostId?`${tr(host?.name||'방장')} 님이 적 증강을 선택하고 있습니다.`:own||s.side==='enemy'?'선택지마다 설정된 횟수만큼 리롤할 수 있습니다.':'참가자의 증강 선택을 관전하고 있습니다.'}</p>
   ${cards.length?html`<div class="augment-grid">${cards.map((card,idx)=>card?html`<article key=${card.id} class=${`augment-slot ${armed===idx?'is-armed':''} ${chosen?.id===card.id?'is-picked':''}`}><button type="button" class=${`spcard ${canChoose?'is-pickable':''} ${armed===idx?'is-armed':''}`} disabled=${!canChoose} aria-pressed=${armed===idx} onClick=${()=>tap(idx)}>
     <span class="spcard__glow"></span><span class="augment-emblem"><${Img} src=${card.iconBond?bondIconUrl(data.get('assets'),card.iconBond):card.icon} fallback=${html`<${Icon} name=${s.side==='ally'?'bolt':'shield'}/>`}/></span><span class="augment-card-grade">${grade.name}</span><strong class="spcard__name">${card.name}</strong><${RichText} text=${rich(card.description)} class="spcard__desc"/>${armed===idx?html`<span class="spcard__confirm"><b>선택 확인</b><small>한 번 더 누르기</small></span>`:null}
    </button><${Button} variant="ghost" icon="refresh" disabled=${!canChoose||!(rerolls[idx]>0)} onClick=${()=>request(idx,true)} aria-label=${`${card.name} 리롤 ${rerolls[idx]||0}회 남음`}>리롤 <span class="num">${rerolls[idx]||0}/${s.rerollLimit}</span><//></article>`:null)}</div>`:html`<div class="augment-wait"><${Icon} name="eye"/><span>개인 선택지는 해당 참가자에게만 표시됩니다.</span></div>`}
   <footer class="augment-footer"><span>${s.side==='enemy'?'적 증강 선택·리롤은 방장만 할 수 있습니다.':'이미 등장한 증강은 후보에서 제외됩니다.'}</span><${Button} variant="primary" icon="check" disabled=${!canChoose||armed==null} onClick=${()=>request(armed)}>선택 확정<//></footer>
  </div>
 </section>`;
}

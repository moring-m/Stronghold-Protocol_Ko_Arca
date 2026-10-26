import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal, MicroLabel } from './components.js';
import { APP_VERSION } from '../../../shared/constants.js';
import { PATCH_NOTES, patchNoteFor } from '../../../shared/patchNotes.js';

const SEEN_KEY='sp.patchNotes.seenVersion';
const openedThisSession=new Set();
function claimAutoOpen(){
 if(openedThisSession.has(APP_VERSION))return false;
 try{if(localStorage.getItem(SEEN_KEY)===APP_VERSION)return false;localStorage.setItem(SEEN_KEY,APP_VERSION);}catch{}
 openedThisSession.add(APP_VERSION);return true;
}

export function PatchNotesButton({class:cls='',autoOpen=false}) {
 const [open,setOpen]=useState(false);
 const [version,setVersion]=useState(APP_VERSION);
 useEffect(()=>{if(autoOpen&&claimAutoOpen()){setVersion(APP_VERSION);setOpen(true);}},[autoOpen]);
 const entry=patchNoteFor(version);
 return html`<span class=${`patch-entry ${cls}`}>
  <${Button} variant="secondary" size="sm" icon="patchNotes" class="patch-entry__button" aria-label="패치노트" title="패치노트" onClick=${()=>{setVersion(APP_VERSION);setOpen(true);}}>패치노트<//>
  <${Modal} open=${open} title="패치노트" micro="PATCH NOTES" width="min(9rem,94vw)" class="patch-notes" onClose=${()=>setOpen(false)} actions=${html`<${Button} variant="secondary" onClick=${()=>setOpen(false)}>닫기<//>`}>
   <p class="patch-notes__hint">버전을 선택하면 해당 변경 내용을 확인할 수 있습니다.</p>
   <nav class="patch-notes__versions" aria-label="패치 버전">
    ${PATCH_NOTES.map(n=>html`<button key=${n.version} type="button" class=${n.version===entry.version?'is-active':''} aria-pressed=${n.version===entry.version} onClick=${()=>setVersion(n.version)}>v${n.version}<small>${n.kind==='integrated'?'통합':n.status==='testing'?'테스트 중':'운영 업데이트'}</small></button>`)}
   </nav>
   <article class="patch-notes__entry" data-version=${entry.version}>
    <header><${MicroLabel}>${entry.date}<//><h3>v${entry.version} · ${entry.title}</h3></header>
    ${entry.sections.map(section=>html`<section key=${(section.hotfix||'')+section.title}><h4>${section.hotfix?html`<span>핫픽스</span> v${section.hotfix}${section.title==='핫픽스'?'':html` · <span>${section.title}</span>`}`:section.title}</h4><ul>${section.items.map(item=>html`<li key=${item}>${item}</li>`)}</ul></section>`)}
   </article>
  <//>
 </span>`;
}

import { useState } from '../../vendor/hooks.module.js';
import { html, Button, Modal } from './components.js';
import { toastError } from './toasts.js';

export async function redownloadResources() {
  const worker=navigator.serviceWorker?.controller;
  if(worker){
    await new Promise((resolve,reject)=>{
      const channel=new MessageChannel();
      const timer=setTimeout(()=>{channel.port1.close();reject(new Error('리소스 캐시 초기화 응답이 없습니다. 새로고침 후 다시 시도해 주세요.'));},15000);
      channel.port1.onmessage=({data})=>{clearTimeout(timer);channel.port1.close();data.type==='error'?reject(new Error(data.message)):resolve();};
      worker.postMessage({type:'resetResources'},[channel.port2]);
    });
  }else if(globalThis.caches){
    for(const name of await caches.keys())if(name.startsWith('stronghold-resources-')||name.startsWith('stronghold-ursus-preview-assets-'))await caches.delete(name);
  }
  // Explicit re-download must show the download notice again after reload.
  try { localStorage.removeItem('sp.resources.officialFxReady');localStorage.removeItem('sp.resources.voiceReady.kr');localStorage.removeItem('sp.resources.voiceReady.jp');localStorage.removeItem('sp.resources.downloadConsent');localStorage.removeItem('sp.resources.downloadScope'); localStorage.setItem('sp.resources.redownloadPending','1'); } catch {}
  location.reload();
}

export function ResourceRedownloadButton(){
  const [open,setOpen]=useState(false),[busy,setBusy]=useState(false);
  const run=async()=>{setBusy(true);try{await redownloadResources();}catch(error){toastError(error);setBusy(false);}};
  return html`<${Button} variant="ghost" size="sm" icon="refresh" title="리소스 재다운로드" onClick=${()=>setOpen(true)}>리소스 재다운로드<//>
    <${Modal} open=${open} onClose=${()=>{if(!busy)setOpen(false);}} title="리소스 재다운로드" micro="RESOURCES" width="5rem"
      actions=${html`<${Button} variant="ghost" disabled=${busy} onClick=${()=>setOpen(false)}>취소<//><${Button} variant="primary" disabled=${busy} onClick=${run}>${busy?'초기화 중…':'다시 다운로드'}<//>`}>
      <p>이미지·모델·소리·폰트 캐시를 지우고 새로고침하여 다시 다운로드합니다. 설정과 판 기록은 유지됩니다.</p>
    <//>`;
}

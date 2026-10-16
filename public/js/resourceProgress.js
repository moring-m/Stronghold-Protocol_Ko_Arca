// One non-interactive progress strip shared by every screen and background cache job.
const jobs = new Map();
let strip;
function update({id,done=0,total=0,active=true,bytesDone=0,bytesTotal=0,phase=null}={}) {
  if (!id || typeof document==='undefined') return;
  if (active) jobs.set(id,{done:Math.max(0,done),total:Math.max(0,total),bytesDone,bytesTotal,phase});
  else jobs.delete(id);
  globalThis.__SP_RESOURCE_PROGRESS__=Object.fromEntries(jobs);
  if (!jobs.size) {strip?.remove();strip=null;return;}
  if (!strip) {
    strip=document.createElement('div');strip.className='resource-progress';
    strip.setAttribute('role','progressbar');strip.setAttribute('aria-label','리소스 캐시 로딩');
    strip.setAttribute('aria-valuemin','0');strip.setAttribute('aria-valuemax','100');
    strip.style.cssText='position:fixed;inset:auto 0 0;height:3px;z-index:2147483646;pointer-events:none;background:#101b18;contain:strict';
    const fill=document.createElement('div');fill.style.cssText='height:100%;background:#5ee3b9;transition:width .15s linear';strip.append(fill);
    document.body.append(strip);
  }
  const byteJobs=[...jobs.values()].filter(j=>j.bytesTotal>0);
  const all=byteJobs.length?byteJobs.map(j=>({...j,done:j.bytesDone,total:j.bytesTotal})):[...jobs.values()],totalCount=all.reduce((n,j)=>n+j.total,0),doneCount=all.reduce((n,j)=>n+Math.min(j.done,j.total),0);
  const percent=totalCount?Math.min(100,doneCount/totalCount*100):0;
  strip.firstElementChild.style.width=(totalCount?Math.max(.5,percent):3)+'%';
  if(totalCount)strip.setAttribute('aria-valuenow',String(Math.round(percent)));else strip.removeAttribute('aria-valuenow');
  const text=byteJobs.length?`${(doneCount/1048576).toFixed(1)}/${(totalCount/1048576).toFixed(1)}MB · ${byteJobs.map(j=>j.phase).filter(Boolean).join(', ')}`:totalCount?`${doneCount}/${totalCount}`:'리소스 확인 중';
  strip.setAttribute('aria-valuetext',text);
}
export function reportResourceProgress(id,done,total,active=true,extra={}){update({id,done,total,active,...extra});}
if(typeof window!=='undefined') {
  window.addEventListener('sp-resource-progress',event=>update(event.detail));
  globalThis.navigator?.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='resourceProgress')update(event.data);if(event.data?.type==='resourceWarmMetrics')globalThis.__SP_RESOURCE_METRICS__=event.data;if(event.data?.type==='resourceWarmError')console.warn('[resources] Background download failed:',event.data.message);});
}

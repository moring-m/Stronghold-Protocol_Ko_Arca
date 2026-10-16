import {readResourceSelection,selectedResources,RESOURCE_SELECTION_KEY,OFFICIAL_FX_READY_KEY,officialFxDownloaded,missingResourceBytes} from '../../shared/resourceSelection.js';
import {reportResourceProgress} from './resourceProgress.js';
const DOWNLOAD_SCOPE_KEY='sp.resources.downloadScope';
function downloadSelection(){const choice=readResourceSelection();try{const scope=localStorage.getItem(DOWNLOAD_SCOPE_KEY);if(['officialFx','voice-kr','voice-jp'].includes(scope))choice.scope=scope;}catch{}return choice;}
// Start after the download notice; optional resources cache in the background.
globalThis.performance?.mark?.('sp-bootstrap-start');
async function messageOnce(type, onProgress, resume) {
  const channel = new MessageChannel();
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (error, data) => { clearTimeout(timer); channel.port1.close(); error ? reject(error) : resolve(data); };
    const arm = () => { clearTimeout(timer); timer = setTimeout(() => finish(new Error('리소스 작업의 응답이 중단되었습니다. 받은 파일은 유지됩니다.')), 60000); };
    arm();
    channel.port1.onmessage = ({data}) => {
      arm();
      if (data.type === 'activity') return;
      if (data.type === 'progress') { onProgress?.(data); return; }
      finish(data.type === 'error' ? new Error(data.message) : null, data);
    };
    try { navigator.serviceWorker.controller.postMessage({type, resume,selection:downloadSelection()}, [channel.port2]); }
    catch (error) { finish(error); }
  });
}
async function message(type, onProgress) {
  let resume, interruptions = 0;
  while (true) {
    let result;
    try { result = await messageOnce(type, onProgress, resume); interruptions = 0; }
    catch (error) {
      if (!error.message.includes('응답이 중단') || ++interruptions > 2) throw error;
      // Reconnect to a restarted worker; completed files are reused from Cache Storage.
      continue;
    }
    if (result.type !== 'continue') return result;
    resume = result.resume;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

async function requestDownloadConsent(resources, forOfficial=false,voiceLanguage=null) {
    const individual=forOfficial||!!voiceLanguage;
    const scope=forOfficial?'officialFx':voiceLanguage?'voice-'+voiceLanguage:null;
    const panel = document.createElement('aside');
    panel.className='resource-consent panel panel--mint brackets';
    panel.setAttribute('role','dialog');
    panel.setAttribute('aria-label','게임 리소스 다운로드 안내');
    document.body.append(panel);
    const title = document.createElement('h2');title.className='panel__title'; title.textContent = forOfficial?'공식 전투 이펙트 다운로드':voiceLanguage?(voiceLanguage==='jp'?'일본어':'한국어')+' 음성 다운로드':'게임 리소스 다운로드';
    const description = document.createElement('p');
    description.textContent = `처음 한 번 약 ${Math.ceil(resources.estimatedBytes / 1048576)}MB의 이미지·모델·소리·폰트를 공개 GitHub 미러에서 내려받습니다. Wi-Fi 사용을 권장합니다. 게임을 먼저 시작하고 리소스는 백그라운드에서 내려받습니다. 준비되지 않은 맵은 단순 맵으로 표시합니다. 파일은 이 브라우저에 저장해 다음 접속에 재사용합니다. 브라우저 저장소가 삭제되면 다시 다운로드합니다.`;
    const choice=readResourceSelection();if(forOfficial)choice.effects='official';
    const options=document.createElement('div');options.className='resource-consent__options';
    const select=(name,values,value)=>{const label=document.createElement('label');label.className='resource-consent__choice';const text=document.createElement('span');text.className='set-row__label';text.textContent=name;label.append(text);const input=document.createElement('select');input.setAttribute('aria-label',name);for(const [id,text]of values){const option=document.createElement('option');option.value=id;option.textContent=text;input.append(option);}input.value=value;label.append(input);options.append(label);return input;};
    const voice=individual?{value:choice.voice}:select('음성',[['kr','한국어'],['jp','일본어']],choice.voice);
    const effects=individual?{value:choice.effects}:select('전투 이펙트',[['simple','간소'],['official','공식']],choice.effects);
    const estimateSelection=()=>{const selected=selectedResources(resources,{voice:voice.value,effects:effects.value,...(scope?{scope}:{})});description.textContent=voiceLanguage?(voiceLanguage==='jp'?'일본어':'한국어')+' 음성 약 '+Math.ceil(selected.estimatedBytes/1048576)+'MB를 추가로 다운로드합니다. 이미지와 전투 이펙트는 이번 다운로드에 포함하지 않습니다.':forOfficial?'공식 전투 이펙트 약 '+Math.ceil(selected.estimatedBytes/1048576)+'MB를 추가로 다운로드합니다. 음성과 기본 리소스는 이번 다운로드에 포함하지 않습니다.':'선택한 이미지·모델·소리·폰트 약 '+Math.ceil(selected.estimatedBytes/1048576)+'MB를 다운로드합니다. 게임은 계속 이용할 수 있으며, 받은 파일은 다음 접속에 재사용합니다.';return selected;};
    voice.onchange=effects.onchange=estimateSelection;estimateSelection();
    const notice = document.createElement('p');
    notice.textContent = '비공식 팬 게임입니다. 게임 소재의 권리는 Hypergryph·Yostar 등 원 권리자에게 있으며, 개인적인 비상업적 이용만 가능합니다.';
    const sources = document.createElement('a'); sources.href = 'https://github.com/moring-m/Stronghold-Protocol_Ko_Arca/blob/master/docs/ASSETS.md'; sources.target = '_blank'; sources.rel = 'noopener'; sources.textContent = '리소스 출처와 이용 안내';
    const progress = document.createElement('progress'); progress.max = resources.files.length; progress.value = 0;
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.style.whiteSpace = 'pre-wrap';
    const button = document.createElement('button');button.className='btn btn--primary btn--sm'; button.textContent = individual?'다운로드':'다운로드하며 시작'; button.type = 'button';
    const head=document.createElement('header');head.className='panel__head';
    const titles=document.createElement('div');titles.className='panel__titles';
    const micro=document.createElement('span');micro.className='micro';micro.textContent='RESOURCES';titles.append(micro,title);head.append(titles);
    const body=document.createElement('div');body.className='panel__body';body.append(description,options,notice,sources,status);
    const actions=document.createElement('div');actions.className='modal__actions';actions.append(button);
    panel.append(head,body,actions);
    return await new Promise(resolve => {
      if(individual){const cancel=document.createElement('button');cancel.className='btn btn--ghost btn--sm';cancel.textContent='취소';cancel.onclick=()=>{panel.remove();resolve(false);};actions.prepend(cancel);}
      button.onclick = async () => {
        button.disabled = true;
        try {
          const selected=estimateSelection();
          const estimate = await navigator.storage?.estimate();
          if(estimate?.quota&&estimate.quota-estimate.usage<selected.estimatedStorageBytes){
            status.textContent='이미 받은 파일과 남은 저장 공간을 확인합니다…';
            const required=await missingResourceBytes(selected);
            if(estimate.quota-estimate.usage<required*1.15)throw new Error('브라우저 저장 공간이 부족합니다. 공간을 확보한 뒤 다시 시도해 주세요.');
          }
          await navigator.storage?.persist?.();
          try { if(scope)localStorage.setItem(DOWNLOAD_SCOPE_KEY,scope);else localStorage.removeItem(DOWNLOAD_SCOPE_KEY);localStorage.setItem(RESOURCE_SELECTION_KEY,JSON.stringify({voice:voice.value,effects:effects.value}));localStorage.setItem('sp.resources.downloadConsent', '1'); localStorage.removeItem('sp.resources.redownloadPending'); localStorage.setItem('sp.resources.downloadActive','1'); } catch {}
          if(!individual)window.dispatchEvent(new CustomEvent('sp-resource-selection',{detail:{voice:voice.value,effects:effects.value}}));
          panel.remove();
          resolve(true);
        } catch (error) { status.textContent = error.message; button.textContent = '다운로드 다시 시도'; button.disabled = false; }
      };
    });
}

function showDownloadProgress(resources, run, visible=false) {
    document.querySelectorAll('.resource-download').forEach(node=>node.remove());
    const choice=downloadSelection();resources=selectedResources(resources,choice);
    if(visible)try{localStorage.setItem('sp.resources.downloadActive','1');}catch{}
    const notice = document.createElement('div');
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:fixed;right:8px;bottom:8px;z-index:10000;width:min(400px,calc(100vw - 16px));box-sizing:border-box;padding:10px 12px';
    notice.className = 'resource-download panel panel--mint brackets';
    notice.hidden=!visible;
    const header = document.createElement('div'); header.style.cssText = 'display:flex;align-items:center;gap:4px';
    const count = document.createElement('span'); count.style.cssText = 'flex:1;font-variant-numeric:tabular-nums';
    count.textContent = `0/${resources.files.length}`;
    const bytesTotal=resources.estimatedBytes||resources.files.reduce((n,f)=>n+(f.bytes||0),0);
    const size=document.createElement('div');size.className='resource-download__size';size.style.cssText='margin-top:4px;font-variant-numeric:tabular-nums';
    const formatBytes=n=>Math.round(n/1048576)+' MB';
    size.textContent=bytesTotal?'0.0 MB / '+formatBytes(bytesTotal):'용량 확인 중…';
    const toggle = document.createElement('button'); toggle.type = 'button';toggle.className='btn btn--ghost btn--sm'; toggle.textContent = '⌄';
    toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', '리소스 다운로드 창 접기');
    toggle.style.cssText = 'cursor:pointer;padding:0 4px;font:16px/20px sans-serif;min-width:22px;height:22px';
    const bar = document.createElement('progress'); bar.max = resources.files.length; bar.value = 0;
    bar.setAttribute('aria-label', '리소스 다운로드 진행률'); bar.style.cssText = 'display:block;width:100%;height:6px;margin-top:6px;accent-color:#4bbda1';
    const detail = document.createElement('div'); detail.style.marginTop = '8px';
    let folded = false;
    toggle.onclick = () => {
      folded = !folded; detail.hidden = folded;count.hidden=folded;bar.hidden=folded;bar.style.display=folded?'none':'block';
      size.style.marginTop=folded?'0':'4px';
      if(folded)header.prepend(size);else notice.insertBefore(size,bar);
      notice.style.width = folded ? 'max-content' : 'min(400px,calc(100vw - 8px))';
      notice.style.right=folded?'4px':'8px';notice.style.bottom=folded?'4px':'8px';
      size.style.whiteSpace=folded?'nowrap':'normal';notice.style.maxWidth='calc(100vw - 8px)';
      notice.style.padding = folded ? '2px 4px' : '10px 12px';
      toggle.textContent = folded ? '⌃' : '⌄';
      toggle.setAttribute('aria-expanded', String(!folded));
      toggle.setAttribute('aria-label', folded ? '리소스 다운로드 창 펼치기' : '리소스 다운로드 창 접기');
    };
    header.append(count, toggle); notice.append(header, size, bar, detail); document.body.append(notice);
    const download = () => {
      notice.hidden=!visible;
      reportResourceProgress('resources',0,resources.files.length);
      detail.textContent = '누락된 리소스를 백그라운드에서 다운로드합니다. 기존 캐시는 재사용합니다.';
      return run(progress => {
        reportResourceProgress('resources',progress.done,progress.total,true,{bytesDone:progress.bytesDone||0,bytesTotal:progress.bytesTotal||0,phase:progress.phase});
        globalThis.__SP_RESOURCE_DOWNLOAD__=progress;
        if(progress.bytesTotal>0)size.textContent=formatBytes(Math.min(progress.bytesDone||0,progress.bytesTotal))+' / '+formatBytes(progress.bytesTotal);
        if (progress.path) window.dispatchEvent(new CustomEvent('resource-ready', {detail:{path:progress.path}}));
        count.textContent = `${progress.done}/${progress.total}`; bar.max = progress.total; bar.value = progress.done;
        detail.textContent = progress.phase === 'retry' ? '실패한 파일을 다시 시도합니다. 받은 파일은 유지됩니다.' : '리소스 확인·다운로드 중 · 게임을 이용할 수 있습니다.';
      }).then(() => {
        if(!notice.isConnected)return;
        try{localStorage.removeItem('sp.resources.downloadActive');localStorage.removeItem(DOWNLOAD_SCOPE_KEY);if(choice.scope?.startsWith('voice-'))localStorage.setItem('sp.resources.voiceReady.'+choice.scope.slice(6),'1');else {if(choice.effects==='official')localStorage.setItem(OFFICIAL_FX_READY_KEY,'1');if(!choice.scope)localStorage.setItem('sp.resources.voiceReady.'+choice.voice,'1');}}catch{}
        if(visible&&choice.effects==='official'&&!choice.scope?.startsWith('voice-'))window.dispatchEvent(new CustomEvent('sp-official-fx-ready'));
        window.dispatchEvent(new Event('sp-resource-download-finished'));
        reportResourceProgress('resources',0,0,false);
        count.textContent = `${bar.max}/${bar.max}`; bar.value = bar.max;
        if(bytesTotal)size.textContent=formatBytes(bytesTotal)+' / '+formatBytes(bytesTotal)+' · 완료';
        window.dispatchEvent(new CustomEvent('resource-ready', {detail:{all:true}}));
        detail.textContent = '리소스 다운로드 완료';
        setTimeout(() => notice.remove(), 4000);
      }).catch(error => {
        if(!notice.isConnected)return;
        reportResourceProgress('resources',0,0,false);
        notice.hidden=false;
        // Errors need the retry/skip controls even when the user minimized progress.
        if (folded) toggle.click();
        detail.textContent = '일부 리소스를 다운로드하지 못했습니다. 받은 파일은 유지됩니다. ';
        const details = document.createElement('details');
        const summary = document.createElement('summary'); summary.textContent = '실패 원인';
        const reason = document.createElement('pre'); reason.textContent = error.message;
        reason.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 sans-serif';
        details.append(summary, reason); detail.append(details);
        const retry = document.createElement('button'); retry.type = 'button';retry.className='btn btn--primary btn--sm'; retry.textContent = '다시 시도';
        retry.onclick = () => { retry.disabled = true; download(); };
        const skip = document.createElement('button'); skip.type = 'button';skip.className='btn btn--ghost btn--sm'; skip.textContent = '실패한 파일 건너뛰기'; skip.style.marginLeft = '8px';
        skip.onclick = () => notice.remove(); detail.append(retry, skip);
        console.warn('Background resource download:', error.message);
      });
    };
    return download();
}

function warmPreview(onProgress) {
  return new Promise((resolve,reject)=>{
    let lastMessage=Date.now();
    const receive=({data})=>{
      if(data?.type==='resourceWarmError'){cleanup();reject(new Error(data.message));}
      if(data?.type==='resourceProgress'&&data.id==='preview'){lastMessage=Date.now();if(data.active===false){cleanup();resolve();}else onProgress(data);}
    };
    // A browser can stop a long-running worker. Wake it again and reuse stored files.
    const wake=()=>{lastMessage=Date.now();navigator.serviceWorker.controller.postMessage({type:'warmPatch',selection:downloadSelection()});};
    const watchdog=setInterval(()=>{if(Date.now()-lastMessage>10000)try{wake();}catch(error){cleanup();reject(error);}},5000);
    const cleanup=()=>{clearInterval(watchdog);navigator.serviceWorker.removeEventListener('message',receive);};
    navigator.serviceWorker.addEventListener('message',receive);
    try { wake(); } catch(error) {cleanup();reject(error);}
  });
}

async function boot() {
  reportResourceProgress('resources',0,0);
  let consent=false,redownloadPending=false,downloadActive=false;try{consent=localStorage.getItem('sp.resources.downloadConsent')==='1';redownloadPending=localStorage.getItem('sp.resources.redownloadPending')==='1';downloadActive=localStorage.getItem('sp.resources.downloadActive')==='1';}catch{}
  const startApp=()=>import('./main.js');
  // A cached UI must not wait for configuration, worker installation, or cache enumeration.
  // Transport selection alone is awaited by the socket; the visible UI starts independently.
  const previewReady=fetch('/dev/ursus-config.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
  globalThis.__SP_TRANSPORT_READY__=previewReady.then(async preview=>{
    if(preview?.httpTransport){const [{net},{PreviewSocket}]=await Promise.all([import('./net.js'),import('../dev/ursus-http-socket.js')]);net.WS=PreviewSocket;}
  });
  const appEarly=startApp();
  appEarly?.catch(error=>console.error('[resources] Early application load failed',error));
  const preview=await previewReady;
  let requested=null,voiceRequest=null;
  const queuedVoices=new Set();
  const flushVoiceQueue=()=>{if(requested||voiceRequest||document.querySelector('.resource-consent')||!queuedVoices.size)return;const language=queuedVoices.values().next().value;queuedVoices.delete(language);window.dispatchEvent(new CustomEvent('sp-request-voice-download',{detail:{language}}));};
  window.addEventListener('sp-resource-download-finished',()=>setTimeout(flushVoiceQueue,0));
  window.addEventListener('sp-request-official-fx-download',()=>{
    if(requested||voiceRequest)return;
    const current=document.querySelector('.resource-consent select[aria-label="전투 이펙트"]');
    if(current){current.value='official';current.dispatchEvent(new Event('change'));current.focus();return;}
    if(document.querySelector('.resource-consent'))return;
    requested=(async()=>{
      const response=await fetch('/vendor/browser-resources.json',{cache:'no-store'});
      if(!response.ok)throw new Error('리소스 목록을 불러오지 못했습니다.');
      const resources=await response.json();
      if(!await requestDownloadConsent(resources,true))return;
      await navigator.serviceWorker.ready;
      if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
      // A change of choices invalidates only pending work, not downloaded files.
      await showDownloadProgress(resources,preview?.lazyResources?warmPreview:progress=>message('preparePatch',progress),true);
    })().catch(error=>console.warn('[resources]',error)).finally(()=>{requested=null;flushVoiceQueue();});
  });
  window.addEventListener('sp-request-voice-download',({detail})=>{
    const language=detail?.language;if(!['kr','jp'].includes(language))return;
    try{if(localStorage.getItem('sp.resources.voiceReady.'+language)==='1'){setTimeout(flushVoiceQueue,0);return;}}catch{}
    if(voiceRequest||requested){queuedVoices.add(language);return;}
    voiceRequest=(async()=>{
      const response=await fetch('/vendor/browser-resources.json',{cache:'no-store'});if(!response.ok)throw Error('음성 목록을 불러오지 못했습니다.');
      const resources=await response.json(),selection={...readResourceSelection(),scope:'voice-'+language};
      const selected=selectedResources(resources,selection);
      if(selected.files.length&&await missingResourceBytes(selected)===0){localStorage.setItem('sp.resources.voiceReady.'+language,'1');return;}
      // One download dialog at a time; an initial/full choice already includes voice selection.
      if(document.querySelector('.resource-consent')){queuedVoices.add(language);return;}
      if(!await requestDownloadConsent(resources,false,language))return;
      await navigator.serviceWorker.ready;
      if(!navigator.serviceWorker.controller)await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
      await showDownloadProgress(resources,preview?.lazyResources?warmPreview:progress=>message('preparePatch',progress),true);
    })().catch(error=>console.warn('[resources]',error)).finally(()=>{voiceRequest=null;flushVoiceQueue();});
  });
  if(!officialFxDownloaded()){try{if(consent&&!redownloadPending&&!downloadActive&&JSON.parse(localStorage.getItem('sp.pref.settings')||'null')?.officialFx==='full')setTimeout(()=>window.dispatchEvent(new CustomEvent('sp-request-official-fx-download')),500);}catch{}}

  if(preview?.lazyResources){
    reportResourceProgress('resources',0,0,false);
    await (appEarly||startApp());
    const prepare=async()=>{
      reportResourceProgress('preview',0,0);
      if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.register('/dev/ursus-resource-worker.js',{scope:'/',type:'module'});if(reg.installing)await new Promise(resolve=>{const worker=reg.installing;worker.addEventListener('statechange',()=>{if(worker.state==='activated'||worker.state==='redundant')resolve();});});await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller||!navigator.serviceWorker.controller.scriptURL.endsWith('/dev/ursus-resource-worker.js'))await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));}
      document.getElementById('resource-fonts').href='/fonts/fonts.css';
      if(redownloadPending||!consent||downloadActive){
        const response=await fetch('/vendor/browser-resources.json',{cache:'no-store'});
        if(!response.ok)throw new Error('리소스 다운로드 목록을 불러오지 못했습니다. 새로고침해 주세요.');
        const resources=await response.json();
        if(redownloadPending||!consent)await requestDownloadConsent(resources);
        showDownloadProgress(resources,warmPreview,true);
      }else warmPreview(()=>{}).catch(error=>console.warn('[resources] Background preparation failed',error));
    };
    // Two frames let the menu paint and become interactive before optional resource work starts.
    requestAnimationFrame(()=>requestAnimationFrame(()=>prepare().catch(error=>{reportResourceProgress('preview',0,0,false);console.warn('[resources] Background preparation failed',error);})));
    return;
  }
  globalThis.performance?.mark?.('sp-resource-catalogue-start');
  const response = await fetch('/vendor/browser-resources.json', { cache: 'no-store' });
  // Existing self-hosted installations without the browser-download index retain their workflow.
  if (response.status === 404) {
    reportResourceProgress('resources',0,0,false);
    document.getElementById('resource-fonts').href = '/fonts/fonts.css';
    await import('./main.js'); return;
  }
  if (!response.ok) throw new Error('리소스 목록을 불러오지 못했습니다. 새로고침해 주세요.');
  const resources = await response.json();
  globalThis.performance?.mark?.('sp-resource-catalogue-ready');
  if (!('serviceWorker' in navigator) || !('caches' in window)) throw new Error('HTTPS와 브라우저 저장소를 지원하는 최신 브라우저가 필요합니다.');
  reportResourceProgress('resources',0,0);
  await navigator.serviceWorker.register('/resource-worker.js', { type: 'module', scope: '/' });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  const cacheStatus=await message('status');
  globalThis.performance?.mark?.('sp-resource-status-ready');
  reportResourceProgress('resources',0,0,false);
  if (redownloadPending || (!cacheStatus.ready && !consent)) {
    await requestDownloadConsent(resources);
  }
  // The initial stylesheet request can precede service-worker control.
  const fonts = document.getElementById('resource-fonts');
  if (fonts) fonts.href = '/fonts/fonts.css?resources=' + resources.version;
  await (appEarly||startApp());
  const warmResources = () => {
  if (downloadActive || redownloadPending || !cacheStatus.ready || cacheStatus.patch) {
    showDownloadProgress(resources, progress=>message('preparePatch',progress),downloadActive||redownloadPending||!consent);
  }
  };
  const scheduleWarm=()=>{if(typeof requestIdleCallback==='function')requestIdleCallback(warmResources,{timeout:3000});else setTimeout(warmResources,300);};
  if(globalThis.__SP_UI_READY__)scheduleWarm();
  else window.addEventListener('sp-ui-ready',scheduleWarm,{once:true});

}
boot().catch(error => {
  reportResourceProgress('resources',0,0,false);
  console.error('[resources]', error);
  const errorElement = document.getElementById('boot-err') || document.querySelector('.boot__inner');
  if (errorElement) errorElement.textContent = error.message;
});

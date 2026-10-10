// Start after the download notice; optional resources cache in the background.
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
    try { navigator.serviceWorker.controller.postMessage({type, resume}, [channel.port2]); }
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

async function boot() {
  const preview=await fetch('/dev/ursus-config.json',{cache:'no-store'}).then(r=>r.ok?r.json():null).catch(()=>null);
  if(preview?.lazyResources){
    const [{net},{PreviewSocket}]=await Promise.all([import('./net.js'),import('../dev/ursus-http-socket.js')]);if(preview.httpTransport)net.WS=PreviewSocket;
    if('serviceWorker' in navigator){const reg=await navigator.serviceWorker.register('/dev/ursus-resource-worker.js',{scope:'/'});if(reg.installing)await new Promise(resolve=>{const worker=reg.installing;worker.addEventListener('statechange',()=>{if(worker.state==='activated'||worker.state==='redundant')resolve();});});await navigator.serviceWorker.ready;if(!navigator.serviceWorker.controller||!navigator.serviceWorker.controller.scriptURL.endsWith('/dev/ursus-resource-worker.js'))await new Promise(resolve=>navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));}
    document.getElementById('resource-fonts').href='/fonts/fonts.css';await import('./main.js');navigator.serviceWorker?.controller?.postMessage({type:'warmPatch'});return;
  }
  const response = await fetch('/vendor/browser-resources.json', { cache: 'no-store' });
  // Existing self-hosted installations without the browser-download index retain their workflow.
  if (response.status === 404) {
    document.getElementById('resource-fonts').href = '/fonts/fonts.css';
    await import('./main.js'); return;
  }
  if (!response.ok) throw new Error('리소스 목록을 불러오지 못했습니다. 새로고침해 주세요.');
  const resources = await response.json();
  if (!('serviceWorker' in navigator) || !('caches' in window)) throw new Error('HTTPS와 브라우저 저장소를 지원하는 최신 브라우저가 필요합니다.');
  await navigator.serviceWorker.register('/resource-worker.js', { type: 'module', scope: '/' });
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) await new Promise(resolve => navigator.serviceWorker.addEventListener('controllerchange', resolve, { once: true }));
  const cacheStatus=await message('status');
  let consent = false;
  try { consent = localStorage.getItem('sp.resources.downloadConsent') === '1'; } catch {}
  if (!cacheStatus.ready && !consent) {
    const splash = document.getElementById('boot');
    splash.removeAttribute('aria-hidden');
    const panel = splash.querySelector('.boot__inner');
    panel.replaceChildren();
    const title = document.createElement('h1'); title.textContent = '게임 리소스 다운로드';
    const description = document.createElement('p');
    description.textContent = `처음 한 번 약 ${Math.ceil(resources.estimatedBytes / 1048576)}MB의 이미지·모델·소리·폰트를 공개 GitHub 미러에서 내려받습니다. Wi-Fi 사용을 권장합니다. 게임을 먼저 시작하고 리소스는 백그라운드에서 내려받습니다. 준비되지 않은 맵은 단순 맵으로 표시합니다. 파일은 이 브라우저에 저장해 다음 접속에 재사용합니다. 브라우저 저장소가 삭제되면 다시 다운로드합니다.`;
    const notice = document.createElement('p');
    notice.textContent = '비공식 팬 게임입니다. 게임 소재의 권리는 Hypergryph·Yostar 등 원 권리자에게 있으며, 개인적인 비상업적 이용만 가능합니다.';
    const sources = document.createElement('a'); sources.href = 'https://github.com/moring-m/Stronghold-Protocol_Ko_Arca/blob/master/docs/ASSETS.md'; sources.target = '_blank'; sources.rel = 'noopener'; sources.textContent = '리소스 출처와 이용 안내';
    const progress = document.createElement('progress'); progress.max = resources.files.length; progress.value = 0;
    const status = document.createElement('p'); status.setAttribute('role', 'status'); status.style.whiteSpace = 'pre-wrap';
    const button = document.createElement('button'); button.textContent = '다운로드하며 시작'; button.type = 'button';
    panel.style.cssText = 'max-width:620px;padding:24px;max-height:85vh;overflow:auto;text-align:left;line-height:1.6';
    button.style.cssText = 'padding:12px 20px;margin-top:12px;cursor:pointer';
    panel.append(title, description, notice, sources, progress, status, button);
    await new Promise(resolve => {
      button.onclick = async () => {
        button.disabled = true;
        try {
          const estimate = await navigator.storage?.estimate();
          if (estimate?.quota && estimate.quota - estimate.usage < resources.estimatedBytes * 1.15) throw new Error('브라우저 저장 공간이 부족합니다. 공간을 확보한 뒤 다시 시도해 주세요.');
          await navigator.storage?.persist?.();
          try { localStorage.setItem('sp.resources.downloadConsent', '1'); } catch {}
          resolve();
        } catch (error) { status.textContent = error.message; button.textContent = '다운로드 다시 시도'; button.disabled = false; }
      };
    });
  }
  // The initial stylesheet request can precede service-worker control.
  const fonts = document.getElementById('resource-fonts');
  if (fonts) fonts.href = '/fonts/fonts.css?resources=' + resources.version;
  await import('./main.js');
  if (!cacheStatus.ready || cacheStatus.patch) {
    const notice = document.createElement('div');
    notice.setAttribute('role', 'status');
    notice.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:10000;width:min(360px,calc(100vw - 32px));box-sizing:border-box;padding:12px 16px;background:#101b18ee;color:#dce9e4;border:1px solid #4bbda1;font:14px/1.5 sans-serif;box-shadow:0 2px 12px #0006';
    notice.className = 'resource-download';
    const header = document.createElement('div'); header.style.cssText = 'display:flex;align-items:center;gap:8px';
    const count = document.createElement('span'); count.style.cssText = 'flex:1;font-variant-numeric:tabular-nums';
    count.textContent = `0/${resources.files.length}`;
    const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = '접기';
    toggle.setAttribute('aria-expanded', 'true'); toggle.setAttribute('aria-label', '리소스 다운로드 창 접기');
    toggle.style.cssText = 'cursor:pointer;padding:2px 6px;font:12px sans-serif';
    const bar = document.createElement('progress'); bar.max = resources.files.length; bar.value = 0;
    bar.setAttribute('aria-label', '리소스 다운로드 진행률'); bar.style.cssText = 'display:block;width:100%;height:6px;margin-top:6px;accent-color:#4bbda1';
    const detail = document.createElement('div'); detail.style.marginTop = '8px';
    let folded = false;
    toggle.onclick = () => {
      folded = !folded; detail.hidden = folded;
      notice.style.width = folded ? 'min(220px,calc(100vw - 32px))' : 'min(360px,calc(100vw - 32px))';
      notice.style.padding = folded ? '6px 10px' : '12px 16px';
      toggle.textContent = folded ? '펼치기' : '접기';
      toggle.setAttribute('aria-expanded', String(!folded));
      toggle.setAttribute('aria-label', folded ? '리소스 다운로드 창 펼치기' : '리소스 다운로드 창 접기');
    };
    header.append(count, toggle); notice.append(header, bar, detail); document.body.append(notice);
    const download = () => {
      detail.textContent = '누락된 리소스를 백그라운드에서 다운로드합니다. 기존 캐시는 재사용합니다.';
      return message('preparePatch', progress => {
        count.textContent = `${progress.done}/${progress.total}`; bar.max = progress.total; bar.value = progress.done;
        detail.textContent = progress.phase === 'retry' ? '실패한 파일을 다시 시도합니다. 받은 파일은 유지됩니다.' : '리소스 확인·다운로드 중 · 게임을 이용할 수 있습니다.';
      }).then(() => {
        count.textContent = `${bar.max}/${bar.max}`; bar.value = bar.max;
        detail.textContent = '리소스 다운로드 완료';
        setTimeout(() => notice.remove(), 4000);
      }).catch(error => {
        // Errors need the retry/skip controls even when the user minimized progress.
        if (folded) toggle.click();
        detail.textContent = '일부 리소스를 다운로드하지 못했습니다. 받은 파일은 유지됩니다. ';
        const details = document.createElement('details');
        const summary = document.createElement('summary'); summary.textContent = '실패 원인';
        const reason = document.createElement('pre'); reason.textContent = error.message;
        reason.style.cssText = 'white-space:pre-wrap;overflow-wrap:anywhere;font:12px/1.5 sans-serif';
        details.append(summary, reason); detail.append(details);
        const retry = document.createElement('button'); retry.type = 'button'; retry.textContent = '다시 시도';
        retry.onclick = () => { retry.disabled = true; download(); };
        const skip = document.createElement('button'); skip.type = 'button'; skip.textContent = '실패한 파일 건너뛰기'; skip.style.marginLeft = '8px';
        skip.onclick = () => notice.remove(); detail.append(retry, skip);
        console.warn('Background resource download:', error.message);
      });
    };
    download();
  }
}
boot().catch(error => {
  console.error('[resources]', error);
  const errorElement = document.getElementById('boot-err') || document.querySelector('.boot__inner');
  if (errorElement) errorElement.textContent = error.message;
});

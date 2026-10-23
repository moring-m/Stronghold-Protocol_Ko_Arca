// Use the browser's mobile viewport zoom, so layout, canvas and hit coordinates agree.
export const MOBILE_UI_SCALES = Object.freeze([.5,.6,.7,.8,.9,1,1.1,1.25,1.5]);
export const mobileUiScale = value => MOBILE_UI_SCALES.includes(value) ? value : 1;
export function isMobileScaleTarget(win=globalThis) {
  const matches=q=>{try{return !!win.matchMedia?.(q).matches;}catch{return false;}};
  return matches('(pointer: coarse)') && !matches('(any-pointer: fine)') && !matches('(any-hover: hover)');
}
export function installMobileUiScale(settings,win=globalThis) {
  const meta=win.document?.querySelector('meta[name="viewport"]');
  if(!meta)return ()=>{};
  const original=meta.getAttribute('content');
  let lastScale=1;
  const apply=()=>{
    const scale=isMobileScaleTarget(win)?mobileUiScale(settings.get().mobileUiScale):1;
    let content=original;
    if(scale!==1){
      const viewport=win.visualViewport;
      const physicalWidth=Math.round(viewport?.width>0 && viewport?.scale>0 ? viewport.width*viewport.scale : win.innerWidth*lastScale);
      if(!(physicalWidth>0))return;
      content=`width=${Math.round(physicalWidth/scale)}, initial-scale=${scale}, minimum-scale=${scale}, maximum-scale=${scale}, user-scalable=no, viewport-fit=cover`;
    }
    lastScale=scale;
    if(meta.getAttribute('content')!==content)meta.setAttribute('content',content);
  };
  const off=settings.subscribe(apply);
  win.addEventListener?.('resize',apply);
  win.addEventListener?.('orientationchange',apply);
  win.visualViewport?.addEventListener?.('resize',apply);
  apply();
  return ()=>{off?.();win.removeEventListener?.('resize',apply);win.removeEventListener?.('orientationchange',apply);win.visualViewport?.removeEventListener?.('resize',apply);meta.setAttribute('content',original);};
}

export function mobileUiScaleText(language) {
  return ({
    ko:{label:'모바일 UI 배율',hint:'화면 전체를 확대·축소합니다.'},
    en:{label:'Mobile UI scale',hint:'Zoom the entire page in or out.'},
    ja:{label:'モバイルUIの倍率',hint:'画面全体を拡大・縮小します。'},
    zh:{label:'移动端界面缩放',hint:'放大或缩小整个页面。'},
    'zh-TW':{label:'行動版介面縮放',hint:'放大或縮小整個頁面。'},
  })[language] || {label:'모바일 UI 배율',hint:'화면 전체를 확대·축소합니다.'};
}

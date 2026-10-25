// Use the browser's mobile viewport zoom, so layout, canvas and hit coordinates agree.
export const MOBILE_UI_SCALES = Object.freeze([.5,.6,.7,.8,.9,1,1.1,1.25,1.5]);
export const mobileUiScale = value => MOBILE_UI_SCALES.includes(value) ? value : 1;
export function isMobileScaleTarget(win=globalThis) {
  const matches=q=>{try{return !!win.matchMedia?.(q).matches;}catch{return false;}};
  const nav=win.navigator||{};
  // A touch-enabled Windows desktop still ignores viewport-meta zoom.
  if(/Windows NT/i.test(nav.userAgent||''))return false;
  // Phones can advertise fine pointers/hover in desktop-site mode or with an attached mouse.
  if(nav.userAgentData?.mobile||nav.maxTouchPoints>0||/Android|iPhone|iPad|iPod/i.test(nav.userAgent||''))return true;
  return matches('(pointer: coarse)') && !matches('(any-pointer: fine)') && !matches('(any-hover: hover)');
}
export function installMobileUiScale(settings,win=globalThis) {
  const meta=win.document?.querySelector('meta[name="viewport"]');
  if(!meta)return ()=>{};
  const original=meta.getAttribute('content');
  let lastScale=1;
  const root=win.document.documentElement,originalZoom=root?.style?.zoom||'';
  const apply=()=>{
    const scale=mobileUiScale(settings.get().mobileUiScale),mobile=isMobileScaleTarget(win);
    // Mobile browsers may ignore viewport-meta scaling in the fullscreen top layer.
    const fullscreen=!!(win.document.fullscreenElement||win.document.webkitFullscreenElement);
    const nativeViewport=mobile&&!fullscreen;
    if(root?.style){
      root.style.zoom=nativeViewport?originalZoom:(scale===1?originalZoom:String(scale));
      root.style.setProperty('--ui-viewport-scale',nativeViewport?'1':String(scale));
    }
    let content=original;
    if(nativeViewport&&scale!==1){
      const viewport=win.visualViewport;
      const physicalWidth=Math.round(viewport?.width>0 && viewport?.scale>0 ? viewport.width*viewport.scale : win.innerWidth*lastScale);
      if(!(physicalWidth>0))return;
      content=`width=${Math.round(physicalWidth/scale)}, initial-scale=${scale}, minimum-scale=${scale}, maximum-scale=${scale}, user-scalable=no, viewport-fit=cover`;
    }
    lastScale=nativeViewport?scale:1;
    if(meta.getAttribute('content')!==content)meta.setAttribute('content',content);
  };
  const off=settings.subscribe(apply);
  win.addEventListener?.('resize',apply);
  win.addEventListener?.('orientationchange',apply);
  win.document.addEventListener?.('fullscreenchange',apply);
  win.document.addEventListener?.('webkitfullscreenchange',apply);
  win.visualViewport?.addEventListener?.('resize',apply);
  apply();
  return ()=>{off?.();win.removeEventListener?.('resize',apply);win.removeEventListener?.('orientationchange',apply);win.visualViewport?.removeEventListener?.('resize',apply);meta.setAttribute('content',original);win.document.removeEventListener?.('fullscreenchange',apply);win.document.removeEventListener?.('webkitfullscreenchange',apply);if(root?.style){root.style.zoom=originalZoom;root.style.removeProperty('--ui-viewport-scale');}};
}

export function mobileUiScaleText(language) {
  return ({
    ko:{label:'UI 배율',hint:'화면 전체를 확대·축소합니다.'},
    en:{label:'UI scale',hint:'Zoom the entire page in or out.'},
    ja:{label:'UIの倍率',hint:'画面全体を拡大・縮小します。'},
    zh:{label:'界面缩放',hint:'放大或缩小整个页面。'},
    'zh-TW':{label:'介面縮放',hint:'放大或縮小整個頁面。'},
  })[language] || {label:'UI 배율',hint:'화면 전체를 확대·축소합니다.'};
}

/** Effective CSS layout zoom; native mobile viewport zoom already uses consistent client coordinates. */
export function uiCssZoom(doc=globalThis.document){const n=Number(doc?.documentElement?.style?.zoom);return n>0?n:1;}

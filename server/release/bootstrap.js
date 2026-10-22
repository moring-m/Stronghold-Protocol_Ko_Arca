// Injected before the game's scripts. All fetches/worker scripts stay on this release.
export function bootstrap(release, { cleanUrls = false } = {}) {
  return `(()=>{const release=${JSON.stringify(release)};globalThis.__SP_RELEASE=release;
 import('/__roll/retirement-monitor.js').catch(()=>{});
 ${cleanUrls ? `
 const storedKey='sp.activeRelease';
 try{sessionStorage.setItem(storedKey,release);}catch{}
 globalThis.__SP_GO_LATEST=()=>{try{sessionStorage.removeItem(storedKey);}catch{}location.assign('/');};
 const current=new URL(location.href),match=/^\\/r\\/[a-f0-9]{12,40}(\\/.*)$/.exec(current.pathname);
 if(match){
  const base=document.createElement('base');base.href=current.href;document.head.prepend(base);
  current.pathname=match[1];current.searchParams.delete('release');
  history.replaceState(history.state,'',current.pathname+current.search+current.hash);
 }
 // Attribute loads do not use fetch, so retain their release after hiding the path.
 const patchSrc=(proto,key)=>{const d=Object.getOwnPropertyDescriptor(proto,key);if(!d?.set||!d.configurable)return;Object.defineProperty(proto,key,{...d,set(value){d.set.call(this,pin(value));}});};
 for(const [name,key]of [['HTMLImageElement','src'],['HTMLMediaElement','src'],['HTMLSourceElement','src'],['HTMLScriptElement','src'],['HTMLLinkElement','href'],['HTMLIFrameElement','src']])if(globalThis[name])patchSrc(globalThis[name].prototype,key);
 const setAttribute=Element.prototype.setAttribute;Element.prototype.setAttribute=function(name,value){if(['src','href','poster'].includes(String(name).toLowerCase())&&String(value).startsWith('/'))value=pin(value);return setAttribute.call(this,name,value);};
 ` : ''}
 const pin=input=>{const u=new URL(input,location.href);if(u.origin===location.origin&&!u.pathname.startsWith('/__roll/'))u.searchParams.set('release',release);return u.href;};
 const original=globalThis.fetch.bind(globalThis);globalThis.fetch=(input,init)=>original(input instanceof Request?new Request(pin(input.url),input):pin(input),init);
 const WorkerClass=globalThis.Worker;if(WorkerClass)globalThis.Worker=class extends WorkerClass{constructor(url,options){super(pin(url),options);}};
 const Socket=globalThis.WebSocket;globalThis.WebSocket=class extends Socket{constructor(url,protocols){const u=new URL(url,location.href);if(u.host===location.host)u.searchParams.set('release',release);super(u.href,protocols);}};
})();`;
}

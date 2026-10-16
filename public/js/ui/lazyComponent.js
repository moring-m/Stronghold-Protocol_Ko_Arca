import { useEffect, useState } from '../../vendor/hooks.module.js';
import { html, Spinner } from './components.js';
/** Load UI code only when mounted; imports are shared with optional room-time warming. */
export function lazyComponent(load,name){
 let Component=null,pending=null;
 const preload=()=>pending||(pending=load().then(module=>{if(typeof module[name]!=='function')throw Error(`Missing screen: ${name}`);Component=module[name];return Component;}).catch(error=>{pending=null;throw error;}));
 function Lazy(props){
  const [ready,setReady]=useState(()=>Component),[error,setError]=useState(null);
  useEffect(()=>{let live=true;if(!ready)preload().then(component=>{if(live)setReady(()=>component);}).catch(e=>{if(live)setError(e);});return()=>{live=false;};},[]);
  if(error)throw error;
  return ready?html`<${ready} ...${props}/>`:html`<div class="lo-loading" role="status"><${Spinner}/><span>화면을 불러오는 중…</span></div>`;
 }
 Lazy.preload=preload;return Lazy;
}

const pendingStyles=new Map();
/** Preserve the original cascade position while fetching each screen's CSS only when needed. */
export function loadScreenStyles(paths){return Promise.all(paths.map(path=>{
 if(pendingStyles.has(path))return pendingStyles.get(path);
 const job=new Promise((resolve,reject)=>{
  const link=document.createElement('link');link.rel='stylesheet';link.href=path;
  const timer=setTimeout(()=>{link.remove();reject(Error('화면 스타일 로딩 시간 초과: '+path));},20000);
  link.onload=()=>{clearTimeout(timer);resolve();};link.onerror=()=>{clearTimeout(timer);link.remove();reject(Error('화면 스타일을 불러오지 못했습니다: '+path));};
  const anchor=[...document.querySelectorAll('meta[data-screen-style]')].find(node=>node.dataset.screenStyle===path);
  if(anchor)anchor.before(link);else document.head.append(link);
 }).catch(error=>{pendingStyles.delete(path);throw error;});pendingStyles.set(path,job);return job;
}));}

// Served by the permanent router, so old game clients can also receive deadlines.
export function startRetirementMonitor({release=globalThis.__SP_RELEASE,fetchFn=(...args)=>fetch(...args),notify=text=>import('/js/ui/toasts.js?release='+release).then(m=>m.toast(text,'warn',{ttl:10000})).catch(()=>{}),leave=()=>globalThis.__SP_GO_LATEST?globalThis.__SP_GO_LATEST():location.assign('/'),setInterval:setIv=setInterval,clearInterval:clearIv=clearInterval}={}){
 const thresholds=[30,10,5,1].map(n=>n*60000);let deadline=null,seen=new Set(),pending=false,stopped=false,timer;
 const text=(remaining,initial)=>{const minutes=Math.max(1,Math.ceil(remaining/60000)),label=minutes%60===0?`${minutes/60}시간`:`${minutes}분`;return `${initial?'새 버전이 적용되었습니다. 기존 버전은 최대 1시간 유지됩니다. ':''}기존 버전 종료까지 ${label} 남았습니다. 시간이 끝나면 이 버전의 방과 게임이 종료됩니다.`;};
 const stop=()=>{stopped=true;if(timer!=null)clearIv(timer);};
 const check=async()=>{
  if(!release||pending||stopped)return;pending=true;
  try{
   const r=await fetchFn('/__roll/retirement?id='+release,{cache:'no-store',signal:AbortSignal.timeout(5000)});if(!r.ok)return;
   const info=await r.json();if(stopped)return;
   if(info.expired){stop();notify('기존 버전 유지 시간이 끝났습니다. 새 버전으로 이동합니다.');leave();return;}
   if(!Number.isSafeInteger(info.expiresAt)){deadline=null;seen.clear();return;}
   const remaining=info.expiresAt-info.serverNow;
   if(deadline!==info.expiresAt){deadline=info.expiresAt;seen.clear();if(!info.serverNotices)notify(text(remaining,true));for(const limit of thresholds)if(remaining<=limit)seen.add(limit);return;}
   if(info.serverNotices)return;
   const crossed=thresholds.filter(limit=>remaining<=limit&&!seen.has(limit));
   if(crossed.length){for(const limit of crossed)seen.add(limit);notify(text(remaining,false));}
  }catch{}finally{pending=false;}
 };
 timer=setIv(check,15000);check();return{check,stop};
}
if(typeof window!=='undefined'&&globalThis.__SP_RELEASE)startRetirementMonitor();

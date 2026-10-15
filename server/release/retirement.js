import {RELEASE_REMINDERS_MS,retirementText} from '../../shared/releaseRetirement.js';
export function createRetirement({now=Date.now,setTimeout:setT=setTimeout,clearTimeout:clearT=clearTimeout,notify,expire}){
 let deadline=null,timers=[];
 const stop=()=>{for(const timer of timers)clearT(timer);timers=[];deadline=null;};
 const schedule=(at,fn)=>{const timer=setT(fn,Math.max(0,at-now()));timer?.unref?.();timers.push(timer);};
 const setDeadline=value=>{
  if(value===deadline)return;
  stop();if(!Number.isSafeInteger(value)||value<=0)return;deadline=value;
  if(value<=now()){expire();return;}
  notify(retirementText(value-now(),true));
  for(const remaining of RELEASE_REMINDERS_MS)if(value-remaining>now())schedule(value-remaining,()=>notify(retirementText(value-now())));
  schedule(value,()=>{notify('기존 버전 유지 시간이 끝났습니다. 새 버전으로 다시 접속해주세요.');expire();});
 };
 return{setDeadline,stop,deadline:()=>deadline};
}

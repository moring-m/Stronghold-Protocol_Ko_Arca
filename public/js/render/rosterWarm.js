import {reportResourceProgress} from '../resourceProgress.js';

const scheduleIdle=(fn,delay=0)=>delay||typeof requestIdleCallback!=='function'
 ? {kind:'timer',id:setTimeout(fn,delay)} : {kind:'idle',id:requestIdleCallback(fn,{timeout:250})};
const cancelIdle=job=>job?.kind==='idle'?cancelIdleCallback(job.id):clearTimeout(job?.id);

/** Warm the field's own asset store: one figure at a time, model parsing only during prep. */
export function createRosterWarmer(assets,{canParse=()=>true,schedule=scheduleIdle,cancel=cancelIdle}={}) {
 let queue=[],timer=null,stopped=false,running=false,total=0,done=0,signature='';
 const releaseHold=assets.spine?.hold?.();
 const report=active=>reportResourceProgress('roster',done,total,active);
 const enqueue=(delay=0)=>{if(!stopped&&timer==null&&!running&&queue.length)timer=schedule(run,delay);};
 async function run(){
  timer=null;if(stopped||running)return;
  if(!canParse()){enqueue(1000);return;}
  const job=queue.shift();if(!job)return;
  running=true;
  try {
   await Promise.all(job.images.map(url=>assets.image(url)));
   for(const entry of job.models){
    if(stopped||!canParse())break;
    if(assets.spine.peek(entry))continue;
    try{await assets.spine.acquire(entry);}catch{/* visible units retry failures */}
    finally{assets.spine.release(entry);}
   }
  }finally{running=false;done++;report(queue.length>0);enqueue();}
 }
 return {
  update(infos){
   const seen=new Set(),next=[];
   for(const info of infos||[]){
    const id=info.spine||info.defId,key=`${id}|${info.avatar||''}`;
    if(!id||seen.has(key))continue;seen.add(key);
    const images=[...new Set([assets.avatar?.(info.avatar||id),assets.portrait?.(info.avatar||id),assets.picture?.(info.avatar||id)].filter(Boolean))];
    const models=[assets.spineEntry?.(id),assets.spineEntry?.(id,{back:true})].filter((e,i,a)=>e&&a.findIndex(v=>v?.skel===e.skel)===i);
    if(images.length||models.length)next.push({images,models});
   }
   const key=JSON.stringify(next.map(j=>[j.images,j.models.map(e=>e.skel)]));
   if(key===signature)return;signature=key;queue=next;
   total=queue.length+(running?1:0);done=0;report(total>0);enqueue();
  },
  destroy(){stopped=true;queue=[];if(timer!=null)cancel(timer);releaseHold?.();report(false);}
 };
}

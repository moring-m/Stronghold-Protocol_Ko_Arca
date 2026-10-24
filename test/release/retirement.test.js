import{test}from'node:test';import assert from'node:assert/strict';
import{createRetirement}from'../../server/release/retirement.js';import{RELEASE_RETENTION_MS,RELEASE_REMINDERS_MS,retainedDeadline}from'../../shared/releaseRetirement.js';
import{startRetirementMonitor}from'../../server/release/retirement-browser.js';
function clock(){let time=10000,seq=0;const jobs=new Map();return{now:()=>time,setTimeout(fn,ms){const id=++seq;jobs.set(id,{at:time+ms,fn});return id;},clearTimeout:id=>jobs.delete(id),advance(to){time=to;for(const[id,j]of[...jobs].sort((a,b)=>a[1].at-b[1].at))if(j.at<=time){jobs.delete(id);j.fn();}},jobs};}
test('retained worker announces 1h, 30m, 10m, 5m and 1m, then expires exactly at its original deadline',()=>{
 const c=clock(),messages=[];let expired=0;const r=createRetirement({...c,notify:s=>messages.push(s),expire:()=>expired++}),deadline=c.now()+RELEASE_RETENTION_MS;
 r.setDeadline(deadline);assert.match(messages[0],/1시간/);r.setDeadline(deadline);assert.equal(messages.length,1);
 for(const [i,remaining]of RELEASE_REMINDERS_MS.entries()){c.advance(deadline-remaining);assert.equal(messages.length,i+2);assert.equal(expired,0);assert.match(messages.at(-1),new RegExp(remaining===3600000?'1시간':remaining/60000+'분'));}
 c.advance(deadline-1);assert.equal(expired,0);c.advance(deadline);assert.equal(expired,1);assert.match(messages.at(-1),/유지 시간이 끝/);r.stop();assert.equal(c.jobs.size,0);
});
test('reactivating a worker cancels its retirement and a restart uses remaining time, not a fresh 1h',()=>{
 const c=clock();let expired=0;const notify=[];const r=createRetirement({...c,notify:s=>notify.push(s),expire:()=>expired++}),deadline=c.now()+RELEASE_RETENTION_MS;
 c.advance(deadline-30*60000);r.setDeadline(deadline);assert.match(notify[0],/30분/);r.setDeadline(null);c.advance(deadline+1);assert.equal(expired,0);
});
test('legacy client monitoring deduplicates reminders and leaves only when its own release expires',async()=>{
 let serverNow=10000,expiresAt=serverNow+RELEASE_RETENTION_MS,expired=false,leaves=0;const messages=[];
 const m=startRetirementMonitor({release:'111111111111',setInterval:()=>1,clearInterval(){},notify:s=>messages.push(s),leave:()=>leaves++,fetchFn:async()=>({ok:true,json:async()=>({expiresAt,serverNow,expired,serverNotices:false})})});
 // Initial automatic poll is in flight; allow it to finish.
 await new Promise(r=>setImmediate(r));assert.equal(messages.length,1);
 for(const remaining of RELEASE_REMINDERS_MS){serverNow=expiresAt-remaining;await m.check();await m.check();}
 assert.equal(messages.length,5);assert.equal(leaves,0);expired=true;await m.check();assert.equal(leaves,1);await m.check();assert.equal(leaves,1);
});

test('old two-hour state migrates to one hour from original activation, never from restart',()=>{
 const start=100000,record={expiresAt:start+2*3600000};
 const migrated=retainedDeadline(record,start+45*60000);
 assert.equal(migrated.retiredAt,start);assert.equal(migrated.expiresAt,start+3600000);
 assert.deepEqual(retainedDeadline(migrated,start+55*60000),migrated);
 assert.ok(retainedDeadline(record,start+90*60000).expiresAt<start+90*60000);
 assert.equal(retainedDeadline({},start).expiresAt,start+3600000);
});

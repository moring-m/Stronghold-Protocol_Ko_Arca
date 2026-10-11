import P from 'puppeteer-core';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {existsSync} from 'node:fs';
import {startServer} from '../../server/index.js';
import {Match} from '../../server/match/Match.js';
import assert from 'node:assert/strict';
class ServerMatch extends Match{constructor(o){super({...o,clientCombat:false});}}
test('spectator combat transition, lone cooperative framing and Korean strategy badge', {skip:process.env.SP_E2E!=='1'||!existsSync('/usr/bin/chromium'),timeout:90000}, async()=>{
const srv=await startServer({port:0,host:'127.0.0.1',quiet:true,MatchClass:ServerMatch,dataDir:new URL('../../content/production/data/',import.meta.url).pathname,handleRequest:async(req,res)=>{if(req.url==='/vendor/browser-resources.json'){res.end(JSON.stringify({...JSON.parse(readFileSync(new URL('../../content/production/resources.json',import.meta.url))),files:[]}));return true;}return false;}});
const b=await P.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});const errors=[];
try{
 const pages=[];for(const name of ['host','observer']){const ctx=await b.createBrowserContext(),p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.evaluateOnNewDocument(name=>{window.qaRejected=[];addEventListener('unhandledrejection',e=>{const r=e.reason;qaRejected.push({type:r?.type,message:r?.message,tag:r?.target?.tagName,src:r?.target?.src});});localStorage.setItem('sp.resources.downloadConsent','1');localStorage.setItem('sp.name',name);sessionStorage.setItem('sp.entered','1');},name);await p.goto(`http://127.0.0.1:${srv.port}/?board=2d`);await p.waitForFunction(()=>window.__SP__?.store.get().connection.status==='online').catch(async e=>{console.log('BOOT',errors,await p.evaluate(()=>document.body.innerText.slice(0,600)));throw e;});pages.push(p);}
 const [host,spec]=pages;const send=(p,t,args={})=>p.evaluate((t,args)=>__SP__.net.request(t,args),t,args);
 await send(host,'room.create',{mode:'coop',difficulty:'FUNNY',spectators:2});const code=await host.evaluate(()=>__SP__.store.get().room.code);await send(spec,'room.spectate',{code});await send(host,'room.start');await host.waitForFunction(()=>__SP__.store.get().match.public?.phase==='INFO_CHECK');await send(host,'g.infoReady',{setupRevision:0});await host.waitForFunction(()=>__SP__.store.get().match.public?.phase==='BAND_DRAFT');await send(host,'g.band',{bandId:'band_bldsk'});await host.waitForFunction(()=>__SP__.store.get().match.public?.phase==='PREP');const badge=await host.evaluate(()=>{const el=document.createElement('div');el.className='dband is-mine';document.body.appendChild(el);const text=getComputedStyle(el,'::after').content;el.remove();return text;});assert.equal(badge,'"선택 완료"');await spec.waitForSelector('.gm');await new Promise(r=>setTimeout(r,200));
 console.log('before',await spec.$eval('.gm',e=>e.dataset.camera));await send(host,'g.ready',{ready:true});await spec.waitForFunction(()=>document.querySelector('.gm')?.dataset.camera==='normal',{timeout:20000});console.log('spectator auto camera',await spec.$eval('.gm',e=>e.dataset.camera));
 // Reproduce a battle frame arriving before its public phase update. The frame
 // identity stays unchanged: automatic phase framing must match selecting it again.
 await spec.evaluate(()=>{const s=__SP__.store.get();window.qaCombatPub=s.match.public;__SP__.store.patch('match',{public:{...s.match.public,phase:'PREP'}});});
 await spec.waitForFunction(()=>__SP__.store.get().match.public.phase==='PREP');
 await spec.evaluate(()=>__SP__.store.patch('match',{public:qaCombatPub}));
 await spec.waitForFunction(()=>document.querySelector('.gm')?.dataset.camera==='normal');
 await new Promise(r=>setTimeout(r,600));
 const autoCamera=await spec.evaluate(()=>__SP_VIEW__.raw.stats().camera);
 const fid=await spec.evaluate(()=>__SP__.store.get().match.field.fieldId);
 await send(spec,'g.watch',{fieldId:fid});
 await new Promise(r=>setTimeout(r,600));
 const manualCamera=await spec.evaluate(()=>__SP_VIEW__.raw.stats().camera);
 for(const key of Object.keys(autoCamera))if(typeof autoCamera[key]==='number')assert.ok(Math.abs(autoCamera[key]-manualCamera[key])<.01,`automatic/manual camera ${key}: ${autoCamera[key]} vs ${manualCamera[key]}`);
 console.log('automatic/manual camera match',autoCamera);

 // Feed an actual single-member cooperative field into the mounted game component.
 await host.evaluate(()=>{const store=__SP__.store,s=store.get(),pid=s.me.playerId;store.patch('match',{public:{...s.match.public,phase:'UNITE',fields:[{fieldId:'qa-unite',kind:'unite',players:[pid],live:true}]},field:{fieldId:'qa-unite',kind:'unite',players:[pid],sides:{[pid]:'L'},stageId:'act2autochess_m01',rect:{r0:9,r1:12,c0:2,c1:18},units:[]}});});
 await host.waitForFunction(()=>document.querySelector('.gm')?.dataset.camera==='unite',{timeout:10000});console.log('lone cooperative',await host.evaluate(()=>({camera:document.querySelector('.gm').dataset.camera,stats:__SP_VIEW__.raw.stats().camera})));await host.waitForFunction(()=>Math.abs(__SP_VIEW__.raw.stats().camera.tx-6)<.01);assert.ok(Math.abs(await host.evaluate(()=>__SP_VIEW__.raw.stats().camera.tx)-6)<.01,'camera converges to the left battlefield, not the whole map');console.log('page errors',errors);for(const p of pages)console.log('rejections',await p.evaluate(()=>qaRejected));assert.deepEqual(errors,[],'no unhandled browser errors');
}finally{await b.close();await srv.close();}

});

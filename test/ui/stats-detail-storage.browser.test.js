import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import puppeteer from 'puppeteer-core';

test('quota-compacted recent matches keep full JSON details across reload, export and clear',{skip:process.env.SP_E2E!=='1'},async()=>{
 const root=resolve('.');
 const server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://test').pathname;
  if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Stats storage</title>');return;}
  const file=resolve(root,path.startsWith('/data/')?'content/production'+path:path.startsWith('/shared/')?'.'+path:'public'+path);
  if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}
  try{res.setHeader('Content-Type','text/javascript');res.end(await readFile(file));}catch{res.writeHead(404).end();}
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
  const page=await browser.newPage();const url=`http://127.0.0.1:${server.address().port}`;await page.goto(url);
  const saved=await page.evaluate(async()=>{
   const s=await import('/js/ui/stats.js');
   const records=Array.from({length:8},(_,i)=>s.normalizeRecord({id:'recent-'+i,t:1000-i,selfId:'p1',end:'settled',players:[{
    playerId:'p1',name:'Doctor',lineup:[{id:'chess_char_5_05_a',items:[]}],bonds:[{bondId:'egirShip',layers:2,active:true}],
    combatRounds:Array.from({length:8},(_,round)=>({round,kind:'normal',units:Array.from({length:100},(_,n)=>({uid:n,defId:'chess_char_5_05_a',name:'Ulpianus',kind:'op',dmg:1000000,physical:1000000}))}))
   }]}));
   const set=Storage.prototype.setItem;
   Storage.prototype.setItem=function(key,value){if(key==='sp.pref.stats'&&value.length>12000)throw new DOMException('quota','QuotaExceededError');return set.call(this,key,value);};
   let success;try{success=s.saveStats({v:s.STATS_VERSION,records});}finally{Storage.prototype.setItem=set;}
   const index=JSON.parse(localStorage.getItem('sp.pref.stats'));
   const full=await s.loadStatsWithDetails();
   return {success,indexCount:index.records.length,indexCompacted:index.records.every(r=>r.compact),full:full.records.length,fullCompacted:full.records.some(r=>r.compact)};
  });
  assert.deepEqual(saved,{success:true,indexCount:8,indexCompacted:true,full:8,fullCompacted:false});
  await page.reload();
  const restored=await page.evaluate(async()=>{
   const s=await import('/js/ui/stats.js');const full=await s.loadStatsWithDetails();
   const transferred=s.importStats(s.exportStats(full),s.emptyStats()).stats;
   return {count:full.records.length,compact:full.records.some(r=>r.compact),rounds:full.records.map(r=>r.players[0].combatRounds.length),units:full.records[7].players[0].combatRounds[7].units.length,replay:!!s.recordToResult(full.records[7]),transfer:transferred.records.every(r=>!r.compact&&r.players[0].combatRounds.length===8)};
  });
  assert.deepEqual(restored,{count:8,compact:false,rounds:Array(8).fill(8),units:100,replay:true,transfer:true});
  await page.evaluate(async()=>{
   const {render,h}=await import('/vendor/preact.module.js');
   const {StatsHost}=await import('/js/screens/stats.js');
   const {statsStore}=await import('/js/ui/statsEntry.js');
   statsStore.set({open:true,tab:'history'});render(h(StatsHost),document.body);
  });
  await page.waitForFunction(()=>document.querySelectorAll('.st-table--history tbody tr.is-clickable').length===8);
  await page.click('.st-table--history tbody tr:last-child');
  await page.waitForSelector('.st--replay');
  await page.evaluate(async()=>{const {render}=await import('/vendor/preact.module.js');render(null,document.body);});
  const cleared=await page.evaluate(async()=>{const s=await import('/js/ui/stats.js');const ok=await s.clearStats();return {ok,count:(await s.loadStatsWithDetails()).records.length};});
  assert.deepEqual(cleared,{ok:true,count:0});await page.reload();
  assert.equal(await page.evaluate(async()=>(await(await import('/js/ui/stats.js')).loadStatsWithDetails()).records.length),0);
  const queuedClear=await page.evaluate(async()=>{
   const a=await import('/js/ui/statsArchive.js');
   const write=a.archiveStatsRecords([{id:'queued',t:1,players:[]}]);const clear=a.clearStatsArchive();await Promise.all([write,clear]);return (await a.readStatsArchive()).length;
  });assert.equal(queuedClear,0,'a pending write cannot resurrect cleared details');
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
});

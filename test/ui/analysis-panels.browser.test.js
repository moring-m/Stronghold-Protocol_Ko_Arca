import {execFileSync} from 'node:child_process';import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync,mkdirSync} from 'node:fs';import {createHash} from 'node:crypto';import {startServer} from '../../server/index.js';
test('analysis panels: fixed settings, disclosure, grouped charts and simple/detailed live views',{skip:process.env.SP_E2E!=='1'},async()=>{
 const fixture=`<!doctype html><html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,">${['theme','components','settings','screens/room','screens/result','screens/game'].map(n=>'<link rel="stylesheet" href="/css/'+n+'.css">').join('')}<style>body{margin:0;padding:20px}#live{position:fixed;left:20px;bottom:20px;width:50px;height:44px}.combat-metrics{right:auto;left:0}</style><div id="app"></div><script type="module">
 import {render} from '/vendor/preact.module.js';import {html} from '/js/ui/components.js';import {data} from '/js/data.js';import {CombatReport} from '/js/ui/combatReport.js';import {CombatMetricsPanel} from '/js/ui/combatMetrics.js';import {CustomExtensionsDialog} from '/js/ui/customExtensions.js';
 await Promise.all(['chess','bonds','items','bands','bosses','stages','config','enemies','assets'].map(k=>data.load(k)));
 const ids=Object.values(data.get('chess')).filter(c=>!c.isGolden&&!c.optionalRecruit).slice(0,12).map(c=>c.chessId);
 const players=['P1','P2'].map((name,j)=>({name,playerId:name,combatRounds:[1,2,3].map(round=>({round,duration:30,kind:'normal',units:ids.map((id,i)=>({uid:i,defId:id,name:data.lookup('chess',id).name,kind:'op',dmg:(i+1)*100*(j+1)*round,physicalDamage:(i+1)*100*(j+1)*round,heal:i*20,kills:1}))}))}));
 window.drawReport=()=>render(html\`<\${CombatReport} players=\${players} myId="P1"/>\`,document.getElementById('app'));
 window.drawSettings=()=>render(html\`<\${CustomExtensionsDialog} open=\${true} room=\${{code:'UI',mode:'coop',difficulty:'NORMAL',customExtensions:{bonds:['ursus','leithanien'],stages:[]}}} isHost=\${true} onClose=\${()=>{}} onSave=\${()=>{}}/>\`,document.getElementById('app'));
 const runner={combatMetrics:()=>({damage:78000,healing:780,layers:78,rows:ids.map((id,i)=>({key:id,defId:id,name:data.lookup('chess',id).name,kind:'op',damage:(i+1)*1000,healing:(i+1)*10,layers:i+1,seconds:10,dps:(i+1)*100,hps:i+1,lps:(i+1)/10,types:{phys:(i+1)*1000,arts:0,true:0,elemental:0}}))})};
 window.drawLive=()=>render(html\`<div id="live"><\${CombatMetricsPanel} myId="P1" runner=\${runner} onClose=\${()=>{}}/></div>\`,document.getElementById('app'));window.drawReport();window.ready=true;
 </script></html>`;
 const s=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:'content/production/data',assetIndex:false,handleRequest(req,res){const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/(assets|fonts)\/~[^/]+\//,'/$1/');if(path==='/fixture'){res.setHeader('Content-Type','text/html');res.setHeader('Content-Security-Policy',"script-src 'self' 'sha256-"+createHash('sha256').update(fixture.match(/<script type="module">([\s\S]*?)<\/script>/)[1]).digest('base64')+"'");res.end(fixture);return true;}if(path.startsWith('/assets/')){const file=['content/production'+path,'/tmp/analysis-panel-assets'+path].find(f=>existsSync(f));if(file){res.setHeader('Content-Type',path.endsWith('.png')?'image/png':'application/octet-stream');res.end(readFileSync(file));return true;}}return false;}});
 const puppeteer=(await import('puppeteer-core')).default,b=await puppeteer.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try{const page=await b.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:1000});await page.goto(s.url+'/fixture');await page.waitForFunction(()=>window.ready);mkdirSync('/tmp/analysis-panels',{recursive:true});
 await page.waitForSelector('.combat-chart__row');assert.equal(await page.$$('.combat-chart__row').then(x=>x.length),8);
 await page.select('[aria-label="통계 병합 기준"]','profession');await page.waitForFunction(()=>document.querySelectorAll('.combat-chart__row').length<8);
 await page.select('[aria-label="통계 그래프 종류"]','share');await page.waitForSelector('.combat-share__ring');await page.screenshot({path:'/tmp/analysis-panels/report-simple.png'});
 await page.$$eval('[aria-label="통계 상세도"] button',es=>es[1].click());await page.waitForSelector('[aria-label="추가 그래프 항목"]');assert.equal(await page.$$('.combat-chart').then(x=>x.length),2);
 await page.select('[aria-label="통계 그래프 종류"]','trend');await page.waitForSelector('.combat-trend polyline');assert.equal(await page.$$('.combat-trend circle').then(x=>x.length),6);await page.screenshot({path:'/tmp/analysis-panels/report-detailed.png'});
 await page.select('[aria-label="통계 그래프 종류"]','table');await page.waitForSelector('.combat-report table');assert.equal(await page.$$('.combat-report thead th').then(x=>x.length),20);
 await page.evaluate(()=>window.drawSettings());await page.waitForSelector('#ext-tab-rules');await page.click('#ext-tab-rules');await page.waitForSelector('.extension-grid--rules .custom-ext__card');
 const heights=await page.$$eval('.extension-grid--rules .custom-ext__card',es=>es.map(e=>e.getBoundingClientRect().height));assert.ok(heights.every(h=>Math.abs(h-112)<1),heights.join(','));
 assert.equal(await page.$('.extension-description-toggle'),null);assert.ok(await page.$eval('.extension-grid--rules .extension-description small',e=>getComputedStyle(e).display!=='none'&&e.getBoundingClientRect().height>0));await page.screenshot({path:'/tmp/analysis-panels/settings.png'});
 await page.click('#ext-tab-bossStats');await page.waitForSelector('.extension-rule-value');assert.equal(await page.$eval('.extension-rule-value',e=>e.getBoundingClientRect().height),112);
 await page.setViewport({width:390,height:844});await page.screenshot({path:'/tmp/analysis-panels/settings-mobile.png'});
 assert.ok(await page.$eval('.custom-ext',e=>e.scrollWidth<=e.clientWidth+1));
 await page.evaluate(()=>window.drawLive());await page.waitForSelector('.combat-metrics__row');assert.equal(await page.$$('.combat-metrics__row').then(x=>x.length),8);
 await page.$$eval('[aria-label="실시간 통계 상세도"] button',es=>es[1].click());await page.waitForFunction(()=>document.querySelectorAll('.combat-metrics__row').length===12);
 await page.select('[aria-label="실시간 통계 병합 기준"]','kind');await page.waitForFunction(()=>document.querySelectorAll('.combat-metrics__row').length===1);await page.select('[aria-label="실시간 통계 항목"]','healing');assert.ok(await page.$eval('.combat-metrics__row',e=>{const r=e.getBoundingClientRect();return r.height>20&&r.top>=0&&r.bottom<=innerHeight;}));await page.screenshot({path:'/tmp/analysis-panels/live-mobile.png'});
 await page.evaluate(()=>window.drawReport());await page.waitForSelector('.combat-report');assert.ok(await page.$eval('.combat-report',e=>e.scrollWidth<=e.clientWidth+1));await page.screenshot({path:'/tmp/analysis-panels/report-mobile.png'});assert.deepEqual(errors,[]);
 if(process.env.SP_COMPARE_SCREENSHOTS){
  const root='docs/ui-analysis-2026-10-20';
  const oldPaths=['public/js/ui/customExtensions.js','public/js/ui/combatMetrics.js','public/js/ui/combatReport.js','public/css/settings.css','public/css/screens/game.css','public/css/screens/result.css','public/css/screens/stats.css'];
  const old=new Map(oldPaths.map(path=>['/'+path.slice(7),execFileSync('git',['show','HEAD:'+path])]));
  for(const phase of ['before','after']){
   mkdirSync(root+'/'+phase,{recursive:true});const context=await b.createBrowserContext(),capture=await context.newPage();
   try{
    if(phase==='before'){await capture.setRequestInterception(true);capture.on('request',r=>{const key=new URL(r.url()).pathname,body=old.get(key);if(body)r.respond({status:200,contentType:key.endsWith('.css')?'text/css':'text/javascript',body});else r.continue();});}
    await capture.setViewport({width:1440,height:1000});await capture.goto(s.url+'/fixture');await capture.waitForFunction(()=>window.ready);await capture.waitForSelector('.combat-chart__row');
    const shot=async name=>{if(name.startsWith('report')||name.startsWith('live'))await capture.$$eval('.uthumb img',es=>es.forEach(i=>i.loading='eager'));if(name.startsWith('report')||name.startsWith('live'))await capture.waitForFunction(()=>[...document.querySelectorAll('.uthumb img')].every(i=>i.complete&&i.naturalWidth>0));await capture.evaluate(()=>document.activeElement?.blur());await capture.screenshot({path:root+'/'+phase+'/'+name+'.png'});};
    await shot('report-pc');
    if(phase==='after'){await capture.$$eval('[aria-label="통계 상세도"] button',es=>es[1].click());await capture.select('[aria-label="통계 그래프 종류"]','trend');await capture.waitForSelector('.combat-trend');await shot('report-detailed-pc');await capture.select('[aria-label="통계 그래프 종류"]','share');await capture.waitForSelector('.combat-share');await shot('report-share-pc');}
    await capture.evaluate(()=>window.drawSettings());await capture.waitForSelector('#ext-tab-rules');await capture.click('#ext-tab-rules');await capture.waitForSelector('.extension-grid--rules .custom-ext__card');await shot('settings-pc');
    await capture.setViewport({width:390,height:844});await shot('settings-mobile');
    await capture.evaluate(()=>window.drawLive());await capture.waitForSelector('.combat-metrics__row');await shot('live-mobile');
    await capture.setViewport({width:1440,height:1000});await shot('live-pc');
    await capture.evaluate(()=>window.drawReport());await capture.waitForSelector('.combat-report');await capture.setViewport({width:390,height:844});await shot('report-mobile');
   }finally{await context.close();}
  }
 }
 }finally{await b.close();await s.close();}
});

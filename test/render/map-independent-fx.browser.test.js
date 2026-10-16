import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {startServer} from '../../server/index.js';
const chrome=process.env.CHROME_PATH||'/usr/bin/chromium';
test('official effects follow their own setting with a minimal 2D map',{skip:process.env.RENDER_E2E!=='1'||!existsSync(chrome),timeout:60000},async()=>{
 const fixture=`<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><div id="field" style="width:800px;height:500px"></div><script type="module">
 import {createFieldView} from '/js/render/app.js';import {data} from '/js/data.js';import {assets} from '/js/assets.js';
 try{localStorage.setItem('sp.resources.officialFxReady','1');await data.loadAll('chess','tokens','items','enemies','stages','bonds','config');await assets.ready();window.view=await createFieldView(document.getElementById('field'),{data,assets,settings:{mapQuality:'minimal',officialFx:'full'}});window.ready=true;}catch(e){window.fixtureError=e.stack;}</script>`;
 const script=fixture.split('<script type="module">')[1].split('</script>')[0];
 const pageHtml=fixture.replace(/<script type="module">[\s\S]*?<\/script>/,'<script type="module" src="/fx-map-test.js"></script>');
 const s=await startServer({port:0,host:'127.0.0.1',quiet:true,dataDir:new URL('../../content/production/data',import.meta.url).pathname,handleRequest:(req,res)=>{if(req.url==='/fx-map-test'){res.setHeader('Content-Type','text/html');res.end(pageHtml);return true;}if(req.url==='/fx-map-test.js'){res.setHeader('Content-Type','text/javascript');res.end(script);return true;}return false;}});
 const P=(await import('puppeteer-core')).default,b=await P.launch({executablePath:chrome,headless:true,args:['--no-sandbox']});
 try{const p=await b.newPage();await p.goto(`http://127.0.0.1:${s.port}/fx-map-test`);await p.waitForFunction(()=>window.ready||window.fixtureError);assert.equal(await p.evaluate(()=>window.fixtureError),undefined);
 await p.waitForFunction(()=>view.debug.ofx.active);assert.equal(await p.evaluate(()=>view.debug.board3d),null);
 await p.evaluate(()=>view.setSettings({officialFx:'off'}));assert.equal(await p.evaluate(()=>view.debug.ofx.active),false);
 await p.evaluate(()=>view.setSettings({officialFx:'full',effectsQuality:'low'}));await p.waitForFunction(()=>view.debug.ofx.active);
 assert.equal(await p.evaluate(()=>view.debug.ofx.tier),'full');assert.equal(await p.evaluate(()=>view.debug.fx.maxParticles),360);
 await p.evaluate(()=>view.setSettings({officialFx:'lite'}));assert.equal(await p.evaluate(()=>view.debug.ofx.active),false);
 await p.evaluate(()=>view.destroy());
 }finally{await b.close();await s.close();}
});

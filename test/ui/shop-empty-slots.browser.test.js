import {test} from 'node:test';import assert from 'node:assert/strict';
import {CHROME,hasChrome} from '../e2e/client.mjs';
test('actual shop UI separates empty equipment from operators and hides locked equipment slots',{
 skip:process.env.SP_E2E!=='1'||!hasChrome(),timeout:30000,
},async t=>{
 const {startServer}=await import('../../server/index.js');const {default:puppeteer}=await import('puppeteer-core');
 const server=await startServer({port:0,host:'127.0.0.1',quiet:true,assetIndex:false});t.after(()=>server.close());
 const browser=await puppeteer.launch({executablePath:CHROME,args:['--no-sandbox']});t.after(()=>browser.close());
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setRequestInterception(true);
 page.on('request',r=>new URL(r.url()).pathname==='/test-shop'?r.respond({status:200,contentType:'text/html',body:`<!doctype html><div id="app"></div><script type="module">
 import {h,render} from '/vendor/preact.module.js';import {ShopBar} from '/js/ui/shopBar.js';
 window.draw=(layout)=>render(h(ShopBar,{priv:{playerId:'test',funds:100,deployCount:0,deployCap:8,shop:{level:1,slots:layout?.item===0?[null]:[null,null],layout,refreshPrice:2}},editable:true}),document.getElementById('app'));
 draw({chess:1,item:1});window.ready=true;
 </script>`}):r.continue());
 await page.goto(`http://127.0.0.1:${server.port}/test-shop`);await page.waitForFunction(()=>window.ready,{timeout:15000});
 const counts=()=>page.evaluate(()=>({cards:document.querySelector('.shopbar__cards')?.children.length,items:document.querySelector('.shopbar__item')?.children.length,itemText:document.querySelector('.shopbar__item')?.textContent}));
 const first=await counts();assert.equal(first.cards,1);assert.equal(first.items,1);assert.ok(!first.itemText.includes('已购买'));
 await page.evaluate(()=>window.draw({chess:1,item:0}));assert.equal((await counts()).items,0);
 await page.evaluate(()=>window.draw({chess:1,item:1}));assert.equal((await counts()).items,1);
 assert.deepEqual(errors,[]);
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {startServer} from '../../server/index.js';
import puppeteer from 'puppeteer-core';
test('failed shop image reappears when its download completes without reopening the shop', {timeout:30000}, async()=>{
 const origin=await startServer({port:0,host:'127.0.0.1',quiet:true});let available=false,requests=0;
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWZkAAAAASUVORK5CYII=','base64');
 const server=http.createServer(async(req,res)=>{if(req.url==='/image-test'){res.setHeader('Content-Type','text/html');res.end(`<div id="root"></div><script type="module">import {h,render} from '/vendor/preact.module.js';import {Img} from '/js/ui/gameComponents.js';render(h(Img,{src:'/assets/recovery.png',fallback:h('span',{id:'fallback'},'missing')}),document.getElementById('root'));</script>`);}else if(req.url==='/assets/recovery.png'){requests++;res.setHeader('Cache-Control','no-store');if(!available)res.writeHead(503).end();else {res.setHeader('Content-Type','image/png');res.end(png);}}else{try{const r=await fetch(`http://127.0.0.1:${origin.port}${req.url}`);res.writeHead(r.status,Object.fromEntries([...r.headers].filter(([k])=>!['content-length','content-encoding','transfer-encoding'].includes(k))));res.end(Buffer.from(await r.arrayBuffer()));}catch{res.writeHead(500).end();}}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await puppeteer.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
 try{const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/image-test`);await page.waitForSelector('#fallback');assert.equal(requests,1);await page.evaluate(()=>window.dispatchEvent(new CustomEvent('resource-ready',{detail:{path:'/assets/other.png'}})));assert.equal(requests,1);available=true;await page.evaluate(()=>window.dispatchEvent(new CustomEvent('resource-ready',{detail:{path:'/assets/recovery.png'}})));await page.waitForFunction(()=>document.querySelector('#root img')?.naturalWidth===1);assert.equal(await page.$('#fallback'),null);assert.equal(requests,2);}finally{await browser.close();await new Promise(r=>server.close(r));await origin.close();}
});

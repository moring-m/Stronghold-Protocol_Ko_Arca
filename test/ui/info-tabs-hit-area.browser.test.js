import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {startServer} from '../../server/index.js';
const chrome=process.env.CHROME_PATH||'/usr/bin/chromium';
test('game information tabs remain clickable along their lower edge above the unit HUD',{skip:process.env.SP_E2E!=='1'||!existsSync(chrome)},async()=>{
 const fixture=`<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/css/components.css"><link rel="stylesheet" href="/css/screens/game.css"><link rel="stylesheet" href="/css/screens/game-panels.css"><style>html{font-size:100px}.gm{width:100vw;height:100vh}</style><div id="app"></div><script type="module">
 import{render}from'/vendor/preact.module.js';import{useState}from'/vendor/hooks.module.js';import{html}from'/js/ui/components.js';import{EnemyDrawer}from'/js/ui/enemyDrawer.js';
 window.closedCount=0;function Fixture(){const[tab,setTab]=useState('custom');const[open,setOpen]=useState(true);const pub={customExtensions:{rules:['augments'],ruleValues:{}},augments:{selectedEnemies:[]},players:[]};return html\`<div class="gm"><div class="gm__hud"><div class="uframe" style="left:65%;top:160px;width:240px;height:100px;pointer-events:auto">unit HUD</div>\${open&&html\`<\${EnemyDrawer} tab=\${tab} onTab=\${setTab} pub=\${pub} onClose=\${()=>{window.closedCount++;setOpen(false)}}/>\`}</div></div>\`; }render(html\`<\${Fixture}/ >\`,document.getElementById('app'));
 </script>`;
 const s=await startServer({port:0,host:'127.0.0.1',quiet:true,assetIndex:false,handleRequest:(req,res)=>{if(req.url==='/fixture'){res.setHeader('Content-Type','text/html');res.end(fixture);return true;}return false;}});
 const puppeteer=(await import('puppeteer-core')).default;const browser=await puppeteer.launch({executablePath:chrome,args:['--no-sandbox','--disable-dev-shm-usage'],headless:true});
 try{const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.setViewport({width:1440,height:900});await page.goto(s.url+'/fixture');await page.waitForSelector('.edrawer .tabs__tab');
 for(const label of ['적 증강','커스텀 설정']){const point=await page.evaluate(label=>{const b=[...document.querySelectorAll('.edrawer .tabs__tab')].find(b=>b.textContent===label);const r=b.getBoundingClientRect();return{x:r.x+r.width/2,y:r.bottom-2};},label);await page.mouse.click(point.x,point.y);assert.equal(await page.evaluate(()=>window.closedCount),0);assert.equal(await page.$eval('.tabs__tab.is-active',b=>b.textContent),label);}assert.deepEqual(errors,[]);
 }finally{await browser.close();await s.close();}
});

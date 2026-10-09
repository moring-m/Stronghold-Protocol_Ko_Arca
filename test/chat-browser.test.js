import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';

const chrome = process.env.CHROME_PATH || '/usr/bin/chromium';
test('two browsers chat over real game sockets: toggle, unread, safe text, Korean composition and reconnect',
  { skip: !existsSync(chrome), timeout: 60000 }, async () => {
    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'stronghold-chat-'));
    const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
    for (const name of ['js', 'vendor', 'css', 'assets', 'audio']) await symlink(path.join(publicDir, name), path.join(fixtureDir, name), process.platform === 'win32' ? 'junction' : 'dir');
    const server = await startServer({ port: 0, host: '127.0.0.1', quiet: true, publicDir: fixtureDir });
    const puppeteer = (await import('puppeteer-core')).default;
    let browser;
    const fixture = `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/css/screens/game.css"><link rel="stylesheet" href="/css/emotes.css"><link rel="stylesheet" href="/css/chat.css"><style>html{font-size:100px}</style><div id="app"></div>
      <script type="module">
      import {useState} from '/vendor/hooks.module.js';
      import {render} from '/vendor/preact.module.js';
      import {html} from '/js/ui/components.js';
      import {EmoteWheel} from '/js/ui/emotes.js';
      import {ChatPanel} from '/js/ui/chat.js';
      import {store} from '/js/store.js';
      import {net} from '/js/net.js';
      let rid=0, socket, token, pending=new Map();
      const name=new URL(location.href).searchParams.get('name');
      window.request=(t,fields={})=>new Promise((resolve,reject)=>{const id=++rid;pending.set(id,{resolve,reject});socket.send(JSON.stringify({t,rid:id,...fields}));});
      net.request=window.request;
      window.connect=()=>{
        socket=new WebSocket('ws://'+location.host+'/ws');
        socket.onopen=()=>window.request('hello',{name,version:1,...(token?{token}:{})});
        socket.onclose=()=>store.patch('connection',{status:'offline'});
        socket.onmessage=e=>{const m=JSON.parse(e.data);
          if(m.t==='welcome'){token=m.token;store.set({me:{playerId:m.playerId,name:m.name},connection:{status:'online'}});window.ready=true;}
          if(m.t==='m.emote')window.lastEmote=m;
          if(m.t==='room.state')window.room=m;
          if(m.t==='m.result')store.patch('match',{result:m});
          if(m.t==='m.public'){window.phase=m.phase;store.patch('match',{public:m});}
          if(m.t==='m.chat')store.set(s=>({chat:[...s.chat,m].slice(-100),chatFaction:m.playerId===s.me.playerId?m.faction??null:s.chatFaction}));
          if(m.t==='m.chatHistory')store.set({chat:m.messages,chatFaction:m.faction??null});
          if(m.rid && pending.has(m.rid)){const p=pending.get(m.rid);pending.delete(m.rid);m.t==='error'?p.reject(new Error(m.code)):p.resolve(m);}
        };
      };
      window.reconnect=()=>new Promise(resolve=>{socket.onclose=()=>{window.ready=false;window.connect();resolve();};socket.close();});
      function Fixture(){const [emoteOpen,setEmoteOpen]=useState(false);return html\`<div class="screen gm"><div class="gm__hud"><div class="gm__corner"><\${ChatPanel} /><\${EmoteWheel} open=\${emoteOpen} onToggle=\${setEmoteOpen} onSend=\${id=>window.request('g.emote',{id})} /></div></div></div>\`;}
      window.store=store;window.connect();render(html\`<\${Fixture} />\`,document.getElementById('app'));
      </script>`;
    try {
      await writeFile(path.join(fixtureDir, 'chat-test.html'), fixture);
      browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ['--no-sandbox'] });
      const players = [];
      for (const name of ['Host', 'Guest']) {
        const page = await browser.newPage();
        page.on('pageerror', (error) => console.error(error.message));
        page.on('console', (msg) => { if (msg.type() === 'error') console.error(msg.text()); });
        await page.setViewport({ width: 1280, height: 720 });
        await page.goto(`http://127.0.0.1:${server.port}/chat-test.html?name=${name}`);
        await page.waitForFunction(() => window.ready, { polling: 100, timeout: 10000 });
        players.push(page);
      }
      const [host, guest] = players;
      await host.evaluate(() => window.request('room.create', { mode: 'coop', difficulty: 'NORMAL' }));
      const code = await host.evaluate(() => window.room.code);
      await guest.evaluate((code) => window.request('room.join', { code }), code);
      await guest.evaluate(() => window.request('room.ready', { ready: true }));
      await host.evaluate(() => window.request('room.start'));
      for (const page of players) await page.waitForFunction(() => window.phase === 'INFO_CHECK', { polling: 100 });
      assert.equal(await host.$('.game-chat__panel'), null);
      await host.bringToFront();
      await host.keyboard.press('Enter');
      await host.waitForSelector('.game-chat__panel');
      assert.equal(await host.$eval('.game-chat input',el=>el===document.activeElement),true,'Enter opens and focuses chat');
      await host.type('.game-chat input', '안녕하세요!');
      assert.equal(await host.$eval('.game-chat input',el=>el.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',repeat:true,bubbles:true,cancelable:true}))),false,'holding Enter never submits another chat message');
      await host.keyboard.press('Enter');
      await guest.bringToFront();
      await guest.waitForSelector('.game-chat__badge');
      await guest.click('.game-chat__toggle');
      await guest.waitForFunction(() => document.querySelector('.game-chat__messages').textContent.includes('안녕하세요!'), { polling: 100 });
      assert.equal(await guest.$('.game-chat__badge'), null);
      assert.match(await guest.$eval('.game-chat__messages', el => el.textContent), /Host/);
      await guest.type('.game-chat input', '<img src=x onerror=alert(1)>');
      await guest.keyboard.press('Enter');
      await host.waitForFunction(() => document.querySelector('.game-chat__messages').textContent.includes('<img'), { polling: 100 });
      assert.equal(await host.$('.game-chat__messages img'), null);
      await host.bringToFront();
      await new Promise(resolve => setTimeout(resolve, 1100));
      await host.evaluate(() => {
        const input=document.querySelector('.game-chat input');
        input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles:true }));
        input.value='한글 조합';input.dispatchEvent(new Event('input', { bubbles:true }));
        input.dispatchEvent(new KeyboardEvent('keydown', { key:'Enter', isComposing:true, bubbles:true, cancelable:true }));
        document.querySelector('.game-chat form').dispatchEvent(new Event('submit', { bubbles:true, cancelable:true }));
      });
      assert.equal(await host.evaluate(() => window.store.get().chat.length), 2, 'composition Enter must not send');
      await host.evaluate(() => document.querySelector('.game-chat input').dispatchEvent(new CompositionEvent('compositionend', { bubbles:true })));
      await host.keyboard.press('Enter');
      await guest.waitForFunction(() => window.store.get().chat.length === 3, { polling: 100 });
      await host.bringToFront();
      await host.click('.ewheel__btn');
      await host.waitForSelector('.ewheel__item');
      await host.click('.ewheel__item');
      await guest.waitForFunction(()=>window.lastEmote, {polling:100});
      assert.ok(await host.$('.game-chat__panel'), 'sending an emote leaves chat open');
      await guest.bringToFront();
      await guest.keyboard.press('Escape');
      assert.equal(await guest.$('.game-chat__panel'), null);
      assert.equal(await guest.$$eval('.game-chat__preview p', els=>els.length),3);
      assert.deepEqual(await guest.$$eval('.game-chat__preview p', els=>els.map(el=>getComputedStyle(el).opacity)),['0.25','0.6','1']);
      await guest.click('.game-chat__toggle');
      await guest.click('.game-chat__visibility');
      assert.equal(await guest.$('.game-chat__panel'),null,'full hide closes the panel');
      assert.equal(await guest.$('.game-chat__preview'),null,'full hide also suppresses recent messages');
      assert.ok(await guest.$('.game-chat__toggle'),'chat button remains');
      await guest.click('.game-chat__toggle');
      assert.equal(await guest.$eval('.game-chat__visibility',el=>el.getAttribute('aria-pressed')),'true');
      await guest.click('.game-chat__visibility');
      await guest.keyboard.press('Escape');
      assert.equal(await guest.$$eval('.game-chat__preview p',els=>els.length),3,'preview can be restored');
      await guest.evaluate(async () => { window.store.set({ chat: [] }); await window.reconnect(); });
      await guest.waitForFunction(() => window.store.get().chat.length === 3, { polling: 100 });
      await guest.click('.game-chat__toggle');
      await guest.evaluate(() => {
        window.savedChat=window.store.get().chat;
        const sample=window.savedChat[0];
        window.store.set({chat:Array.from({length:40},(_,i)=>({...sample,id:'scroll-'+i,text:'이전 메시지 '+i}))});
      });
      await guest.waitForFunction(()=>document.querySelectorAll('.game-chat__messages p').length===40);
      await guest.$eval('.game-chat__messages',el=>{el.scrollTop=0;el.dispatchEvent(new Event('scroll'));});
      await guest.evaluate(()=>window.store.set(s=>({chat:[...s.chat,{...s.chat[0],id:'new-scroll',text:'새 메시지'}]})));
      await guest.waitForFunction(()=>document.querySelectorAll('.game-chat__messages p').length===41);
      assert.equal(await guest.$eval('.game-chat__messages',el=>el.scrollTop),0,'reading history does not jump');
      await guest.$eval('.game-chat__messages',el=>{el.scrollTop=el.scrollHeight;el.dispatchEvent(new Event('scroll'));});
      await guest.evaluate(()=>window.store.set(s=>({chat:[...s.chat,{...s.chat[0],id:'new-scroll-2',text:'다음 메시지'}]})));
      await guest.waitForFunction(()=>{const el=document.querySelector('.game-chat__messages');return el.scrollHeight-el.clientHeight-el.scrollTop<2;});
      await guest.evaluate(()=>window.store.set({chat:window.savedChat}));
      const bounds = await guest.$eval('.game-chat__panel', el => { const r=el.getBoundingClientRect();return {width:r.width,left:r.left,right:r.right,bottom:r.bottom}; });
      assert.ok(bounds.width === 360 && bounds.left >= 0 && bounds.right <= 1280 && bounds.bottom <= 720);
      await guest.setViewport({ width: 390, height: 640 });
      const mobile = await guest.$eval('.game-chat__panel', el => ({ width:el.getBoundingClientRect().width,right:el.getBoundingClientRect().right }));
      assert.ok(mobile.width <= 366 && mobile.right <= 390);
      const toggle = await guest.$eval('.game-chat__toggle', el => {const r=el.getBoundingClientRect();return {left:r.left,bottom:innerHeight-r.bottom,width:r.width,height:r.height,text:el.textContent.trim(),icon:!!el.querySelector('svg')};});
      assert.equal(toggle.left, toggle.bottom);
      assert.ok(toggle.width >= 34); assert.equal(toggle.width, toggle.height);
      assert.equal(await guest.$eval('.game-chat__toggle', el=>getComputedStyle(el).borderRadius), '0px');
      assert.equal(toggle.text, ''); assert.ok(toggle.icon);
      await host.bringToFront();
      await host.click('.game-chat__faction-toggle');
      assert.equal(await host.$$eval('.game-chat__factions button', els => els.length), 8);
      await host.click('.game-chat__factions button');
      await guest.waitForFunction(() => window.store.get().chat.at(-1)?.text === '진영 선택: 염국', {polling:100});
      assert.equal(await guest.$eval('.game-chat__messages p:last-child .game-chat__faction', el=>el.textContent), '(염국)');
      assert.equal(await guest.$eval('.game-chat__messages p:last-child .game-chat__faction', el=>getComputedStyle(el).color), 'rgb(255, 59, 66)');
      await host.waitForFunction(()=>!document.querySelector('.game-chat__faction-toggle').disabled, {polling:100});
      await new Promise(resolve=>setTimeout(resolve,1100));
      await host.type('.game-chat input', '선택 후 메시지');
      await host.keyboard.press('Enter');
      await guest.waitForFunction(() => window.store.get().chat.at(-1)?.text === '선택 후 메시지', {polling:100});
      assert.equal(await guest.evaluate(()=>window.store.get().chat.at(-1).faction), '염국');
      await host.waitForFunction(()=>!document.querySelector('.game-chat__faction-toggle').disabled && document.querySelector('.game-chat input').value==='', {polling:100});
      await host.evaluate(async()=>{window.store.set({chatFaction:null});await window.reconnect();});
      await host.waitForFunction(()=>window.store.get().chatFaction==='염국', {polling:100});
      await host.waitForFunction(()=>document.querySelector('.game-chat__faction-toggle').textContent==='염국', {polling:100});
      await host.click('.game-chat__faction-toggle');
      await host.screenshot({path:path.join(tmpdir(), 'stronghold-chat-factions.png')});
      await new Promise(resolve=>setTimeout(resolve,1100));
      await host.click('.game-chat__faction-clear');
      await host.waitForFunction(()=>window.store.get().chatFaction===null);
      await host.waitForFunction(()=>document.querySelector('.game-chat__faction-toggle').textContent==='진영 선택');
      await guest.waitForFunction(()=>window.store.get().chat.at(-1)?.text==='진영 선택 취소');
      assert.equal(await guest.$('.game-chat__messages p:last-child .game-chat__faction'),null,'clear removes faction from subsequent messages');
      const room=server.lobby.rooms.get(code);
      room.match.finish({victory:true,reason:'victory'});
      await host.waitForFunction(()=>window.store.get().match.result, {polling:100});
      await new Promise(resolve=>setTimeout(resolve,1100));
      await host.bringToFront();
      await host.focus('.game-chat input');
      await host.keyboard.down('Control');
      await host.keyboard.press('A');
      await host.keyboard.up('Control');
      await host.keyboard.press('Backspace');
      await host.type('.game-chat input', '결과창에서도 대화');
      await host.keyboard.press('Enter');
      await guest.waitForFunction(()=>window.store.get().chat.at(-1)?.text==='결과창에서도 대화', {polling:100,timeout:5000});
      await host.evaluate(() => window.store.set(s=>({chat:[...s.chat,{id:999,playerId:'viewer',name:'Viewer',text:'관전자 메시지',spectator:true}]})));
      await host.waitForSelector('.game-chat__messages .game-chat__spectator');
      assert.equal(await host.$eval('.game-chat__messages .game-chat__spectator', el=>el.textContent),'(관전자)');
      assert.equal(await host.$eval('.game-chat__messages .game-chat__spectator', el=>getComputedStyle(el).color),'rgb(146, 155, 151)');
      await host.click('.game-chat__close');
      await host.waitForSelector('.game-chat__preview .game-chat__spectator');
      assert.equal(await host.$eval('.game-chat__preview .game-chat__spectator', el=>getComputedStyle(el).color),'rgb(146, 155, 151)');
      await host.evaluate(() => window.request('room.leave'));
      await guest.evaluate(() => window.request('room.leave'));
    } finally { if (browser) await browser.close(); await server.close(); await rm(fixtureDir, { recursive: true, force: true }); }
  });

test('opening chat and restart controls does not move the corner buttons',
  {skip:!existsSync(chrome),timeout:30000},async()=>{
    const dir=await mkdtemp(path.join(tmpdir(),'stronghold-chat-corner-'));
    const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
    for(const name of ['js','vendor','css','assets','audio'])await symlink(path.join(publicDir,name),path.join(dir,name));
    await writeFile(path.join(dir,'corner.html'),`<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/css/screens/game.css"><link rel="stylesheet" href="/css/chat.css"><style>html{font-size:100px}</style><div id="app"></div><script type="module">
      import {render} from '/vendor/preact.module.js';import {html} from '/js/ui/components.js';import {ChatPanel} from '/js/ui/chat.js';import {store,emptyMatch} from '/js/store.js';
      store.set({me:{playerId:'self'},connection:{status:'online'},room:{code:'fixture',matchNo:1,inMatch:true,seats:[{playerId:'self'}]},match:{...emptyMatch(),public:{phase:'PREP'}}});
      window.store=store;render(html\`<div class="gm__corner"><\${ChatPanel}/><button class="gm__gear" id="next">⚙</button></div>\`,document.getElementById('app'));window.ready=true;
    </script>`);
    const server=await startServer({port:0,host:'127.0.0.1',quiet:true,publicDir:dir});let browser;
    try{
      const P=(await import('puppeteer-core')).default;browser=await P.launch({executablePath:chrome,args:['--no-sandbox']});const page=await browser.newPage();
      await page.goto(`http://127.0.0.1:${server.port}/corner.html`);await page.waitForFunction(()=>window.ready);
      const position=()=>page.$eval('#next',e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y};});
      for(const width of [1280,390]){
        await page.setViewport({width,height:720});const closed=await position();await page.click('.game-chat__toggle');await page.waitForSelector('.game-chat__panel > .restart-controls > button');
        assert.deepEqual(await position(),closed,'opening chat with an eligible restart request must preserve the toolbar');
        assert.equal(await page.$eval('.game-chat__panel > .restart-controls',e=>{const p=e.parentElement.getBoundingClientRect(),r=e.getBoundingClientRect();return r.left>=p.left&&r.right<=p.right;}),true,'restart request stays inside chat');
        await page.evaluate(()=>store.set({restartOutcome:'failed'}));await page.click('.game-chat__toggle');await page.waitForSelector('.game-chat > .restart-controls small');
        assert.deepEqual(await position(),closed,'restart outcome does not add a blank button slot');
      }
    }finally{await browser?.close();await server.close();await rm(dir,{recursive:true,force:true});}
  });

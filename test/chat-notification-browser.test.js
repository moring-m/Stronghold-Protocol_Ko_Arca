import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdtemp, writeFile, symlink, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startServer } from '../server/index.js';
import { CHAT_NOTIFICATION_SOUNDS } from '../public/js/chatNotificationSounds.js';

const chrome = process.env.CHROME_PATH || '/usr/bin/chromium';
test('all chat sounds decode; settings persist; live chat sounds in expanded game chat and waiting room',
  {skip: process.env.SP_E2E !== '1' || !existsSync(chrome), timeout: 30000}, async () => {
    const fixtureDir = await mkdtemp(path.join(tmpdir(), 'stronghold-notifications-'));
    const publicDir = fileURLToPath(new URL('../public/', import.meta.url));
    for (const name of ['js', 'vendor', 'css', 'assets', 'audio', 'i18n'])
      await symlink(path.join(publicDir, name), path.join(fixtureDir, name), process.platform === 'win32' ? 'junction' : 'dir');
    const fixture = `<!doctype html><meta charset="utf-8"><link rel="icon" href="data:,"><link rel="stylesheet" href="/css/theme.css"><link rel="stylesheet" href="/css/components.css"><link rel="stylesheet" href="/css/screens/game.css"><link rel="stylesheet" href="/css/chat.css"><style>html{font-size:100px}</style><div id="app"></div>
      <script type="module">
      import {render} from '/vendor/preact.module.js';
      import {useState} from '/vendor/hooks.module.js';
      import {html} from '/js/ui/components.js';
      import {ChatPanel} from '/js/ui/chat.js';
      import {SettingsModal,settingsStore,updateSettings} from '/js/ui/settings.js';
      import {audio} from '/js/audio.js';
      import {net} from '/js/net.js';
      import {store} from '/js/store.js';
      store.set({me:{playerId:'self'},connection:{status:'online'}});
      audio.install();window.audio=audio;window.net=net;window.updateSettings=updateSettings;window.settingsStore=settingsStore;
      function Fixture(){const [open,setOpen]=useState(true);return html\`<\${SettingsModal} open=\${open} onClose=\${()=>setOpen(false)} /><\${ChatPanel} room=\${new URL(location.href).searchParams.has('room')} />\`;}
      render(html\`<\${Fixture} />\`,document.getElementById('app'));
      window.ready=true;
      </script>`;
    await writeFile(path.join(fixtureDir, 'notifications.html'), fixture);
    const server = await startServer({port: 0, host: '127.0.0.1', quiet: true, publicDir: fixtureDir});
    let browser;
    try {
      browser = await (await import('puppeteer-core')).default.launch({executablePath: chrome, headless: true, args: ['--no-sandbox']});
      const page = await browser.newPage();
      page.setDefaultTimeout(5000);
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.setViewport({width: 1280, height: 1000});
      await page.goto(`http://127.0.0.1:${server.port}/notifications.html`);
      await page.waitForSelector('#chat-notification-sound');
      assert.equal(await page.$eval('#chat-notification-cooldown', el => el.step), '1');
      assert.equal(await page.$eval('#chat-notification-cooldown', el => el.max), '5');
      assert.equal(await page.$$eval('#chat-notification-sound option', els => els.length), CHAT_NOTIFICATION_SOUNDS.length + 1);
      await page.click('.set-chat-preview');
      await page.waitForFunction(() => window.audio.chatNode);
      const clips = [
        {id: 'emote', path: '/audio/chat-notification/emote.mp3', durationSeconds: .527},
        ...JSON.parse(await readFile(path.join(publicDir, 'audio/chat-notification/processing.json'), 'utf8')).clips,
        ...JSON.parse(await readFile(path.join(publicDir, 'audio/chat-notification/general-processing.json'), 'utf8')).files,
      ];
      for (const clip of clips) {
        const duration = await page.evaluate(async url => (await window.audio._buffer(url))?.duration, clip.path);
        assert.ok(Math.abs(duration - clip.durationSeconds) < .04, `${clip.id} decodes to its trimmed length`);
      }
      assert.equal(await page.$eval('#chat-faction-notifications', el => el.getAttribute('aria-checked')), 'false');
      await page.click('#chat-faction-notifications');
      await page.select('#chat-notification-sound', 'ceobe-dadada');
      assert.equal(await page.evaluate(() => window.settingsStore.get().chatSound), 'emote', 'candidate selection does not save');
      await page.click('.set-chat-preview');
      await page.waitForFunction(() => window.audio.chatNode);
      assert.equal(await page.evaluate(() => window.settingsStore.get().chatSound), 'emote', 'preview does not save');
      await page.click('.set-chat-apply');
      await page.waitForFunction(() => window.settingsStore.get().chatSound === 'ceobe-dadada');
      assert.equal(await page.evaluate(() => window.settingsStore.get().chatCooldown), 2, 'apply initializes recommended cooldown');
      await page.$eval('#chat-notification-cooldown', el => {el.value='3';el.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.evaluate(() => {
        window.updateSettings({chatVolume: .35, sfx: 0, voice: 0});
        window.audio.stopChatNotification();
      });
      assert.equal(await page.evaluate(() => window.audio.volumes.chatVolume), .35);
      await page.reload(); await page.waitForSelector('#chat-notification-sound');
      assert.equal(await page.$eval('#chat-notification-sound', el => el.value), 'ceobe-dadada');
      assert.equal(await page.evaluate(() => window.settingsStore.get().chatVolume), .35);
      assert.equal(await page.evaluate(() => window.settingsStore.get().chatCooldown), 3, 'custom cooldown survives reload');
      assert.equal(await page.$eval('#chat-faction-notifications', el => el.getAttribute('aria-checked')), 'true', 'faction setting survives reload');
      await page.click('#chat-faction-notifications');
      await page.select('#chat-notification-sound', 'melantha-etto');
      await page.click('.set-chat-preview');
      await page.waitForFunction(() => window.audio.chatNode);
      assert.equal(await page.evaluate(() => window.settingsStore.get().chatCooldown), 3, 'preview preserves custom cooldown');
      await page.click('.set-chat-apply');
      await page.waitForFunction(() => window.settingsStore.get().chatSound === 'melantha-etto');
      assert.equal(await page.evaluate(() => window.settingsStore.get().chatCooldown), 2, 'changing sound resets only the shared cooldown');
      await page.click('.set-chat-preview');
      await page.waitForFunction(() => window.audio.chatNode);
      await page.evaluate(() => { window.audio.stopChatNotification(); window.audio.chatNextAt=0; });
      await page.waitForFunction(() => window.net._listeners.get('m.chat')?.size);
      await page.evaluate(() => window.net._emit('m.chatHistory', {messages:[{id:1}]}));
      assert.equal(await page.evaluate(() => window.audio.chatNode), null, 'history is silent');
      await page.evaluate(() => window.net._emit('m.chat', {id:2,playerId:'self'}));
      assert.equal(await page.evaluate(() => window.audio.chatNode), null, 'own messages are silent');
      await page.evaluate(() => {
        window.net._emit('m.chat',{id:3,playerId:'other',text:'진영 선택: 염국',kind:'faction'});
        window.net._emit('m.chat',{id:4,playerId:'other',text:'진영 선택 취소',kind:'faction'});
      });
      assert.equal(await page.evaluate(()=>window.audio.chatNode),null,'faction actions are silent');
      await page.evaluate(() => window.net._emit('m.chat', {id:5,playerId:'other',text:'진영 선택 취소',kind:'text'}));
      await page.waitForFunction(() => window.audio.chatNode);
      await page.evaluate(() => {window.factionTestId=5;});
      for (const text of ['진영 선택: 염국', '진영 선택 취소']) {
        await page.click('#chat-faction-notifications');
        await page.evaluate(text => {window.audio.stopChatNotification(); window.audio.chatNextAt=0; window.net._emit('m.chat', {id:++window.factionTestId,playerId:'other',text,kind:'faction'});}, text);
        await page.waitForFunction(() => window.audio.chatNode);
        await page.click('#chat-faction-notifications');
      }
      await page.keyboard.press('Escape');
      await page.waitForSelector('.modal', {hidden:true});
      await page.click('.game-chat__toggle');
      await page.waitForSelector('.game-chat__panel');
      await page.evaluate(() => {window.audio.stopChatNotification();window.audio.chatNextAt=0;window.net._emit('m.chat', {id:8,playerId:'other'});});
      await page.waitForFunction(()=>window.audio.chatNode);
      if (process.env.CHAT_ENTRY_SCREENSHOT) await (await page.$('.game-chat')).screenshot({path: process.env.CHAT_ENTRY_SCREENSHOT});
      await page.click('.game-chat__settings');
      await page.waitForSelector('#chat-notification-sound');
      await page.select('#chat-notification-sound', 'off');
      await page.click('.set-chat-apply');
      await page.waitForFunction(()=>window.settingsStore.get().chatSound==='off');
      assert.equal(await page.$eval('.set-chat-preview',el=>el.disabled),true);
      await page.waitForFunction(()=>!/[一-鿿]/.test(document.querySelector('.modal__title').textContent));
      if (process.env.CHAT_SETTINGS_SCREENSHOT) {
        await page.evaluate(()=>{for(const animation of document.getAnimations()) animation.cancel();});
        await (await page.$('.modal__box')).screenshot({path: process.env.CHAT_SETTINGS_SCREENSHOT});
      }
      await page.keyboard.press('Escape');
      await page.waitForSelector('.modal', {hidden:true});
      assert.ok(await page.$('.game-chat__panel'),'closing settings leaves chat open');
      await page.click('.game-chat__toggle');
      await page.evaluate(()=>{window.audio.chatNextAt=0;window.net._emit('m.chat',{id:9,playerId:'other'});});
      assert.equal(await page.evaluate(()=>window.audio.chatNode),null,'off suppresses minimized incoming chat');
      const waiting = await browser.newPage();
      waiting.setDefaultTimeout(5000);
      await waiting.goto(`http://127.0.0.1:${server.port}/notifications.html?room=1`);
      await waiting.waitForSelector('#chat-notification-sound');
      await waiting.select('#chat-notification-sound','ceobe-dadada');
      await waiting.click('.set-chat-apply');
      await waiting.click('.set-chat-preview');
      await waiting.waitForFunction(()=>window.audio.chatNode);
      await waiting.keyboard.press('Escape');
      await waiting.waitForSelector('.modal',{hidden:true});
      await waiting.waitForSelector('.game-chat--room .game-chat__panel');
      await waiting.evaluate(()=>{window.audio.stopChatNotification();window.audio.chatNextAt=0;window.net._emit('m.chat',{id:1,playerId:'other'});});
      await waiting.waitForFunction(()=>window.audio.chatNode);
      assert.deepEqual(errors, []);
    } finally { if (browser) await browser.close(); await server.close(); await rm(fixtureDir, {recursive:true,force:true}); }
  });

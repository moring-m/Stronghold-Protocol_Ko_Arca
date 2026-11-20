import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

const chrome = process.env.CHROME_PATH || (process.platform === 'win32'
  ? 'C:/Program Files/Google/Chrome/Application/chrome.exe' : '/usr/bin/chromium');

test('native Japanese vote text survives legacy DOM translation', {
  skip: process.env.SP_E2E !== '1' || !existsSync(chrome), timeout: 30000,
}, async () => {
  const { startServer } = await import('../../server/index.js');
  const puppeteer = (await import('puppeteer-core')).default;
  const server = await startServer({ port: 0, host: '127.0.0.1', quiet: true, studio: false });
  let browser;
  try {
    browser = await puppeteer.launch({ executablePath: chrome, headless: true, pipe: true, args: ['--no-sandbox'] });
    const page = await browser.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.setBypassServiceWorker(true);
    await page.setRequestInterception(true);
    const url = `http://127.0.0.1:${server.port}/`;
    page.on('request', (req) => {
      if (req.isNavigationRequest() && req.url() === url) return req.respond({ status: 200, contentType: 'text/html', body: `
        <meta charset="utf-8">
        <div data-i18n-native><span id="count"></span><input id="native"></div><div id="clock"></div>
        <span id="legacy">全员同意</span><input id="legacy-input" aria-label="全员同意">
        <script>localStorage.setItem('sp.pref.lang', '"ja"')</script>
        <script type="module">
          await import('/js/i18n/i18n.js');
          const {t} = await import('/shared/i18n.js');
          window.voteText = n => t('距离投票截止还有 {seconds} 秒', {seconds:n});
          window.nativeReady = true;
        </script>` });
      return req.continue();
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.nativeReady === true);
    for (const seconds of [45, 44, 1]) {
      await page.evaluate((n) => {
        const text = window.voteText(n), input = document.getElementById('native');
        document.getElementById('count').textContent = text;
        for (const name of ['aria-label', 'title', 'placeholder']) input.setAttribute(name, text);
      }, seconds);
      // Allow several MutationObserver deliveries, including those from attribute updates.
      await new Promise((resolve) => setTimeout(resolve, 100));
      assert.deepEqual(await page.evaluate(() => {
        const input = document.getElementById('native');
        return [document.getElementById('count').textContent,
          ...['aria-label', 'title', 'placeholder'].map((key) => input.getAttribute(key))];
      }), Array(4).fill(`投票終了まで${seconds}秒`));
    }
    assert.equal(await page.$eval('#legacy', (e) => e.textContent), '全員の賛成');
    assert.equal(await page.$eval('#legacy-input', (e) => e.getAttribute('aria-label')), '全員の賛成');
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    await server.close();
  }
});

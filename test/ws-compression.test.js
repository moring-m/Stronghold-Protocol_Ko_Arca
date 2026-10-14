import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import WebSocket from 'ws';
import { attachWebSocket } from '../server/http/websocket.js';
import { startServer } from '../server/index.js';

const BIG = JSON.stringify({ t: 'm.public', players: Array.from({ length: 200 }, (_, i) => ({ playerId: `p_${i % 4}`, name: '阿米娅', lp: 30, phase: 'PREP' })) });
const SMALL = JSON.stringify({ t: 'pong', at: 12345 });

/** A bare http server whose /ws sends BIG then SMALL to every socket (a stand-in for net.js Network). */
async function fakeServer() {
  const server = http.createServer((req, res) => { res.writeHead(404); res.end(); });
  const network = {
    admission: () => null,
    handleConnection: (ws) => { ws.send(BIG); ws.send(SMALL); },
  };
  const wss = attachWebSocket(server, { network, log: { error() {} } });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { url: `ws://127.0.0.1:${server.address().port}/ws`, close: () => new Promise((r) => { wss.close(); server.close(() => r()); }) };
}

/** Connect, collect two messages, report the server's Sec-WebSocket-Extensions answer and the bytes the socket read. */
function receive(url, opts) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url, opts);
    const msgs = [];
    let negotiated = '';
    ws.on('upgrade', (res) => { negotiated = res.headers['sec-websocket-extensions'] || ''; });
    ws.on('error', reject);
    ws.on('message', (data) => {
      msgs.push(String(data));
      if (msgs.length === 2) {
        const read = ws._socket.bytesRead;
        ws.close();
        resolve({ msgs, read, extensions: negotiated });
      }
    });
  });
}

describe('WebSocket compression rollback', () => {
  let srv;
  before(async () => { srv = await fakeServer(); });
  after(async () => { await srv.close(); });

  test('compression offers remain uncompressed and preserve both payloads', async () => {
    const r = await receive(srv.url);
    assert.equal(r.extensions, '');
    assert.deepEqual(r.msgs, [BIG, SMALL]);
    assert.ok(r.read > BIG.length + SMALL.length);
  });

  test('a client without the extension gets the same messages uncompressed', async () => {
    const r = await receive(srv.url, { perMessageDeflate: false });
    assert.equal(r.extensions, '');
    assert.deepEqual(r.msgs, [BIG, SMALL]);
    assert.ok(r.read > BIG.length + SMALL.length, `plain frames: ${r.read}`);
  });

  test('a narrow compression offer also connects without compression', async () => {
    const r = await receive(srv.url, { perMessageDeflate: { serverMaxWindowBits: 9 } });
    assert.equal(r.extensions, '');
    assert.deepEqual(r.msgs, [BIG, SMALL]);
  });
});

test('the real server declines compression at /ws and keeps the 2 MB frame limit', async () => {
  const srv = await startServer({ port: 0, host: '127.0.0.1', quiet: true });
  try {
    const ws = new WebSocket(`ws://127.0.0.1:${srv.port}/ws`);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    assert.equal(ws.extensions, '');
    // An oversized frame still closes the socket (1009) after compression is disabled.
    const closed = new Promise((resolve) => ws.once('close', (code) => resolve(code)));
    ws.send(JSON.stringify({ t: 'hello', name: 'x'.repeat(2 * 1024 * 1024 + 1) }));
    assert.equal(await closed, 1009);
  } finally {
    await srv.close();
  }
});

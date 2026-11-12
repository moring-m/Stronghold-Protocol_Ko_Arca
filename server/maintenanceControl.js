// 점검 안내 on a server without the release gateway: /__maintenance answers requests made on this machine only
// (a loopback peer that forwards no client address, so a tunnel or reverse proxy on the same machine is refused).
import { Maintenance } from './maintenance.js';
import { sendSession } from './net.js';
import { json, body } from './release/runtime.js';

const FORWARD_HEADERS = ['cf-connecting-ip', 'x-real-ip', 'x-forwarded-for', 'forwarded'];

export function isDirectLoopback(req) {
  const peer = String(req?.socket?.remoteAddress || '');
  const loop = peer === '::1' || peer.startsWith('127.') || peer.startsWith('::ffff:127.');
  return loop && !FORWARD_HEADERS.some((h) => req.headers?.[h] != null);
}

export function localMaintenanceControl(lobby, registry) {
  const maintenance = new Maintenance({
    broadcast: (notice) => { for (const session of registry.byPlayerId.values()) sendSession(session, { t: 'sys.maintenance', notice }); },
    chat: (text, detail) => lobby.systemChat(text, detail),
  });
  lobby.maintenance = maintenance;
  const handler = async (req, res) => {
    const path = new URL(req.url || '/', 'http://local').pathname;
    if (path !== '/__maintenance') return false;
    if (!isDirectLoopback(req)) { json(res, 403, { error: 'Forbidden' }); return true; }
    if (req.method === 'GET') { json(res, 200, { notice: maintenance.view() }); return true; }
    if (req.method !== 'POST') { json(res, 405, { error: 'POST required' }); return true; }
    let input;
    try { input = await body(req); } catch { json(res, 400, { error: 'Invalid body' }); return true; }
    const r = input && input.clear === true ? maintenance.clear() : maintenance.set(input);
    json(res, r.ok ? 200 : 400, r.ok ? { notice: r.notice } : { error: r.error });
    return true;
  };
  handler.close = () => maintenance.close();
  return handler;
}

// server/http/websocket.js — the real-time side of the server:
//
//   * session wiring: SessionRegistry (reconnect tokens) → Lobby (rooms, server/lobby.js) → Network (the socket
//     protocol, server/net.js), built from the startServer() options (config.js decides which go where);
//   * WebSocket (ws) at /ws, maxPayload 2 MB, compression disabled → Network.handleConnection. Refused at
//     the upgrade: any other path 404; per-network socket limit for internet clients (maxConnectionsPerAddr, see net.js
//     clientAddress; local/LAN peers are exempt) 429; server full (maxConnections) or shutting down 503.

import { WebSocketServer } from 'ws';
import { Network, SessionRegistry, NET_DEFAULTS } from '../net.js';
import { Lobby } from '../lobby.js';
import { splitUrl } from './common.js';
import { netOptionsFrom, lobbyOptionsFrom } from './config.js';

/** Inbound WebSocket frame limit (DESIGN §8). */
export const WS_MAX_PAYLOAD = 2 * 1024 * 1024;

/**
 * The session stack of one server.
 * @param {{ MatchClass?: Function, seedFn?: () => number, [option: string]: any }} opts startServer() options
 * @param {{ data: object, log: object }} deps the game data the lobby's matches use, the logger
 * @returns {{ registry: SessionRegistry, lobby: Lobby, network: Network }}
 */
export function createSessionStack(opts, { data, log }) {
  const netOptions = netOptionsFrom(opts);
  const registry = new SessionRegistry({ reconnectWindowMs: netOptions.reconnectWindowMs ?? NET_DEFAULTS.reconnectWindowMs });
  const lobbyOptions = lobbyOptionsFrom(opts);
  const lobby = new Lobby({ registry, log, MatchClass: opts.MatchClass, getData: () => data, seedFn: opts.seedFn, options: lobbyOptions });
  const network = new Network({ registry, handler: lobby, log, options: netOptions });
  return { registry, lobby, network };
}

/**
 * Count a socket in the traffic counters (traffic.js): its wire bytes from now until it closes, the payload of every
 * message it sends (ws.send wrapped) and receives.
 * @param {import('ws').WebSocket} ws
 * @param {import('node:http').IncomingMessage} req
 * @param {ReturnType<typeof import('./traffic.js').createTrafficCounter>} traffic
 */
function meterSocket(ws, req, traffic) {
  const socket = req.socket;
  traffic.wsOpen(socket);
  const send = ws.send;
  ws.send = function meteredSend(data, ...rest) {
    traffic.wsSent(data);
    return send.call(this, data, ...rest);
  };
  ws.on('message', (data) => traffic.wsReceived(data));
  ws.once('close', () => traffic.wsClose(socket));
}

/**
 * Serve the WebSocket endpoint /ws on `server` (its 'upgrade' event).
 * @param {import('node:http').Server} server
 * @param {{ network: Network, log: object, traffic?: ReturnType<typeof import('./traffic.js').createTrafficCounter> }} deps
 * @returns {WebSocketServer}
 */
export function attachWebSocket(server, { network, log, traffic = null }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_PAYLOAD, perMessageDeflate: false, clientTracking: false });
  wss.on('connection', (ws, req) => {
    if (traffic) meterSocket(ws, req, traffic);
    network.handleConnection(ws, req);
  });
  wss.on('error', (e) => log.error('[ws] server error', e));

  server.on('upgrade', (req, socket, head) => {
    socket.on('error', () => {});
    const parts = splitUrl(req.url || '/');
    const reject = (status, text) => {
      try { socket.end(`HTTP/1.1 ${status} ${text}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); } catch { socket.destroy(); }
    };
    if (!parts || parts.rawPath !== '/ws') { reject(404, 'Not Found'); return; }
    const refused = network.admission(req);
    if (refused === 'per-address') { reject(429, 'Too Many Requests'); return; }
    if (refused) { reject(503, 'Service Unavailable'); return; }
    try {
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
    } catch (e) {
      log.error('[ws] upgrade failed', e);
      socket.destroy();
    }
  });
  return wss;
}

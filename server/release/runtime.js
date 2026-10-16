// Protected worker controls. Kept separate from public game protocol.
import { sendSession } from '../net.js';
import { createRetirement } from './retirement.js';
import { timingSafeEqual } from 'node:crypto';
export function authorized(req, token) {
  const value = req.headers.authorization || "",
    expected = `Bearer ${token}`;
  return (
    !!token &&
    Buffer.byteLength(value) === Buffer.byteLength(expected) &&
    timingSafeEqual(Buffer.from(value), Buffer.from(expected))
  );
}
export function json(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  res.end(JSON.stringify(value));
}
export async function body(req) {
  let value = "",
    bytes = 0;
  for await (const chunk of req) {
    bytes += chunk.length;
    if (bytes > 65536) throw Error("Body too large");
    value += chunk;
  }
  return value ? JSON.parse(value) : {};
}
export function workerControls(lobby, { release, token, network }) {
  const retire = createRetirement({
    notify: text => {for(const session of lobby.registry.byPlayerId.values())sendSession(session,{t:'m.toast',text,kind:'warn',ttl:10000});},
    expire: () => {lobby.draining=true;lobby.shutdown('version_retired');network?.close();},
  });
  const handler = async (req, res) => {
    const path = new URL(req.url, "http://worker").pathname;
    if (!path.startsWith("/__release/")) return false;
    if (!authorized(req, token)) {
      json(res, 403, { error: "Forbidden" });
      return true;
    }
    if (path === "/__release/status" && req.method === "GET") {
      json(res, 200, {
        release,
        draining: lobby.draining,
        roomPrefix: lobby.opts.roomCodePrefix,
        retirementNotices:true, expiresAt:retire.deadline(),
        ...lobby.stats(), sockets:network?.connectionCount,
        codes: [...lobby.rooms.keys()],
      });
      return true;
    }
    if (path === "/__release/drain" && req.method === "POST") {
      const input = await body(req);
      if (typeof input.draining !== "boolean") {
        json(res, 400, { error: "Expected boolean draining" });
        return true;
      }
      if(input.expiresAt!=null && (!Number.isSafeInteger(input.expiresAt)||input.expiresAt<=0)){json(res,400,{error:'Invalid retirement deadline'});return true;}
      lobby.draining = input.draining;
      retire.setDeadline(input.draining?input.expiresAt??retire.deadline():null);
      json(res, 200, { draining: lobby.draining });
      return true;
    }
    if(path==='/__release/shutdown' && req.method==='POST'){
      if(!lobby.draining){json(res,409,{error:'Cannot shut down active release'});return true;}
      retire.stop();lobby.shutdown('version_retired');network?.close();json(res,200,{closed:true});return true;
    }
    json(res, 404, { error: "Not found" });
    return true;
  };
  handler.close=()=>retire.stop();
  return handler;
}

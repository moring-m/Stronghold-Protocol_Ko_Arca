// Protected worker controls. Kept separate from public game protocol.
import { timingSafeEqual } from "node:crypto";
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
export function workerControls(lobby, { release, token }) {
  return async (req, res) => {
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
        ...lobby.stats(),
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
      lobby.draining = input.draining;
      json(res, 200, { draining: lobby.draining });
      return true;
    }
    json(res, 404, { error: "Not found" });
    return true;
  };
}

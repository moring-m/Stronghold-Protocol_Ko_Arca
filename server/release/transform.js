import { init, parse } from "es-module-lexer";
import { bootstrap } from "./bootstrap.js";
export function pinPath(path, release) {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const u = new URL(path, "http://release");
  u.searchParams.set("release", release);
  return u.pathname + u.search + u.hash;
}
export async function transform(text, type, release) {
  if (type.includes("javascript")) {
    await init();
    const [imports] = parse(text),
      edits = [];
    for (const rec of imports) {
      if (
        !rec.specifier ||
        (!rec.specifier.startsWith(".") && !rec.specifier.startsWith("/"))
      )
        continue;
      const hashAt = rec.specifier.indexOf("#"),
        base = hashAt < 0 ? rec.specifier : rec.specifier.slice(0, hashAt),
        hash = hashAt < 0 ? "" : rec.specifier.slice(hashAt);
      const sep = base.includes("?") ? "&" : "?";
      const spec = base + sep + "release=" + release + hash;
      edits.push([
        rec.start,
        rec.end,
        rec.type === "dynamic" ? JSON.stringify(spec) : spec,
      ]);
    }
    for (const [a, b, value] of edits.reverse())
      text = text.slice(0, a) + value + text.slice(b);
    return text;
  }
  if (type.includes("text/html")) {
    text = text.replace(
      /\b(src|href)=(['"])(\/[^'"]*)\2/g,
      (_, key, q, path) => `${key}=${q}${pinPath(path, release)}${q}`,
    );
    return text.replace(
      "<head>",
      "<head><script>" + bootstrap(release) + "</script>",
    );
  }
  if (type.includes("text/css"))
    return text.replace(
      /url\(\s*(['"]?)(\/[^)'"\s]*)\1\s*\)/g,
      (_, q, path) => `url(${q}${pinPath(path, release)}${q})`,
    );
  return text;
}

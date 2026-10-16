import { init, parse } from 'es-module-lexer';
import { bootstrap } from './bootstrap.js';
export function pinPath(path, release) {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const u = new URL(path, "http://release");
  u.searchParams.set("release", release);
  return u.pathname + u.search + u.hash;
}
export async function transform(text, type, release, options = {}) {
  if (type.includes("javascript")) {
    await init();
    const [imports] = parse(text),
      edits = [];
    for (const rec of imports) {
      // The lexer reports interpolated templates as glob specifiers (e.g. ./ops/*).
      // Preserve the expression and pin its evaluated URL, never import the glob.
      if (rec.type === "dynamic" && (rec.glob || !rec.specifier)) {
        const expression = text.slice(rec.start, rec.end);
        edits.push([rec.start, rec.end, `((s)=>{if(typeof s!=="string"||(!s.startsWith(".")&&!s.startsWith("/")&&!/^https?:/.test(s)))return s;const u=new URL(s,import.meta.url);if(u.origin!==new URL(import.meta.url).origin)return s;u.searchParams.set("release",${JSON.stringify(release)});return u.href;})(${expression})`]);
        continue;
      }
      if (
        !rec.specifier || rec.specifier.startsWith("//") ||
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
      "<head><script>" + bootstrap(release, options) + "</script>",
    );
  }
  if (type.includes("text/css"))
    return text.replace(
      /url\(\s*(['"]?)(\/[^)'"\s]*)\1\s*\)/g,
      (_, q, path) => `url(${q}${pinPath(path, release)}${q})`,
    );
  return text;
}

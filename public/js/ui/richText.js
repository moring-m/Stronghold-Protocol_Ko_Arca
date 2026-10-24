// Rich-text description formatting (pure, no DOM / Preact — unit-tested in Node).
//
// Official descriptions (data/*.json `descRaw`, DATA.md §0) carry Arknights markup:
//   <@ba.vup>+15%</>        styled span (class `ba.vup`: value-up highlight)
//   <$ba.stun>晕眩</>        term span (a status keyword with a glossary entry)
//   <@autochess.dgreen>3</> autochess-specific colours
// Tags nest. Anything else that looks like a tag — `<获得时>`, `<在场6名不同【炎】干员>` — is literal
// text and is kept verbatim (its closing `>` included). `\n` (real newline or the two-char escape)
// is a line break.
//
// API:
//   parseRichText(src)            → Seg[]  where Seg = { text, cls: string[], term: boolean } | { br: true }
//   richTextPlain(src)            → string (markup stripped, newlines kept)
//   rtClassName(cls)              → CSS class for an official style id ('ba.vup' → 'rt-vup')
//   formatBondEffect(bond, layers)→ bond `effectDescRaw` with its `{i:fmt}` placeholders resolved
//   formatPlaceholder(value, fmt) → '15%' / '3' for the official number formats ('0%', '0.0%', '0', '0.0')
//   fillPlaceholders(src, values) → replace `{i:fmt}` / `{i}` by values[i] (unknown indexes kept)

// 한글 패치: 태그로 나누기 전에 문장 전체를 번역한다 (Node 테스트에서는 원문 그대로).
import {customBondEffectTemplate} from './bondDescriptions.js';
import { tr } from '../i18n/i18n.js';

/** Official style id → our CSS modifier (css/screens/game-panels.css `.rt-*`). */
const STYLE_CLASS = {
  'ba.vup': 'rt-vup',
  'ba.vdown': 'rt-vdown',
  'ba.rem': 'rt-rem',
  'ba.acrem': 'rt-note',
  'ba.kw': 'rt-kw',
  'ba.talpu': 'rt-vup',
  'autochess.gray': 'rt-note',
  'autochess.dgreen': 'rt-mint',
  'autochess.green': 'rt-mint',
  'autochess.red': 'rt-vdown',
  'autochess.yellow': 'rt-rem',
  'eb.key': 'rt-kw',
  'eb.danger': 'rt-vdown',
};

/**
 * CSS class for an official style id. Term tags (`$…`) map to `rt-term`, unknown styles to `rt-hl`.
 * @param {string} cls style id without the sigil, e.g. 'ba.vup'
 * @param {boolean} [term]
 * @returns {string}
 */
export function rtClassName(cls, term = false) {
  if (term) return 'rt-term';
  return STYLE_CLASS[cls] || 'rt-hl';
}

const TAG_OPEN = /^<([@$])([A-Za-z0-9_.\-]{1,48})>/;
const TAG_CLOSE = '</>';

/**
 * Parse official rich text into flat styled segments.
 * @param {any} src
 * @returns {Array<{ text: string, cls: string[], term: boolean } | { br: true }>}
 */
export function parseRichText(src) {
  if (src == null) return [];
  const s = tr(String(src)).replace(/\\n/g, '\n').replace(/\r\n?/g, '\n');
  /** @type {Array<{ cls: string, term: boolean }>} */
  const stack = [];
  const out = [];
  let buf = '';
  const flush = () => {
    if (!buf) return;
    const cls = stack.map((t) => t.cls);
    const term = stack.some((t) => t.term);
    const prev = out[out.length - 1];
    // merge with the previous segment when styles are identical
    if (prev && !prev.br && prev.term === term && prev.cls.length === cls.length && prev.cls.every((c, i) => c === cls[i])) {
      prev.text += buf;
    } else {
      out.push({ text: buf, cls, term });
    }
    buf = '';
  };
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '\n') {
      flush();
      out.push({ br: true });
      i += 1;
      continue;
    }
    if (ch === '<') {
      if (s.startsWith(TAG_CLOSE, i)) {
        if (stack.length) {
          flush();
          stack.pop();
        } else {
          buf += TAG_CLOSE; // stray closer: keep literally
        }
        i += TAG_CLOSE.length;
        continue;
      }
      const m = TAG_OPEN.exec(s.slice(i, i + 52));
      if (m) {
        flush();
        stack.push({ cls: m[2], term: m[1] === '$' });
        i += m[0].length;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

// Apply the same fallback emphasis to every description after translation. Explicit official
// markup wins; missing markup in a translated/custom sentence receives the common number/term rules.
const DESCRIPTION_TOKEN = /속세의 음|최대 HP|공격 속도|공격력|방어력|마법 저항|저지 가능 수|물리 회피|마법 회피|트루 대미지|약점 대미지|은신|냉각|빙결|공포|정지|기절|치료|Voice of Mundane|\b(?:Max HP|ATK|DEF|RES|ASPD|HP|SP|DP|Invisible|Cold|Frozen|Fear|Stun)\b|塵界の音|尘世之音|攻撃力|防御力|術耐性|最大HP|攻撃速度|ステルス|寒冷|凍結|攻击力|防御力|法术抗性|生命上限|攻击速度|隐匿|冻结|[+-]?\d+(?:\.\d+)?%?/g;
export function parseDescriptionText(src) {
  const out=[];
  let note=0;
  for(const seg of parseRichText(src)){
    if(seg.br){out.push(seg);continue;}
    if(seg.cls.length||seg.term){out.push(seg);for(const ch of seg.text){if(ch==='('||ch==='（')note++;else if(ch===')'||ch==='）')note=Math.max(0,note-1);}continue;}
    for(const part of seg.text.split(/([()（）])/)){
      if(!part)continue;
      if(part==='('||part==='（')note++;
      let at=0;
      for(const m of part.matchAll(DESCRIPTION_TOKEN)){
        if(m.index>at)out.push({text:part.slice(at,m.index),cls:note?['autochess.gray']:[],term:false});
        out.push({text:m[0],cls:['ba.vup'],term:false});at=m.index+m[0].length;
      }
      if(at<part.length)out.push({text:part.slice(at),cls:note?['autochess.gray']:[],term:false});
      if(part===')'||part==='）')note=Math.max(0,note-1);
    }
  }
  return out;
}

/**
 * Markup-free text (newlines kept).
 * @param {any} src
 * @returns {string}
 */
export function richTextPlain(src) {
  return parseRichText(src).map((seg) => (seg.br ? '\n' : seg.text)).join('');
}

/**
 * Format a number with an official format string.
 * '0%' → rounded percent, '0.0%' → 1 decimal percent, '0' → integer, '0.0' → 1 decimal. Unknown → trimmed number.
 * @param {number} value
 * @param {string} [fmt]
 * @returns {string}
 */
export function formatPlaceholder(value, fmt = '0') {
  const v = Number(value);
  if (!Number.isFinite(v)) return '?';
  const f = typeof fmt === 'string' ? fmt : '0';
  const pct = f.endsWith('%');
  const core = pct ? f.slice(0, -1) : f;
  const dot = core.indexOf('.');
  const decimals = dot >= 0 ? Math.min(4, core.length - dot - 1) : 0;
  const n = pct ? v * 100 : v;
  const fixed = n.toFixed(decimals);
  // avoid "-0"
  const clean = Number(fixed) === 0 ? (0).toFixed(decimals) : fixed;
  return pct ? `${clean}%` : clean;
}

/**
 * Replace `{i:fmt}` / `{i}` placeholders with values (unknown indexes are kept as-is).
 * @param {string} src
 * @param {Array<number|string|null|undefined>} values
 * @param {string[]} [formats] optional per-index format override
 * @returns {string}
 */
export function fillPlaceholders(src, values, formats = []) {
  if (src == null) return '';
  return tr(String(src)).replace(/\{(\d{1,2})(?::([^{}]{1,12}))?\}/g, (whole, idx, fmt) => {
    const i = Number(idx);
    const v = Array.isArray(values) ? values[i] : undefined;
    if (v == null) return whole;
    if (typeof v === 'string') return v;
    return formatPlaceholder(v, formats[i] || fmt || '0');
  });
}

/**
 * The bond's in-battle effect text with its layer-dependent numbers resolved (DATA.md §3:
 * `{i:fmt}` = `bb[base] + bb[perStack] × layers`).
 * @param {any} bond bonds.json record
 * @param {number} [layers]
 * @returns {string} rich text (markup kept)
 */
export function formatBondEffect(bond, layers = 0, count = 0) {
  if (!bond || typeof bond !== 'object') return '';
  const raw = customBondEffectTemplate(bond) || bond.effectDescRaw || bond.effectDesc || '';
  // Translate the template before filling its numeric slots; filled sentences are not dictionary keys.
  const src = tr(raw);
  const params = Array.isArray(bond.effectDescParams) ? bond.effectDescParams : [];
  const bb = bond.bb && typeof bond.bb === 'object' ? bond.bb : {};
  const L = Number.isFinite(Number(layers)) ? Math.max(0, Number(layers)) : 0;
  const values = [];
  const formats = [];
  for (const p of params) {
    if (!p || !Number.isInteger(p.index)) continue;
    const base = Number(bb[p.base]) || 0;
    const per = Number(bb[p.perStack]) || 0;
    // a layer-scaled chance (迅捷 / 不屈 base_prob + prob_per_stack, 奇迹 baseprob + prob) stops at 100 % like the sim's
    // min(1, …) (bonds/addon procChance, meta.js 奇迹) — the card read 124 % at 266 layers (GitHub #108)
    const chance = /prob/i.test(`${p.base}|${p.perStack}`);
    values[p.index] = chance ? Math.max(0, Math.min(1, base + per * L)) : base + per * L;
    formats[p.index] = p.format || '0';
  }
  const text=fillPlaceholders(src, values, formats);
  return bond.bondId==='leithanienShip'||bond.id==='leithanienShip'?text.replace(/5(?=(?:<\/>)?(?:초| seconds|秒))/,String(count>=6?10+Math.floor(L/25):5)).replaceAll('{leithApplyDuration}',String(count>=6?10+Math.floor(L/25):5)).replaceAll('{leithDurationBonus}',String(5+Math.floor(L/25))).replaceAll('{leithDurationStacks}',String(Math.floor(L/25))):text;
}

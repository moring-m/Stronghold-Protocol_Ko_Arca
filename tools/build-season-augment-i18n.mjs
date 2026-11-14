#!/usr/bin/env node
// tools/build-season-augment-i18n.mjs — en/ja/zh for the 증강 texts a 규정 season generates (shared/augments.js
// createAugmentCatalog with SEASON_AUGMENT_ITEMS): bond support / equipment support names and descriptions, whose bond and
// item names differ from the 맹약 season's. Each text is composed from the language's existing template (the 염국 /
// 빅토리아 해머 entry) with that language's bond and item names; an existing entry is never overwritten.
// Usage: node tools/build-season-augment-i18n.mjs [--version act3autochess@V3_1]
import fs from 'node:fs';
import { createAugmentCatalog } from '../shared/augments.js';
import { SEASON_AUGMENT_ITEMS } from '../shared/seasonAugments.js';
import { getVersionData } from '../server/data.js';

const VERSION = process.argv.includes('--version') ? process.argv[process.argv.indexOf('--version') + 1] : 'act3autochess@V3_1';
const LANGS = ['en', 'ja', 'zh'];
// bond names no dictionary carries for the season-only bonds (ko → lang)
const BOND_EXTRA = {
  결집: { en: 'Convergence', ja: '結集', zh: '聚合' },
  아케인: { en: 'Arcane', ja: '秘術', zh: '奥术' },
  협동방어: { en: 'Assist Operator', ja: '共同防衛', zh: '协防干员' },
  독행: { en: 'Solo', ja: '孤高', zh: '独行' },
  궁극기: { en: 'Ultimate', ja: '絶技', zh: '绝技' },
};
const dict = (l) => { const d = {}; for (const n of fs.readdirSync(`public/i18n/${l}`)) if (n.endsWith('.json') && n !== 'compiled.json') Object.assign(d, JSON.parse(fs.readFileSync(`public/i18n/${l}/${n}`, 'utf8'))); return d; };
const data = getVersionData(VERSION);
const season = SEASON_AUGMENT_ITEMS[VERSION];
const zhOfBond = Object.fromEntries(Object.entries(season.bondNames).map(([id, ko]) => [ko, data.bonds?.[id]?.name || null]));
const zhOfItem = Object.fromEntries(Object.entries(season.names).map(([id, ko]) => [ko, data.items?.[id]?.name || null]));
let cat = [];
for (const r of [1, 4, 7, 10, 13]) cat.push(...createAugmentCatalog(data, r));
const texts = new Set(cat.flatMap((a) => [a.name, a.description]).filter(Boolean));

let total = 0;
for (const l of LANGS) {
  const d = dict(l), path = `public/i18n/${l}/fork.json`, fork = JSON.parse(fs.readFileSync(path, 'utf8'));
  const bondName = (ko) => BOND_EXTRA[ko]?.[l] || d[ko] || (zhOfBond[ko] && (l === 'zh' ? zhOfBond[ko] : d[zhOfBond[ko]])) || null;
  const itemName = (ko) => d[ko] || (zhOfItem[ko] && (l === 'zh' ? zhOfItem[ko] : d[zhOfItem[ko]])) || null;
  // templates from the 맹약 entries: {B} bond, {N} count, {T} tier, {I} item
  const tpl = (ko, swaps) => { let s = d[ko]; if (!s) return null; for (const [from, to] of swaps) s = s.split(from).join(to); return s; };
  const bondTpl = tpl('무작위 3등급 [염국] 오퍼레이터 1명 획득', [[bondName('염국') || 'Yan', '{B}'], ['3', '{T}'], ['1', '{N}']]);
  const supTpl = { I: tpl('염국 지원 I', [[bondName('염국'), '{B}']]), II: tpl('염국 지원 II', [[bondName('염국'), '{B}']]), III: tpl('염국 지원 III', [[bondName('염국'), '{B}']]) };
  const eqTpl = { I: tpl('(맹약 이름) 장비 지원 I', [[d['(맹약 이름)'] || '(Alliance Name)', '{B}']]), II: tpl('(맹약 이름) 장비 지원 II', [[d['(맹약 이름)'] || '(Alliance Name)', '{B}']]), III: tpl('(맹약 이름) 장비 지원 III', [[d['(맹약 이름)'] || '(Alliance Name)', '{B}']]) };
  const gainTpl = tpl('빅토리아 해머 2개 획득', [[itemName('빅토리아 해머'), '{I}'], ['2', '{N}']]);
  const join = { en: ' and ', ja: '、', zh: '和' }[l];
  let added = 0;
  for (const ko of texts) {
    if (d[ko] || fork[ko]) continue;
    let out = null, m;
    if ((m = /^무작위 (\d)등급 \[(.+)\] 오퍼레이터 (\d+)명 획득$/.exec(ko)) && bondTpl && bondName(m[2])) out = bondTpl.replace('{T}', m[1]).replace('{B}', bondName(m[2])).replace('{N}', m[3]);
    else if ((m = /^(.+) 장비 지원 (I{1,3})$/.exec(ko)) && eqTpl[m[2]] && bondName(m[1])) out = eqTpl[m[2]].replace('{B}', bondName(m[1]));
    else if ((m = /^(.+) 지원 (I{1,3})$/.exec(ko)) && supTpl[m[2]] && bondName(m[1])) out = supTpl[m[2]].replace('{B}', bondName(m[1]));
    else if (/ 획득$/.test(ko) && gainTpl) {
      const parts = ko.replace(/ 획득$/, '').split('와 ').map((p) => /^(.+) (\d+)개$/.exec(p));
      if (parts.every((p) => p && itemName(p[1]))) {
        const one = (p) => gainTpl.replace('{I}', itemName(p[1])).replace('{N}', p[2]);
        out = parts.length === 1 ? one(parts[0]) : (l === 'en' ? 'Gain ' + parts.map((p) => `${p[2]} ${itemName(p[1])}`).join(join)
          : parts.map((p) => one(p).replace(/(获得|を獲得|獲得)$/, '').trim()).join(join) + ({ ja: 'を獲得', zh: '' }[l] ?? ''));
        if (l === 'zh') out = '获得' + parts.map((p) => `${itemName(p[1])}${p[2]}个`).join(join);
      }
    }
    if (out) { fork[ko] = out; added++; } else if (l === 'en') console.warn('no template:', ko);
  }
  fs.writeFileSync(path, JSON.stringify(fork, null, 2) + '\n');
  console.log(l, 'added', added); total += added;
}
console.log('total', total);

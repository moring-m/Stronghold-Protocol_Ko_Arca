// 규정 operators list their implementation records after the full description (圣聆初雪 / 프라마닉스 더 프레리타: three
// records); the operator detail shows the description once (ui/loadoutModel.js garrisonTexts, covered).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { garrisonTexts } from '../../public/js/ui/loadoutModel.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const G = read('../../data/versions/act3autochess-v3_1/garrisons.json'), C = read('../../data/versions/act3autochess-v3_1/chess.json');
const ko = read('../../public/i18n/ko/regulation.json');

test('규정: every multi-record operator shows one trait block; 프라마닉스 더 프레리타 its description only', () => {
  for (const c of Object.values(C)) if ((c.garrisonIds || []).length > 1)
    assert.equal(garrisonTexts(c, (g) => G[g], (s) => ko[s] || s, { covered: true }).length, 1, c.chessId);
  const [text] = garrisonTexts(C.chess_char_5_07_a, (g) => G[g], (s) => ko[s] || s, { covered: true });
  assert.match(text, /SP <@ba\.vup>1<\/> 회복/);
  assert.doesNotMatch(text, /\n/);
});

test('규정 메커니스트: the normal and the elite record each carry only their own line', () => {
  for (const [id, other] of [['garrison_174_a', '[정예]'], ['garrison_174_b', '[정예]']]) assert.ok(!ko[G[id].descRaw].includes(other), id);
  assert.match(ko[G.garrison_174_a.descRaw], /3명 이상/);
  assert.doesNotMatch(ko[G.garrison_174_b.descRaw], /3명 이상/);
});

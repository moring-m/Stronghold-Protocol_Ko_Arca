// test/ui/garrison-meteor.test.js — 流星's 特性 listed 「造成的伤害变为弱点伤害」 twice: garrison_01 repeats a clause of her
// own garrison_137 (its brackets translated differently), so it was not caught as a repeated opening.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { garrisonTexts } from '../../public/js/ui/loadoutModel.js';
const require = createRequire(import.meta.url);
const G = require('../../content/production/data/garrisons.json'), ko = require('../../public/i18n/ko/data.json'), C = require('../../content/production/data/chess.json');
test('流星: one 特性 line in either form', () => {
  for (const id of ['chess_char_3_17_a', 'chess_char_3_17_b']) {
    const lines = garrisonTexts(C[id], (g) => G[g], (s) => ko[s] || s).join('\n').split('\n');
    assert.equal(lines.length, 1, id);
    assert.match(lines[0], /약점 대미지/);
  }
});

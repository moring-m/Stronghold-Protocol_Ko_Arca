import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../../public/js/render/app.js',import.meta.url),'utf8');
// The shipped entry point also has a legacy inline sanitizer; exercise that exact function.
test('renderer entry point preserves native and custom loadout skin identifiers', () => {
  const start = source.indexOf('export function renderInfo(');
  const end = source.indexOf('\n}', start) + 2;
  const sanitize = new Function(source.slice(start, end).replace(/^export /, '') + '; return renderInfo;')();
  const info = sanitize({ id: 1, skin: 'char_195_glassb@kitchen#1', skinId: 'skin_char_195_glassb_kitchen_1' });
  assert.equal(info.skin, 'char_195_glassb@kitchen#1');
  assert.equal(info.skinId, 'skin_char_195_glassb_kitchen_1');
});

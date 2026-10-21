import{test}from'node:test';import assert from'node:assert/strict';
import{formatAugmentDescription}from'../../public/js/ui/augmentDescription.js';
import{richTextPlain,formatBondEffect}from'../../public/js/ui/richText.js';
import{readFileSync}from'node:fs';
test('augment decoration preserves text and consistently highlights values, terms and limitations',()=>{
 const source='공격력 +35%, 속세의 음 적용 (최대 10회)';const result=formatAugmentDescription(source);
 assert.equal(richTextPlain(result),source);assert.match(result,/<@ba.vup>공격력<\/>/);assert.match(result,/<@ba.vup>\+35%<\/>/);assert.match(result,/<@autochess.gray>\(/);
});
test('custom in-game bonds show calculated bonuses without per-stack formulas',()=>{
 const b=JSON.parse(readFileSync('content/production/data/bonds.json'));
 const leith=richTextPlain(formatBondEffect(b.leithanienShip,25,6)),ursus=richTextPlain(formatBondEffect(b.ursusShip,25,6));
 assert.match(leith,/11초/);assert.match(leith,/1\.25%/);assert.match(leith,/\+6초/);assert.doesNotMatch(leith,/중첩당|기본 \+|중첩 보너스|\{/);
 assert.match(ursus,/\+45%/);assert.match(ursus,/\+32\.50%/);assert.match(ursus,/10\.38%/);assert.doesNotMatch(ursus,/중첩당|%p|\{/);
});

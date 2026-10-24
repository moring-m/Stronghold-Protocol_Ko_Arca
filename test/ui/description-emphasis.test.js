import {test} from 'node:test';import assert from 'node:assert/strict';
import {parseDescriptionText,richTextPlain} from '../../public/js/ui/richText.js';
test('plain translated descriptions receive common emphasis without altering the wording',()=>{
 const text='공격력 +35%, 최대 HP +20% (최대 10회)';const parts=parseDescriptionText(text);
 assert.equal(parts.map(p=>p.br?'\n':p.text).join(''),text);
 assert.ok(parts.some(p=>p.text==='+35%'&&p.cls.includes('ba.vup')));
 assert.ok(parts.some(p=>p.text==='공격력'&&p.cls.includes('ba.vup')));
 assert.ok(parts.some(p=>p.text==='최대 '&&p.cls.includes('autochess.gray')));
 assert.ok(parts.some(p=>p.text==='10'&&p.cls.includes('ba.vup')));
});
test('explicit danger, number and status styles retain their original meaning',()=>{
 const text='<@ba.vdown>-20%</> <$ba.fear>공포</> <@ba.rem>총공격</>';
 const parts=parseDescriptionText(text);
 assert.ok(parts.some(p=>p.text==='-20%'&&p.cls.includes('ba.vdown')&&!p.cls.includes('ba.vup')));
 assert.ok(parts.some(p=>p.text==='공포'&&p.term));
 assert.ok(parts.some(p=>p.text==='총공격'&&p.cls.includes('ba.rem')));
 assert.equal(parts.map(p=>p.text).join(''),richTextPlain(text));
});
test('all supported languages use the same numeric rule; newlines and literal brackets survive',()=>{
 for(const text of ['ATK +20% (3 seconds)','攻撃力 +20%（3秒）','攻击力 +20%（3秒）','<대역>\n공격력 +20%']){
  const parts=parseDescriptionText(text);assert.equal(parts.map(p=>p.br?'\n':p.text).join(''),text);
  assert.ok(parts.some(p=>p.text==='+20%'&&p.cls.includes('ba.vup')));
 }
});

// The official effects of operator skills reach the screen in a real sim duel (tools/vfx-op-skill-audit.mjs). Needs an
// extracted effects index (public/assets/local/fx/index.json or SP_FX_INDEX); skipped without one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const INDEX = process.env.SP_FX_INDEX || `${ROOT}public/assets/local/fx/index.json`;
const audit = (only) => JSON.parse(execFileSync(process.execPath, ['tools/vfx-op-skill-audit.mjs', '--index', INDEX, '--only', only, '--seconds', '90', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }));
const verdict = (rows, skill) => rows.find((r) => r.skill === skill);

test('信仰搅拌机 S3 counters use its Sk3 mode (switched by rmixer_sk3[mode])', { skip: !existsSync(INDEX) }, () => {
  const r = verdict(audit('char_4194_rmixer'), 'skchr_rmixer_3');
  assert.ok(r.played.includes('rmixer_skill_03_range_01'), JSON.stringify(r));
});

test("陈 S3's cuts and 艾丽妮 S3's storm play their casts and every hit (skill damage is a kit hit, not an attack's)", { skip: !existsSync(INDEX) }, () => {
  assert.equal(verdict(audit('char_010_chen'), 'skchr_chen_3').verdict, 'ok');
  assert.equal(verdict(audit('char_4009_irene'), 'skchr_irene_3').verdict, 'ok');
});

test('skills cast at their start (阿 S2 / S3) play without errors', { skip: !existsSync(INDEX) }, () => {
  for (const r of audit('char_225_haak')) assert.notEqual(r.verdict, 'error', JSON.stringify(r));
});

test('阿罗玛 S1: the replaced attack after the activation\'s wind-up is the skill\'s (its cast and hit)', { skip: !existsSync(INDEX) }, () => {
  const r = verdict(audit('char_446_aroma'), 'skchr_aroma_1');
  for (const k of ['aroma_skill_01_start_up_01', 'aroma_skill_01_hit_01']) assert.ok(r.played.includes(k), JSON.stringify(r));
  // 斩业星熊 S2 stays on in her S2 mode: those attacks keep the mode's rows
  assert.equal(verdict(audit('char_1044_hsgma2'), 'skchr_hsgma2_2').verdict, 'ok');
});

test("泥岩 S3 wakes with its awake rows; 假日威龙陈 S2 and 郁金香 S3 play every cut's hit", { skip: !existsSync(INDEX) }, () => {
  assert.equal(verdict(audit('char_311_mudrok'), 'skchr_mudrok_3').verdict, 'ok');
  assert.equal(verdict(audit('char_1050_chen3'), 'skchr_chen3_2').verdict, 'ok');
  assert.equal(verdict(audit('char_608_acpion'), 'skchr_acpion_3').verdict, 'ok');
});

test('kit-named variants and parts: 重岳 S2 whisk / down, 左乐 S1 by HP, 维娜·维多利亚 S1; random pairs both drawn (赫德雷 S2)', { skip: !existsSync(INDEX) }, () => {
  assert.equal(verdict(audit('char_2024_chyue'), 'skchr_chyue_2').verdict, 'ok');
  assert.equal(verdict(audit('char_4121_zuole'), 'skchr_zuole_1').verdict, 'ok');
  assert.equal(verdict(audit('char_4098_vvana'), 'skchr_vvana_1').verdict, 'ok');
  assert.equal(verdict(audit('char_4088_hodrer'), 'skchr_hodrer_2').verdict, 'ok');
  for (const [c, s] of [['char_4027_heyak', 'skchr_heyak_3'], ['char_2012_typhon', 'skchr_typhon_2'], ['char_1045_svash2', 'skchr_svash2_3'], ['char_362_saga', 'skchr_saga_2']]) assert.equal(verdict(audit(c), s).verdict, 'ok', c);
});

test("重岳 S3's blow plays its projectile's hit effect (chyue_skill_03_hit_02), not the normal attack's only", { skip: !existsSync(INDEX) }, () => {
  const out = execFileSync(process.execPath, ['tools/vfx-op-skill-audit.mjs', '--index', INDEX, '--only', 'char_2024_chyue', '--seconds', '90', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26, env: { ...process.env, AUDIT_ALL: '1' } });
  assert.ok(JSON.parse(out).find((r) => r.skill === 'skchr_chyue_3').spawnedAll.includes('chyue_skill_03_hit_02'));
});

// The official effects of operator skills reach the screen in a real sim duel (tools/vfx-op-skill-audit.mjs). Needs an
// extracted effects index (public/assets/local/fx/index.json or SP_FX_INDEX); skipped without one.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const INDEX = process.env.SP_FX_INDEX || `${ROOT}public/assets/local/fx/index.json`;
const audit = (only) => JSON.parse(execFileSync(process.execPath, ['tools/vfx-op-skill-audit.mjs', '--index', INDEX, '--only', only, '--seconds', '45', '--json'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 26 }));
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

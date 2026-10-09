import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATA, makeMatch } from './harness.js';
import { GameData } from '../../server/match/gamedata.js';
import { buildBattleSpec, createBattleFromSpec, compactResult } from '../../server/sim/spec.js';
import { validateClientResult } from '../../server/match/fields.js';
import { planUnite, uniteBattleOpts, uniteSurvivors } from '../../server/match/unite.js';

const gd = new GameData(DATA, 'mode_multi_normal');
const TEAPOT = 'enemy_1203_sfhu';
const CUP = 'enemy_1204_msfhu';
const JESTON = 'enemy_1516_jakill';
const MODS = { hpMul: 1.3, atkMul: 0, speedMul: 0, bountyId: 'tea', bountyCoins: 3 };
const COMBAT_MODS = { hpMul: 1.3, atkMul: 0, speedMul: 0 };
const operator = { uid: 1, chessId: 'chess_char_1_01_a', row: 12, col: 3 };

function start(spec) {
  const b = createBattleFromSpec(spec, DATA, { quiet: true });
  b.step();
  return b;
}
function normal(key = TEAPOT) {
  const spec = buildBattleSpec({ stageId: 'act2autochess_m01', kind: 'normal', timeLimit: 30,
    players: [{ playerId: 'p_0', units: [operator], bonds: {} }],
    spawns: [{ time: 0, enemyKey: key, pos: [10, 7], mods: MODS, sourcePlayerId: 'p_0',
      tag: 'bounty', bounty: { coins: 3, ownerPlayerId: 'p_0' } }] });
  return { spec, b: start(spec) };
}
function checked(spec, b) {
  b.forceEnd('timeout');
  const v = validateClientResult(spec, compactResult(b.result()), { gd });
  assert.equal(v.ok, true, v.reason);
  assert.equal(b.result().errors, 0);
  return v.result;
}
function coop(result, enemyKey = TEAPOT) {
  const h = makeMatch({ mode: 'coop', humans: 2, fake: true }).start();
  h.toPrep(1);
  h.ps('p_0').bounties = [{ id: 'tea', card: { payout: 'kill', coin: 3, enemyKey }, roundsLeft: 1 }];
  h.m.lastResults = new Map([['p_0', result.perPlayer.p_0], ['p_1', { leaked: [], perfect: true, coins: 0, killed: 0, layerGains: {} }]]);
  const plan = planUnite(h.m, h.m.lastResults);
  assert.ok(plan);
  const { wave, players } = uniteBattleOpts(h.m, plan, 30);
  players[0].units = [operator];
  const spec = buildBattleSpec({ kind: 'unite', stageId: wave.stageId, timeLimit: 30, players,
    spawns: wave.spawns, routes: wave.routes, flags: { layerGainsEnabled: false } });
  const b = start(spec);
  while (!b.enemies.length && !b.finished) b.step();
  return { h, plan, spec, b };
}
const killer = (b) => b.units.find((u) => u.uid === 1);

test('烹泉 killed in normal combat pays once; its four leaked cups keep scaling but have no bounty on 联防 re-entry', () => {
  const { spec, b } = normal();
  b.kill(b.enemies[0], killer(b));
  const cups = b.enemies.filter((e) => e.defId === CUP);
  assert.equal(cups.length, 4);
  for (const cup of cups) {
    assert.deepEqual(cup.mods, COMBAT_MODS);
    assert.equal(cup.bounty, null);
    assert.equal(cup.counted, true, 'normal-phase offspring still belong to the normal wave');
  }
  const result = checked(spec, b);
  assert.equal(result.perPlayer.p_0.coins, 3);
  const u = coop(result);
  assert.equal(u.plan.leaked.length, 4);
  assert.ok(u.plan.leaked.every((l) => !l.bounty && !l.mods.bountyId && !l.mods.bountyCoins));
  while (u.b.enemies.length < 4 && !u.b.finished) u.b.step();
  for (const e of u.b.enemies) if (e.alive) u.b.kill(e, killer(u.b));
  const ur = checked(u.spec, u.b);
  assert.equal(ur.perPlayer.p_1.coins, 0, 'cups do not pay the helper again');
  u.h.m.settle(u.plan, ur);
  assert.equal(u.h.ps('p_0').pendingFunds, 3);
  assert.equal(u.h.ps('p_1').pendingFunds, 0);
  u.h.m.dispose();
});

for (const killedCups of [0, 2, 4]) test(`烹泉 killed during 联防: ${killedCups} cups killed, one bounty payout and no offspring LP loss`, () => {
  const n = normal();
  const result = checked(n.spec, n.b);
  const u = coop(result);
  const parent = u.b.enemies.find((e) => e.defId === TEAPOT);
  u.b.kill(parent, killer(u.b));
  const cups = u.b.enemies.filter((e) => e.defId === CUP);
  assert.equal(cups.length, 4);
  assert.equal(parent.alive, false);
  for (const cup of cups) {
    assert.equal(cup.counted, false, 'death spawn is not a second bounty phase');
    assert.deepEqual(cup.mods, COMBAT_MODS);
    assert.equal(cup.sourcePlayerId, 'p_0');
  }
  for (const cup of cups.slice(0, killedCups)) u.b.kill(cup, killer(u.b));
  const ur = checked(u.spec, u.b);
  assert.equal(ur.perPlayer.p_1.coins, 3);
  assert.equal(ur.perPlayer.p_1.perfect, true);
  assert.equal(ur.perPlayer.p_1.leaked.length, 4 - killedCups);
  assert.equal(uniteSurvivors(u.plan, ur).get('p_0') || 0, 0);
  const lp = u.h.ps('p_0').lp;
  u.h.m.settle(u.plan, ur);
  assert.equal(u.h.ps('p_0').lp, lp);
  assert.equal(u.h.ps('p_0').pendingFunds, 0);
  assert.equal(u.h.ps('p_1').pendingFunds, 3, 'only the helper who killed the bounty gets paid');
  u.h.m.dispose();
});

test('an unbeaten bounty in 联防 still costs its original player LP and pays no helper', () => {
  const n = normal();
  const u = coop(checked(n.spec, n.b));
  const ur = checked(u.spec, u.b);
  const lp = u.h.ps('p_0').lp;
  u.h.m.settle(u.plan, ur);
  assert.equal(u.h.ps('p_0').lp, lp - 1);
  assert.equal(u.h.ps('p_1').pendingFunds, 0);
  u.h.m.dispose();
});

for (const kind of ['normal', 'unite']) test(`杰斯顿 in ${kind}: both real phases must be defeated before its single payout`, () => {
  const n = normal(JESTON);
  let spec = n.spec, b = n.b, u = null;
  if (kind === 'unite') { u = coop(checked(spec, b), JESTON); ({ spec, b } = u); }
  const e = b.enemies.find((enemy) => enemy.defId === JESTON);
  const pid = kind === 'unite' ? 'p_1' : 'p_0';
  b.kill(e, killer(b));
  assert.equal(e.alive, true);
  assert.equal(b.result().perPlayer[pid].coins, 0);
  assert.equal(b.result().perPlayer[pid].killed, 0);
  const until = b.time + 4.2;
  while (b.time < until && !b.finished) b.step();
  assert.equal(e.form, 'form2');
  b.kill(e, killer(b));
  assert.equal(e.alive, false);
  const result = checked(spec, b);
  assert.equal(result.perPlayer[pid].coins, 3);
  assert.equal(result.perPlayer[pid].killed, 1);
  if (u) u.h.m.dispose();
});

test('杰斯顿 with only its first phase defeated during 联防 remains an unpaid, counted survivor', () => {
  const n = normal(JESTON);
  const u = coop(checked(n.spec, n.b));
  u.b.kill(u.b.enemies[0], killer(u.b));
  const result = checked(u.spec, u.b);
  assert.equal(result.perPlayer.p_1.coins, 0);
  assert.equal(uniteSurvivors(u.plan, result).get('p_0'), 1);
  const lp = u.h.ps('p_0').lp;
  u.h.m.settle(u.plan, result);
  assert.equal(u.h.ps('p_0').lp, lp - 1);
  u.h.m.dispose();
});

test('ordinary non-bounty death spawns retain their 联防 wave count', () => {
  const n = normal();
  const spec = structuredClone(n.spec);
  spec.kind = 'unite';
  spec.spawns[0].mods = COMBAT_MODS;
  delete spec.spawns[0].bounty;
  const b = start(spec);
  b.kill(b.enemies[0], killer(b));
  assert.equal(b.enemies.filter((e) => e.defId === CUP && e.counted).length, 4);
  assert.equal(checked(spec, b).perPlayer.p_0.leaked.length, 4);
});

test('four ordinary death-spawned cups cost four base HP after surviving cooperative defense', () => {
  const n=normal();
  const spec=structuredClone(n.spec);
  spec.spawns[0].mods=COMBAT_MODS;
  delete spec.spawns[0].bounty;
  const b=start(spec);
  b.kill(b.enemies[0],killer(b));
  const normalResult=checked(spec,b);
  assert.equal(normalResult.perPlayer.p_0.leaked.filter(e=>e.counted).length,4);
  const u=coop(normalResult);
  const result=checked(u.spec,u.b);
  assert.equal(uniteSurvivors(u.plan,result).get('p_0'),4);
  const hp=u.h.ps('p_0').lp;
  u.h.m.settle(u.plan,result);
  assert.equal(u.h.ps('p_0').lp,hp-4);
  u.h.m.dispose();
});

import { loadData } from '../../server/data.js';
// test/match/potential.test.js — the player's 潜能 / 练度 on the server (0.2.2, the owner's decision of 2026-10-08:
// 「调配干员里自己设置吧，默认满潜满加成」): room.loadout `ops` (shared/protocol.js checkLoadoutOps) → seats[].ops →
// PlayerState.ops (re-checked, frozen; bots none) → every owned operator's PlayerBattleInput entry states `potential` /
// `cultivate` (defaults 6 / 3 — also an old loadout without ops), never a 补位 stand-in or a prototype 自选 pick; the
// 自选 summons' hand count follows the owner's potential; m.private.ops; the scouting units; Match.setLoadout takes
// them in INFO_CHECK only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERR, PHASE } from '../../shared/constants.js';
import { validateC2S, checkLoadoutOps, isLoadoutOps, cultivationCharIds, LOADOUT_LIMITS, charPotentialChanges } from '../../shared/protocol.js';
import { expandRecords } from '../../shared/plugins/records.js';
import { guard } from '../helpers/contentFixtures.js';
import { buildBattleSpec, createBattleFromSpec } from '../../server/sim/spec.js';
import { DATA, makeMatch } from './harness.js';

const chess = (id) => (Object.hasOwn(DATA.chess, id) ? DATA.chess[id] : null);
const VENDLA = 'chess_char_1_06_a';                 // 刺玫 (PRESET)
const VENDLA_CHAR = chess(VENDLA).charId;
const GRANI = Object.values(DATA.chess).find((c) => c.chessType === 'NORMAL' && !c.isGolden && c.visible && c.backup?.charId && c.backup.charId !== c.charId);
const T6A = 'chess_char_6_diy1_a';
const T5A = 'chess_char_5_diy1_a';
const KALTS = 'char_003_kalts';
const WANG = 'char_2027_wang';
const SHARP = 'char_609_acguad';
const IDS = cultivationCharIds(DATA.chess, DATA.backups);

function place(ps, chessId, row, col) {
  const p = ps.newPiece('chess', chessId);
  ps.board.set(`${row},${col}`, p);
  return p;
}

test('room.loadout ops: structure (≤ 256 charIds → { potential 1–6?, cultivate 0–3? }) and the strict data check', () => {
  const ok = (ops) => validateC2S({ t: 'room.loadout', entries: {}, ops }) === null;
  assert.ok(validateC2S({ t: 'room.loadout', entries: {} }) === null, 'ops optional (an older client)');
  assert.ok(ok({}));
  assert.ok(ok({ [VENDLA_CHAR]: { potential: 1 } }));
  assert.ok(ok({ [VENDLA_CHAR]: { cultivate: 0 } }));
  assert.ok(ok({ [VENDLA_CHAR]: { potential: 6, cultivate: 3 } }));
  for (const bad of [[], null, { [VENDLA_CHAR]: {} }, { [VENDLA_CHAR]: { potential: 0 } }, { [VENDLA_CHAR]: { potential: 6.5 } },
    { [VENDLA_CHAR]: { cultivate: -1 } }, { [VENDLA_CHAR]: { cultivate: 4 } }, { [VENDLA_CHAR]: { potential: '3' } }, { 'a b': { potential: 1 } },
    { [VENDLA_CHAR]: { potential: 1, trust: 100 } }]) assert.ok(!ok(bad), JSON.stringify(bad));
  const many = Object.fromEntries(Array.from({ length: LOADOUT_LIMITS.ops + 1 }, (_, i) => [`char_${i}`, { potential: 1 }]));
  assert.ok(!isLoadoutOps(many));
  // the operators one may set: the 112-chess roster's charIds (hidden twins share them) and the 71 owned 自选 picks
  assert.ok(IDS.has(VENDLA_CHAR) && IDS.has(KALTS) && IDS.has(WANG));
  assert.ok(!IDS.has(SHARP) && !IDS.has(GRANI.backup.charId), 'a prototype / stand-in character is no setting');
  assert.ok(IDS.size >= 180 && IDS.size <= 200, `${IDS.size}`);
  const has = (id) => IDS.has(id);
  assert.deepEqual(checkLoadoutOps(undefined, has), { ok: true, ops: {} });
  assert.deepEqual(checkLoadoutOps({ [VENDLA_CHAR]: { potential: 2 }, [KALTS]: { potential: 6, cultivate: 3 } }, has), { ok: true, ops: { [VENDLA_CHAR]: { potential: 2, cultivate: 3 } } });
  assert.equal(checkLoadoutOps({ [SHARP]: { potential: 2 } }, has).error, 'BAD_TARGET');
  assert.equal(checkLoadoutOps({ [VENDLA_CHAR]: { potential: 9 } }, has).error, 'BAD_MSG');
});

test('a plugin operator without a potential curve accepts only the default potential', () => {
  const expanded = expandRecords(DATA, [guard()], { pluginId: 'data-demo' });
  assert.deepEqual(expanded.problems, []);
  const id = 'char_x_data_demo_guard';
  const changes = (charId) => charPotentialChanges(expanded.data, charId);
  const isOp = (charId) => charId === id || charId === 'char_616_pithst' || IDS.has(charId);
  assert.equal(changes(id), false);
  assert.equal(checkLoadoutOps({ [id]: { potential: 1 } }, isOp, changes).error, 'BAD_TARGET');
  assert.deepEqual(checkLoadoutOps({ [id]: { potential: 6 } }, isOp, changes), { ok: true, ops: {} });
  assert.deepEqual(checkLoadoutOps({ [id]: { cultivate: 1 } }, isOp, changes).ops[id], { potential: 6, cultivate: 1 });
  assert.equal(checkLoadoutOps({ [id]: { potential: 1 } }, isOp).ok, true);
  assert.equal(checkLoadoutOps({ [VENDLA_CHAR]: { potential: 2 } }, isOp, changes).ok, true);
  assert.equal(checkLoadoutOps({ char_616_pithst: { potential: 2 } }, isOp, changes).ok, true);
});

test('battle input: every owned operator states 潜能 / 练度 — the human\'s settings, the defaults (6 / 3) for the rest, for a seat without ops and for bots', () => {
  const ops = { [VENDLA_CHAR]: { potential: 1, cultivate: 0 } };
  const seats = [
    { seat: 0, playerId: 'p_0', name: 'P0', isBot: false, connected: true, loadout: null, ops },
    { seat: 1, playerId: 'p_1', name: 'P1', isBot: false, connected: true, loadout: {} },  // an old seat: no ops
    { seat: 2, playerId: 'ai_0', name: 'AI0', isBot: true, connected: true, ops },
  ];
  const h = makeMatch({ mode: 'coop', seats, seed: 3 }).start();
  const m = h.m;
  const [p0, p1, bot] = ['p_0', 'p_1', 'ai_0'].map((id) => h.ps(id));
  assert.deepEqual(p0.ops, { [VENDLA_CHAR]: { potential: 1, cultivate: 0 } });
  assert.ok(Object.isFrozen(p0.ops) && Object.isFrozen(p0.ops[VENDLA_CHAR]));
  assert.deepEqual([p1.ops, bot.ops], [{}, {}], 'no settings / a bot: the defaults');
  h.flushAll();
  assert.deepEqual(h.lastTo('p_0', 'm.private').ops, p0.ops, 'm.private exposes the effective settings');
  h.toPrep(1);
  for (const ps of [p0, p1, bot]) { for (const p of [...ps.board.values()]) ps.returnCopies(p); ps.board.clear(); }
  place(p0, VENDLA, 9, 3);
  place(p0, chess(VENDLA).goldenId, 10, 3);
  place(p0, 'chess_char_1_02_a', 11, 3);
  place(p0, GRANI.chessId, 12, 3);           // not owned: its stand-in
  place(p1, VENDLA, 9, 3);
  place(bot, VENDLA, 9, 3);
  const by = (ps, id) => ps.battleInput().units.find((u) => u.chessId === id);
  assert.deepEqual([by(p0, VENDLA).potential, by(p0, VENDLA).cultivate], [1, 0], 'the human\'s setting');
  assert.deepEqual([by(p0, chess(VENDLA).goldenId).potential, by(p0, chess(VENDLA).goldenId).cultivate], [1, 0], 'the elite shares the charId');
  assert.deepEqual([by(p0, 'chess_char_1_02_a').potential, by(p0, 'chess_char_1_02_a').cultivate], [6, 3], 'no entry: 满潜满加成');
  assert.deepEqual([by(p0, GRANI.chessId).potential, by(p0, GRANI.chessId).cultivate], [6, 3], 'ordinary roster operators keep default cultivation');
  assert.deepEqual([by(p1, VENDLA).potential, by(p1, VENDLA).cultivate], [6, 3], 'an old loadout: the defaults');
  assert.deepEqual([by(bot, VENDLA).potential, by(bot, VENDLA).cultivate], [6, 3], 'bots: the defaults');
  // the spec keeps them and the battle fields them
  const spec = buildBattleSpec(m._normalOpts(p0));
  const b = createBattleFromSpec(spec, undefined, { quiet: true });
  const u = b.allyUnits.find((x) => x.defId === VENDLA);
  const e = b.allyUnits.find((x) => x.defId === 'chess_char_1_02_a');
  assert.deepEqual([u.base.atk, u.base.cost, u.cultivate, u.s.atk], [413, 17, 0, 413]);
  assert.deepEqual([e.cultivate, e.s.maxHp], [3, e.base.maxHp * 1.1]);
  // the scouting units carry them (a teammate's card)
  const scout = m.prepFieldMeta(p0).units;
  const sv = scout.find((x) => x.defId === VENDLA);
  assert.deepEqual([sv.potential, sv.cultivate], [1, 0]);
  const sg = scout.find((x) => x.defId === GRANI.chessId);
  assert.deepEqual([sg.potential, sg.cultivate], [undefined, 3]);
  assert.deepEqual([scout.find((x) => x.defId === 'chess_char_1_02_a').potential, scout.find((x) => x.defId === 'chess_char_1_02_a').cultivate], [undefined, 3]);
  m.dispose();
});

test('integrated recruits: settings reach selected operators, prototypes are excluded, summon count follows potential', () => {
  const data=loadData(new URL('../../.cache/ursus-data/',import.meta.url).pathname);
  const find=(charId,tier)=>Object.values(data.chess).find(c=>c.optionalRecruit&&!c.isGolden&&c.charId===charId&&c.tier===tier);
  const k=find(KALTS,6),s=find(SHARP,5),w=find(WANG,6);
  assert.ok(k&&s&&w);
  const loadout=Object.fromEntries([k,s,w].map(c=>[c.chessId,{selected:true,skill:c.skill.index,module:null}]));
  const ops={ [KALTS]:{potential:2,cultivate:1},[WANG]:{potential:2} };
  const seats=[{seat:0,playerId:'p_0',name:'P0',isBot:false,connected:true,loadout,ops}];
  const h=makeMatch({mode:'solo',seats,data,seed:7}).start();
  try {
    h.toPrep(1);const ps=h.ps('p_0');
    for(const p of [...ps.board.values()])ps.returnCopies(p);ps.board.clear();
    place(ps,k.chessId,10,3);place(ps,s.chessId,10,5);
    const units=ps.battleInput().units;
    const ku=units.find(u=>u.chessId===k.chessId),su=units.find(u=>u.chessId===s.chessId);
    assert.deepEqual([ku.potential,ku.cultivate],[2,1]);
    assert.deepEqual(['potential' in su,'cultivate' in su],[false,false]);
    const lo=ps.loadoutFor(w);assert.equal(lo.potential,2);
    const count=pot=>ps.gd.placeableTokens(w.chessId,{...lo,potential:pot})[0].count;
    assert.equal(count(2),6);assert.equal(count(6),7);
  } finally {h.m.dispose();}
});

test('Match.setLoadout: settings remain editable through strategy selection; re-checked; a refusal changes nothing', () => {
  const h = makeMatch({ mode: 'coop', humans: 2, bots: 1, seed: 4 }).start();
  const m = h.m;
  const ps = h.ps('p_0');
  assert.deepEqual(ps.ops, {});
  assert.deepEqual(m.setLoadout('p_0', {}, { [VENDLA_CHAR]: { potential: 3 } }), { ok: true });
  assert.deepEqual(ps.ops, { [VENDLA_CHAR]: { potential: 3, cultivate: 3 } });
  assert.deepEqual(m.setLoadout('p_0', {}), { ok: true }, 'no ops argument: unchanged');
  assert.deepEqual(ps.ops, { [VENDLA_CHAR]: { potential: 3, cultivate: 3 } });
  assert.equal(m.setLoadout('p_0', {}, { [SHARP]: { potential: 1 } }).error, ERR.BAD_TARGET);
  assert.equal(m.setLoadout('p_0', { chess_char_1_01_a: { skill: 0 } }, { [VENDLA_CHAR]: { potential: 9 } }).error, ERR.BAD_TARGET);
  assert.deepEqual([ps.ops, ps.loadout], [{ [VENDLA_CHAR]: { potential: 3, cultivate: 3 } }, {}], 'a refusal changes nothing');
  assert.deepEqual(m.setLoadout('p_0', {}, null), { ok: true }, 'null: none set');
  assert.deepEqual(ps.ops, {});
  for (const id of ['p_0', 'p_1']) m.handle(id, { t: 'g.infoReady' });
  h.sched.advance(1);
  assert.equal(m.phase, PHASE.BAND_DRAFT);
  assert.deepEqual(m.setLoadout('p_0', {}, { [VENDLA_CHAR]: { potential: 1 } }), {ok:true}, 'strategy selection remains editable');
  assert.equal(ps.ops[VENDLA_CHAR].potential,1);
  h.toPrep(1);
  assert.equal(m.setLoadout('p_0', {}, { [VENDLA_CHAR]: { potential: 2 } }).error,ERR.WRONG_PHASE,'locked after strategy selection');
  assert.equal(ps.ops[VENDLA_CHAR].potential,1);
  m.dispose();
});

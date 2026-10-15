// Layer cap and uncapped boss damage for the Korean custom ruleset.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BOND_LAYER_CAP, BOSS_HIT_LIMIT, layerGainRoom } from '../../shared/constants.js';
import { makeBattle, chessRec, enemyRec } from '../helpers/battleHarness.js';
import { gainLayers } from '../../server/sim/content/support/index.js';
import { SharedBossPool } from '../../server/match/finalAssault.js';
import { LocalBossPool, resultDigest } from '../../server/sim/spec.js';


test('switches: BOND_LAYER_CAP = 999 (MAX_GARRISON_STACK), BOSS_HIT_LIMIT = 300000 (default clamping ceiling)', () => {
  assert.equal(BOND_LAYER_CAP, 999);
  assert.equal(BOSS_HIT_LIMIT, 300000);
});

test('layerGainRoom: min(n, 999 − before), never negative, never lowers a count; +Infinity = the room left', () => {
  assert.equal(layerGainRoom(0, 5), 5);
  assert.equal(layerGainRoom(990, 5), 5);
  assert.equal(layerGainRoom(995, 10), 4, 'clamped to 999');
  assert.equal(layerGainRoom(999, 1), 0, 'a gain at the cap adds 0');
  assert.equal(layerGainRoom(1200, 3), 0, 'a count over the cap (a test write) gains 0 and is not lowered');
  assert.equal(layerGainRoom(300, Infinity), 699);
  assert.equal(layerGainRoom(undefined, 7), 7);
  assert.equal(layerGainRoom(NaN, 7), 7);
  for (const bad of [0, -3, NaN, null, undefined]) assert.equal(layerGainRoom(10, bad), 0);
});

// ---------------------------------------------------------------------------------------------------------------
// in-battle layer gains (the live copy, as the client's AddBondCount)

const opRec = (o = {}) => chessRec({ id: 't_op', profession: 'WARRIOR', stats: { atk: 300, maxHp: 1e6 }, skill: null, bonds: ['yanShip'], ...o });
function layerBattle(bonds, extra = {}) {
  return makeBattle({
    defs: { chess: { t_op: opRec() } },
    players: [{ playerId: 'P', seat: 0, side: 'L', colOffset: 0, units: [{ uid: 1, chessId: 't_op', row: 10, col: 4 }], bonds, playerEffects: [] }],
    content: 'none', autoFinish: false, ...extra,
  });
}

test('Battle.addLayers: clamps the live copy at 999; the event and layerGains carry what was added; at the cap: 0, no hook, no event', () => {
  const h = layerBattle({ yanShip: { count: 3, active: true, tier: 1, layers: 990 } });
  h.step();
  const b = h.b;
  assert.equal(b.addLayers('P', 'yanShip', 4, 'garrison'), 4);
  assert.equal(b.getPlayer('P').bonds.yanShip.layers, 994);
  assert.equal(b.addLayers('P', 'yanShip', 20, 'garrison'), 5, 'only the room left (999 − 994)');
  assert.equal(b.getPlayer('P').bonds.yanShip.layers, 999);
  const hooks0 = h.hooksOf('layerGain').length;
  assert.equal(b.addLayers('P', 'yanShip', 3, 'garrison'), 0, 'a gain at the cap adds 0');
  assert.equal(h.hooksOf('layerGain').length, hooks0, 'no layerGain hook at the cap');
  assert.equal(b.getPlayer('P').bonds.yanShip.layers, 999);
  assert.deepEqual(h.eventsOf('layer').map((e) => e[3]), [4, 5], "'layer' events carry the clamped gains, none at the cap");
  assert.equal(h.result().perPlayer.P.layerGains.yanShip, 9, 'the result reports what was added');
});

test('Battle.addLayers: a layerGain hook that raises n (魔王 +1) is clamped after the hook', () => {
  const h = layerBattle({ yanShip: { count: 3, active: true, tier: 1, layers: 997 } }, {
    setup: (b) => b.on('layerGain', (c) => { c.n += 5; }),
  });
  h.step();
  assert.equal(h.b.addLayers('P', 'yanShip', 1, 'garrison'), 2, '1 + 5 asked, 2 room');
  assert.equal(h.b.getPlayer('P').bonds.yanShip.layers, 999);
});

test('Battle.addLayers without a live copy of the bond (partial input): the battle\'s own gains stop at 999', () => {
  const h = layerBattle({});
  h.step();
  assert.equal(h.b.addLayers('P', 'kjeragShip', 600, 'bond'), 600);
  assert.equal(h.b.addLayers('P', 'kjeragShip', 600, 'bond'), 399);
  assert.equal(h.b.addLayers('P', 'kjeragShip', 1, 'bond'), 0);
  assert.equal(h.result().perPlayer.P.layerGains.kjeragShip, 999);
});

test('support.gainLayers (特质 / bond gains): returns the clamped total; a capped bond counts nothing toward the per-battle cap', () => {
  const h = layerBattle({ yanShip: { count: 3, active: true, tier: 1, layers: 998 }, kjeragShip: { count: 2, active: true, tier: 1, layers: 10 } });
  h.step();
  assert.equal(gainLayers(h.b, { playerId: 'P', bonds: ['yanShip', 'kjeragShip'], n: 3, reason: 'garrison' }), 1 + 3);
  assert.equal(gainLayers(h.b, { playerId: 'P', bonds: 'yanShip', n: 3, reason: 'garrison', cap: 24, capKey: 'g' }), 0);
  const ps = h.b.getPlayer('P');
  assert.deepEqual([ps.bonds.yanShip.layers, ps.bonds.kjeragShip.layers], [999, 13]);
});

test('layer gains stay disabled in boss / 联防 fields (unchanged)', () => {
  const h = layerBattle({ yanShip: { count: 3, active: true, tier: 1, layers: 10 } }, { kind: 'boss' });
  h.step();
  assert.equal(h.b.addLayers('P', 'yanShip', 5, 'garrison'), 0);
});

// Boss damage is uncapped; mitigation and shields still apply.
const guardRec = () => chessRec({ id: 't_guard', profession: 'WARRIOR', stats: { atk: 10, maxHp: 1e9 }, skill: null });
/** A field of `kind` with a leader (tag 'boss'), a minion and a part, all standing still; the shared pool when given. */
function hitField({ kind = 'boss', pool = null, leaderDef = 0, leaderRes = 0, maxDamage = 0 } = {}) {
  const h = makeBattle({
    kind, sharedBoss: pool, flags:{customExtensions:{ruleValues:{maxDamage}}},
    defs: {
      chess: { t_guard: guardRec() },
      enemies: {
        enemy_lead: enemyRec({ key: 'enemy_lead', rank: 'BOSS', hp: 1e9, speed: 0, def: leaderDef, res: leaderRes }),
        enemy_mini: enemyRec({ key: 'enemy_mini', hp: 1e9, speed: 0 }),
        enemy_part: enemyRec({ key: 'enemy_part', rank: 'ELITE', hp: 1e9, speed: 0 }),
      },
    },
    players: [{ playerId: 'P', seat: 0, side: 'L', colOffset: 0, units: [{ uid: 1, chessId: 't_guard', row: 10, col: 2 }], bonds: {}, playerEffects: [] }],
    enemies: kind === 'boss' || kind === 'hidden'
      ? [{ key: 'enemy_lead', pos: [3, 9], tag: 'boss' }, { key: 'enemy_mini', pos: [3, 12] }, { key: 'enemy_part', pos: [4, 12], tag: 'part' }]
      : [{ key: 'enemy_lead', pos: [10, 9], tag: 'boss' }, { key: 'enemy_mini', pos: [11, 9] }],
    content: 'none', autoFinish: false,
  });
  h.step();
  const leader = h.enemy('enemy_lead');
  const op = h.unit(1);
  assert.ok(leader && leader.isBoss, 'the leader is a boss unit');
  return { h, b: h.b, leader, mini: h.enemy('enemy_mini'), part: h.enemy('enemy_part'), op };
}
const capEvents = (h) => h.eventsOf('fx').filter((e) => e[1] === 'hitCap');


for(const kind of ['boss','hidden'])for(const amount of [299999,299999.2,300000,669936,10000000]){
 test(`${kind}: a ${amount} damage hit lands fully and credits the shared pool`,()=>{
  const pool=new SharedBossPool(1e9),{h,b,leader,op}=hitField({kind,pool});
  assert.ok(Math.abs(b.dealDamage(op,leader,{amount,type:'true'})-amount)<1e-6);
  assert.equal(pool.hp,1e9-amount);assert.ok(Math.abs(pool.byPlayer.get('P')-amount)<1e-6);
  assert.ok(Math.abs(op.stats.dmg-amount)<1e-6);assert.ok(Math.abs(b._pp('P').bossDamage-amount)<1e-6);
  assert.equal(capEvents(h).length,0);assert.equal(h.hooksOf('damaged').length,1);
 });
}
for(const kind of ['boss','hidden'])for(const type of ['phys','arts','true','elemental']){
 test(`${kind}: ${type} damage and periodic hits above 300000 are not cancelled`,()=>{
  const {h,b,leader,op}=hitField({kind}),hp=leader.hp;
  assert.equal(b.dealDamage(op,leader,{amount:1000000,type,tags:['dot','periodic']}),1000000);
  assert.equal(leader.hp,hp-1000000);assert.equal(capEvents(h).length,0);
 });
}
for(const kind of ['boss','hidden'])test(`${kind}: uncapped HP loss can defeat the whole shared boss pool`,()=>{
 const pool=new SharedBossPool(5000000),{b,leader,op}=hitField({kind,pool});
 assert.equal(b.loseHp(leader,5000000,{source:op}),5000000);assert.equal(pool.hp,0);
});
test('uncapped damage still respects physical defence, resistance, vulnerability and shields',()=>{
 const {b,leader,op}=hitField({leaderDef:100000,leaderRes:50});
 assert.equal(b.dealDamage(op,leader,{amount:1000000,type:'phys'}),900000);
 assert.equal(b.dealDamage(op,leader,{amount:1000000,type:'arts'}),500000);
 b.addBuff(leader,{key:'test:vuln',mods:{dmgTakenMul:2}});
 b.addBuff(leader,{key:'test:shield',shield:100000});
 assert.equal(b.dealDamage(op,leader,{amount:1000000,type:'true'}),1900000);
});
test('uncapped client-side boss pool matches the server and remains deterministic',()=>{
 const run=()=>{const pool=new LocalBossPool(10000000),{h,b,leader,op}=hitField({pool});b.dealDamage(op,leader,{amount:5000000,type:'true'});assert.equal(pool.hp,5000000);assert.equal(op.stats.dmg,5000000);assert.equal(capEvents(h).length,0);return resultDigest(b.result());};
 assert.deepEqual(run(),run());
});

for(const kind of ['boss','hidden'])for(const maxDamage of [null,100000,700000,0])test(`${kind}: configured maxDamage ${maxDamage??'default'} clamps excess rather than cancelling`,()=>{
 const pool=new SharedBossPool(10000000),{b,leader,op}=hitField({kind,pool,maxDamage});const expected=maxDamage===0?1000000:Math.min(1000000,maxDamage??300000);
 assert.equal(b.dealDamage(op,leader,{amount:1000000,type:'true'}),expected);assert.equal(pool.hp,10000000-expected);assert.equal(pool.byPlayer.get('P'),expected);
 assert.equal(b.loseHp(leader,1000000,{source:op}),expected);
});
test('boss ceiling does not cap ordinary enemies, bounty leaders or normal battle damage',()=>{
 const {b,mini,part,op}=hitField({maxDamage:100});assert.equal(b.dealDamage(op,mini,{amount:1000000,type:'true'}),1000000);assert.equal(b.dealDamage(op,part,{amount:1000000,type:'true'}),1000000);
 const {b:normal,leader,op:source}=hitField({kind:'normal',maxDamage:100});assert.equal(normal.dealDamage(source,leader,{amount:1000000,type:'true'}),1000000);
});

// Observing rules of the client (public/js/battle/observe.js, research 09 §3.1 / §6.3) — the mirror of the server's
// Match._watchClient: prep boards, no observing while the own normal battle runs, a teammate's field once it is over,
// the other pair's boss field hidden, eliminated players free; the 联防 / 最终攻势 camera halves and their captions;
// a reloaded screen that watched a teammate's battle takes the watch back (resumedWatch).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {PHASE} from '../../shared/constants.js';
import { observeTarget, teammateProgress, cameraLayers, layerCamera, isClientCombat, resumedWatch } from '../../public/js/battle/observe.js';

const P = (id, seat, extra = {}) => ({ playerId: id, seat, name: id.toUpperCase(), alive: true, ...extra });
const pubOf = (phase, fields, players) => ({ phase, combatMode: 'client', fields, players });

test('observeTarget: prep, own battle running / over, boss pairs, eliminated players', () => {
  const players = [P('a', 0), P('b', 1), P('c', 2, { alive: false })];
  assert.equal(isClientCombat(pubOf('PREP', [], players)), true);
  assert.deepEqual(observeTarget(players[1], pubOf('PREP', [], players), 'a'), { fieldId: 'n:b' });
  assert.match(observeTarget(players[2], pubOf('PREP', [], players), 'a').reason, /淘汰/);
  const combat = (liveA) => pubOf('COMBAT', [
    { fieldId: 'n:a', kind: 'normal', players: ['a'], live: liveA },
    { fieldId: 'n:b', kind: 'normal', players: ['b'], live: true, progress: { killed: 3, total: 8, done: false } },
  ], players);
  assert.match(observeTarget(players[1], combat(true), 'a').reason, /作战中无法查看/);
  assert.deepEqual(observeTarget(players[1], combat(true), 'a', { ownDone: true }), { fieldId: 'n:b' }, 'the local battle already ended');
  assert.deepEqual(observeTarget(players[1], combat(false), 'a'), { fieldId: 'n:b' });
  assert.deepEqual(observeTarget(players[0], combat(false), 'a', { observing: true }), { back: true });
  assert.deepEqual(teammateProgress(combat(false), 'a'), [{ playerId: 'b', name: 'B', isBot: false, killed: 3, total: 8, done: false }]);
  const fa = pubOf('FINAL_ASSAULT', [
    { fieldId: 'b1', kind: 'boss', players: ['a', 'b'], live: true },
    { fieldId: 'b2', kind: 'boss', players: ['d'], live: true },
  ], [...players, P('d', 3)]);
  assert.deepEqual(observeTarget(P('d', 3), fa, 'a'), { fieldId: 'b2' });
  assert.match(observeTarget(players[1], fa, 'a').reason, /同一战场/);
  const dead = pubOf('FINAL_ASSAULT', fa.fields, [{ ...players[0], alive: false }, players[1], P('d', 3)]);
  assert.deepEqual(observeTarget(P('d', 3), dead, 'a'), { fieldId: 'b2' }, 'eliminated: anything');
});

test('cameraLayers: ‹ LEFT / 全景 / RIGHT › with "你自己" / name / "无人在家"; none for normal or single boss fields', () => {
  const pub = { players: [P('a', 0), P('b', 1)] };
  const unite = { fieldId: 'u', kind: 'unite', rect: { r0: 9, r1: 12, c0: 0, c1: 20 }, players: ['a', 'b'], sides: { a: 'R', b: 'L' } };
  assert.deepEqual(cameraLayers(unite, pub, 'a').map((l) => [l.key, l.label]), [['L', 'B'], ['ALL', '全景'], ['R', '你自己']]);
  const single = { ...unite, players: ['b'], sides: { b: 'L' } };
  assert.deepEqual(cameraLayers(single, pub, 'a').map((l) => l.label), ['B', '全景', '无人在家']);
  assert.deepEqual(cameraLayers({ kind: 'normal' }, pub, 'a'), []);
  assert.deepEqual(cameraLayers({ kind: 'boss', players: ['a'], sides: { a: 'L' } }, pub, 'a'), [], 'a solo boss field has no halves');
  assert.deepEqual(layerCamera(unite, 'R', 'R'), { rect: unite.rect, side: 'R', half: true });
  assert.deepEqual(layerCamera(unite, 'ALL', 'R'), { rect: unite.rect, side: 'R' });
});

test('resumedWatch: a reload while watching a teammate\'s battle adopts the resent field once per battle (review, DESIGN §20.15)', () => {
  const players = [P('a', 0), P('b', 1), P('c', 2)];
  const pub = pubOf('COMBAT', [
    { fieldId: 'n:a', kind: 'normal', players: ['a'], live: false },
    { fieldId: 'n:b', kind: 'normal', players: ['b'], live: true },
  ], players);
  const watched = { battleId: 'r3-n:b', fieldId: 'n:b', kind: 'normal', watch: true, done: false };
  const own = { battleId: 'r3-n:a', fieldId: 'n:a', kind: 'normal', watch: false, done: true };
  const o = { pub, myId: 'a', alive: true, watching: null, seen: null };
  // the reload: the server resends b's battle (b.start watch: true) to a screen at home
  assert.deepEqual(resumedWatch(watched, o), { seen: 'r3-n:b', fieldId: 'n:b' });
  // once per battle: after 返回战场 (watching null again) the same battle, still shown until the own b.start, stays put
  assert.deepEqual(resumedWatch(watched, { ...o, seen: 'r3-n:b' }), { seen: 'r3-n:b', fieldId: null });
  // first seen while watching (a 前往查看 under way): marked, never adopted later
  assert.deepEqual(resumedWatch(watched, { ...o, watching: 'n:b' }), { seen: 'r3-n:b', fieldId: null });
  // loading (no `watch` in that state yet): undecided while watching nothing, marked when already watching
  const loading = { loading: true, battleId: 'r3-n:b', fieldId: 'n:b', kind: 'normal' };
  assert.deepEqual(resumedWatch(loading, o), { seen: null, fieldId: null });
  assert.deepEqual(resumedWatch(loading, { ...o, watching: 'n:b' }), { seen: 'r3-n:b', fieldId: null });
  // the own battle, no battle, no m.public yet (undecided)
  assert.deepEqual(resumedWatch(own, o), { seen: 'r3-n:a', fieldId: null });
  assert.deepEqual(resumedWatch({ ...watched, fieldId: 'n:a' }, o), { seen: 'r3-n:b', fieldId: null }, 'a field listing the viewer');
  assert.deepEqual(resumedWatch(null, o), { seen: null, fieldId: null });
  assert.deepEqual(resumedWatch(watched, { ...o, pub: null }), { seen: null, fieldId: null });
  // other rules keep theirs: an eliminated player's auto-observe, 联防 / boss fields, other phases, server-run combat
  assert.deepEqual(resumedWatch(watched, { ...o, alive: false }), { seen: 'r3-n:b', fieldId: null });
  const unite = pubOf('UNITE', [{ fieldId: 'u', kind: 'unite', players: ['b', 'c'], live: true }], players);
  assert.deepEqual(resumedWatch({ battleId: 'r3-u', fieldId: 'u', kind: 'unite', watch: true }, { ...o, pub: unite }), { seen: 'r3-u', fieldId: null }, 'a 联防 leaker');
  assert.deepEqual(resumedWatch(watched, { ...o, pub: { ...pub, phase: 'UNITE' } }), { seen: 'r3-n:b', fieldId: null });
  assert.deepEqual(resumedWatch(watched, { ...o, pub: { ...pub, combatMode: 'server' } }), { seen: 'r3-n:b', fieldId: null });
  assert.deepEqual(resumedWatch({ ...watched, fieldId: 'n:x' }, o), { seen: 'r3-n:b', fieldId: null }, 'a field not listed');
});

test('spectator target follows the selected player through prep, ordinary combat and boss pairing',async()=>{
 const {spectatorTarget}=await import('../../public/js/battle/observe.js');
 const players=['p0','p1','p2','p3'].map(playerId=>({playerId,alive:true}));
 const pub={players,phase:PHASE.PREP,fields:[]};
 assert.deepEqual(spectatorTarget(pub,'p2'),{playerId:'p2',fieldId:'n:p2'});
 pub.phase=PHASE.COMBAT;pub.fields=players.map(p=>({fieldId:'n:'+p.playerId,players:[p.playerId]}));
 assert.deepEqual(spectatorTarget(pub,'p2'),{playerId:'p2',fieldId:'n:p2'});
 pub.phase=PHASE.FINAL_ASSAULT;pub.fields=[{fieldId:'boss:0',players:['p0','p1']},{fieldId:'boss:1',players:['p2','p3']}];
 assert.deepEqual(spectatorTarget(pub,'p2'),{playerId:'p2',fieldId:'boss:1'});
 pub.phase=PHASE.PREP;pub.fields=[];
 assert.deepEqual(spectatorTarget(pub,'p2'),{playerId:'p2',fieldId:'n:p2'});
 players[2].alive=false;
 assert.equal(spectatorTarget(pub,'p2').playerId,'p0','fallback only after the chosen player is unavailable');
});

test('laboratory solo boss fights expose the regular left/full/right camera controls',()=>{
 const field={kind:'boss',players:['a'],sides:{a:'L'},rect:{r0:0,r1:5,c0:0,c1:15}};
 assert.deepEqual(cameraLayers(field,{laboratory:{},players:[P('a',0)]},'a').map(l=>l.key),['L','ALL','R']);
 assert.deepEqual(cameraLayers({...field,kind:'hidden'},{laboratory:{}},'a').map(l=>l.key),['L','ALL','R']);
 assert.deepEqual(cameraLayers(field,{},'a'),[]);
});

test('four consecutive helper fields expose overview and each player camera',()=>{
 const field={kind:'unite',players:['a','b','c','d'],rect:{r0:9,r1:12,c0:0,c1:36}};
 const layers=cameraLayers(field,{players:field.players.map(playerId=>({playerId,name:playerId}))},'a');
 assert.deepEqual(layers.map(l=>l.key),['ALL','P:a','P:b','P:c','P:d']);
 for(const [i,pid]of field.players.entries()){
  const camera=layerCamera(field,'P:'+pid);assert.equal(camera.rect.c0,(3-i)*8);assert.equal(camera.rect.c1,(3-i)*8+10);assert.equal(camera.fit,true);assert.equal(camera.half,false);
 }
 assert.deepEqual(layerCamera(field,'ALL').rect,field.rect);
});

test('eight-player cooperative defense keeps all four camera slots when only one or two helpers enter',()=>{
 for(const count of [1,2]){
  const field={kind:'unite',stageId:'coop8_unite_original',rect:{r0:9,r1:12,c0:0,c1:36},players:['a','b'].slice(0,count)};
  const layers=cameraLayers(field,{players:[{playerId:'a',name:'A'},{playerId:'b',name:'B'}]},'a');
  assert.equal(layers.length,5);assert.equal(layers[0].key,'ALL');assert.equal(layers[1].key,'P:a');
  assert.equal(layerCamera(field,'P:a').rect.c0,24);
  for(let i=count;i<4;i++)assert.equal(layerCamera(field,'S:'+i).rect.c0,(3-i)*8);
  assert.equal(layerCamera(field,'ALL').half,false);
 }
});

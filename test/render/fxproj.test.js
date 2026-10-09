// test/render/fxproj.test.js — battle FX of render/fx.js against a headless fake PIXI (test/render/fakepixi.js):
//   * projectile speeds follow the sim (style.js PROJ mirrors server/sim/constants.js; the live table wins)
//   * the FX atlas layout (render/textures.js fxFrames): no two frames share a pixel (the light pillar used to run into
//     the status-icon row), frame sizes other modules scale by are kept
//   * pooled particles: a freed sprite is a zero-size transparent quad (Pixi's ParticleRenderer ignores `visible`) and
//     its record is reused — a steady stream of shots stops allocating sprites
//   * shots: flight time = distance / sim speed / clock rate, homing on the moving target, one arrival burst, then gone
//   * 回环射手 boomerang: out at the sim's speed, back to the thrower's CURRENT position at the return speed, caught there;
//     dropped when the thrower is gone
//   * 蕾缪安 S3: a lock reticle follows its enemy until the 'bombard' of the shell fired at it; 'bombardShell' flies for
//     `t` game s — however long the S3 runs (extra ammo, stuns); blasts named after the shooter happen at their (x, y);
//     the S2 aim lock ends with its 'crit'; a lock of a shooter gone quiet times out
//   * fx anchoring (_where), quality / load gating of cosmetic particles, melee slash direction, skill burst + aura

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as SIM from '../../server/sim/constants.js';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import { PROJ, HIT_TINT } from '../../public/js/render/style.js';

let fake, FX, T;
before(async () => {
  fake = installFakePixi();
  FX = await import('../../public/js/render/fx.js');
  T = await import('../../public/js/render/textures.js');
});
after(() => { FX?.setSimProjectileSpeeds(null); fake.restore(); });

const DT = 1 / 120;
const cam = presetCamera('normal', { width: 1600, height: 900 });

/** A unit view as the FX system reads it. */
function unit(id, x, y, o = {}) {
  return { id, x, y, z: 0, hover: 0, _headTiles: 1.2, alive: true, destroyed: false, isEnemy: false, maxHp: 3000, info: { defId: 'char_x' }, onHit() {}, ...o };
}

/** A FxSystem on fake layers; `views` resolves fx ids; ts = battle clock rate. */
function makeFx({ quality = 'high', ts = 2, load = 0, views = [] } = {}) {
  const P = fake.P;
  const ctx = fakeViewCtx(P);
  const map = new Map(views.map((v) => [v.id, v]));
  const fx = new FX.FxSystem({
    P, layers: ctx.layers, cam: () => cam, heightAt: () => 0, settings: { quality, damageNumbers: true },
    timeScale: () => ts, loadLevel: () => load, subProfOf: () => null, view: (id) => map.get(id) || null,
    screenSize: () => ({ width: 1600, height: 900 }), fieldTop: () => 120,
  });
  return { fx, map };
}

const run = (fx, seconds, dt = DT) => { for (let t = 0; t < seconds - 1e-9; t += dt) fx.update(dt); };
const texName = (fx, tex) => Object.keys(fx.tex).find((k) => fx.tex[k] === tex);
const liveTex = (fx, name) => fx.parts.filter((p) => p.sp.texture === fx.tex[name]);

test('a growing alchemy field updates one circle per cast and keeps operator-themed fill',async()=>{
 const {skillRangeStyle}=await import('../../public/js/render/units.js');
 const v=unit(903,3,10,{info:{charId:'char_4011_lessng'}}),{fx}=makeFx({views:[v],ts:1});
 const extra={id:v.id,zoneKey:1,r:1,grow:.1,vx:.05,vy:0,duration:12};
 fx.simFx('zone',5,10,extra);assert.equal(fx.zones.length,1);const z=fx.zones[0],disc=z.disc;
 assert.equal(z.tint,skillRangeStyle(v.info).color);
 let fill;z.edge.beginFill=(color,alpha)=>{fill={color,alpha};return z.edge};
 run(fx,1);assert.ok(z.r>1.09);assert.ok(z.x>5.04);assert.deepEqual(fill,{color:z.tint,alpha:skillRangeStyle(v.info).fillAlpha});
 fx.simFx('zone',5.05,10,{...extra,r:1.1,duration:11});assert.equal(fx.zones.length,1);assert.equal(fx.zones[0].disc,disc);
 fx.simFx('zone',6,10,{...extra,zoneKey:2});assert.equal(fx.zones.length,2,'separate casts remain distinct');
 run(fx,13);assert.equal(fx.zones.length,0);fx.clear();
});

test('Thorns alchemy key updates its existing zone rather than stacking one per tick',()=>{
 const v=unit(905,3,10,{info:{charId:'char_1039_thorn2'}}),{fx}=makeFx({views:[v],ts:1});
 const key='thorn2:905:1';
 fx.simFx('zone',5,10,{id:v.id,key,r:1,duration:12});const disc=fx.zones[0].disc;
 for(let i=1;i<12;i++){
  run(fx,1);fx.simFx('zone',5+i*.05,10,{id:v.id,key,r:1+i*.1,duration:12-i});
  assert.equal(fx.zones.length,1);assert.equal(fx.zones[0].disc,disc);
 }
 assert.equal(fx.zones[0].r,2.1);
 fx.simFx('zone',6,10,{id:v.id,key:'thorn2:905:2',r:1,duration:4});
 assert.equal(fx.zones.length,2,'independent casts remain separate');
 run(fx,5);assert.equal(fx.zones.length,0);fx.clear();
});
test('ongoing skill hexagons keep the default gold and rotate in world space',()=>{
 const v=unit(904,5,10,{info:{charId:'char_4064_mlynar'}}),{fx}=makeFx({views:[v]});
 fx.skill(v,true);const a=fx.auras.get(v.id);let color,first,second;
 a.sp.lineStyle=(width,tint)=>{color=tint;return a.sp};a.sp.moveTo=(x,y)=>{first={x,y};return a.sp};
 fx._updateAuras(.1);assert.equal(color,0xffd45a);const before={...first};
 a.sp.moveTo=(x,y)=>{second={x,y};return a.sp};fx._updateAuras(.5);assert.notDeepEqual(second,before);
 fx.clear();
});

test('damage display modes aggregate only sum and preserve every hit in all',()=>{
 for(const [mode,count] of [['sum',1],['all',3],['basic',3],['none',0]]){
  const v=unit(901,5,10),{fx}=makeFx({views:[v]});fx.ctx.settings.damageNumberMode=mode;
  for(let i=0;i<3;i++)fx.damage(v,100,'phys',null,{critical:true,value:100,expected:50});
  assert.equal(fx.nums.length,count,mode);if(mode==='sum')assert.equal(fx.nums[0].value,300);
  fx.clear();
 }
 const v=unit(902,5,10),{fx}=makeFx({views:[v]});fx.ctx.settings.damageNumberMode='basic';
 fx.damage(v,100,'phys',null,{critical:false,expected:100});assert.equal(fx.nums.length,0);
 fx.clear();
});

describe('projectile speeds follow the sim', () => {
  test('style.js PROJ mirrors PROJECTILE_SPEEDS for every sim kind (and the boomerang return speed)', () => {
    for (const [kind, v] of Object.entries(SIM.PROJECTILE_SPEEDS)) {
      assert.ok(PROJ[kind], `render/style.js PROJ has no visual for the sim's projectile kind '${kind}'`);
      assert.equal(PROJ[kind].speed, v, `PROJ.${kind}.speed ${PROJ[kind].speed} ≠ sim PROJECTILE_SPEEDS.${kind} ${v}: update the mirror`);
    }
    if (SIM.BOOMERANG_RETURN_SPEED !== undefined) assert.equal(PROJ.boomerang.back, SIM.BOOMERANG_RETURN_SPEED, 'PROJ.boomerang.back mirrors BOOMERANG_RETURN_SPEED');
  });

  test('projSpeed: the live sim table first, then the style.js copy; boomerangReturn = the return speed', () => {
    FX.setSimProjectileSpeeds(null);
    assert.equal(FX.projSpeed('orb'), PROJ.orb.speed);
    assert.equal(FX.projSpeed('boomerangReturn'), PROJ.boomerang.back);
    assert.equal(FX.projSpeed('nope'), 12);
    FX.setSimProjectileSpeeds({ ...SIM.PROJECTILE_SPEEDS, orb: 99, boomerang: 20 }, 5);
    assert.equal(FX.projSpeed('orb'), 99);
    assert.equal(FX.projSpeed('boomerang'), 20);
    assert.equal(FX.projSpeed('boomerangReturn'), 5);
    FX.setSimProjectileSpeeds({ arrow: 1 });   // an older sim table: the rest from the copy
    assert.equal(FX.projSpeed('arrow'), 1);
    assert.equal(FX.projSpeed('bolt'), PROJ.bolt.speed);
    assert.equal(FX.projSpeed('boomerangReturn'), PROJ.boomerang.back);
    FX.setSimProjectileSpeeds(SIM.PROJECTILE_SPEEDS, SIM.BOOMERANG_RETURN_SPEED);
    for (const [k, v] of Object.entries(SIM.PROJECTILE_SPEEDS)) assert.equal(FX.projSpeed(k), v);
    FX.setSimProjectileSpeeds(null);
  });
});

describe('FX atlas layout', () => {
  test('frames never overlap and stay inside the atlas; shared frame sizes are kept', () => {
    const { size: [W, H], frames } = T.fxFrames();
    const list = Object.entries(frames);
    for (const [name, [x, y, w, h]] of list) assert.ok(x >= 0 && y >= 0 && x + w <= W && y + h <= H, `${name} inside ${W}×${H}`);
    const hits = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const [a, [ax, ay, aw, ah]] = list[i], [b, [bx, by, bw, bh]] = list[j];
        if (ax < bx + bw && bx < ax + aw && ay < by + bh && by < ay + ah) hits.push(`${a} × ${b}`);
      }
    }
    assert.deepEqual(hits, [], 'overlapping FX atlas frames');
    // sizes other modules scale sprites by (units.js glow / chevron, tiles.js soft / ring / dot / smoke, app.js coin)
    const size = (n) => frames[n].slice(2).join('×');
    for (const [n, s] of [['glow', '128×128'], ['soft', '128×128'], ['ring', '128×128'], ['hex', '128×128'], ['smoke', '128×128'], ['dot', '32×32'], ['chevron', '64×64'], ['coin', '48×48'], ['pillar', '64×256'], ['streak', '128×32'], ['slash', '128×64']]) assert.equal(size(n), s, n);
    for (const k of T.STATUS_KEYS) assert.equal(size('st_' + k), '32×32', k);
    for (const n of ['tracer', 'shock', 'reticle', 'flare', 'boomerang', 'muzzle']) assert.ok(frames[n], `new frame ${n}`);
  });

  test('fxAtlas builds one texture per frame on one base texture', () => {
    const a = T.fxAtlas();
    const { frames } = T.fxFrames();
    assert.deepEqual(Object.keys(a.tex).sort(), Object.keys(frames).sort());
    for (const t of Object.values(a.tex)) assert.equal(t.baseTexture, a.base);
  });
});

describe('particles', () => {
  test('a freed particle is a zero-size transparent quad and its record is reused', () => {
    const { fx } = makeFx();
    const p = fx.particle('glow', 10, 10, { life: 0.05, s0: 1, a0: 1, a1: 1 });
    const sp = p.sp;
    run(fx, 0.1);
    assert.equal(fx.parts.length, 0);
    assert.equal(sp.alpha, 0, 'alpha 0 (the particle renderer draws invisible children too)');
    assert.deepEqual([sp.scale.x, sp.scale.y], [0, 0], 'zero size: no fill cost');
    const n = fx.addPc.children.length;
    const q = fx.particle('spark', 5, 5, { life: 0.3 });
    assert.equal(q, p, 'the pooled record comes back');
    assert.equal(fx.addPc.children.length, n, 'no new sprite');
    assert.equal(q.sp.texture, fx.tex.spark);
    assert.ok(q.sp.alpha > 0 && q.sp.scale.x > 0);
  });

  test('a steady stream of shots and hits only ever makes as many sprites as were alive at once', () => {
    const a = unit(1, 3, 10), b = unit(2, 8, 11, { isEnemy: true });
    const { fx } = makeFx({ views: [a, b] });
    const kinds = ['arrow', 'bolt', 'orb', 'bomb', 'lob', 'drone', 'enemy', 'boomerang', 'none'];
    let peakAdd = 0, peakNorm = 0, peakProj = 0;
    const sample = () => {
      let add = 0;
      for (const p of fx.parts) if (p.add) add++;
      peakAdd = Math.max(peakAdd, add);
      peakNorm = Math.max(peakNorm, fx.parts.length - add);
      peakProj = Math.max(peakProj, fx.projs.length);
    };
    for (let f = 0; f < 60 * 12; f++) {
      if (f % 6 === 0) {
        const i = f / 6;
        fx.attack(a, b, kinds[i % kinds.length]);
        fx.damage(b, 120, i % 2 ? 'arts' : 'phys', i % 9 === 8 ? a : null);
      }
      sample();                                      // (particles are freed only at the start of an update)
      fx.update(1 / 60);
      sample();
    }
    assert.ok(peakProj >= 3 && peakAdd > 20, `busy enough (${peakProj} shots, ${peakAdd} particles at once)`);
    assert.equal(fx.addPc.children.length, peakAdd, 'additive particle sprites = the peak alive at once');
    assert.equal(fx.normPc.children.length, peakNorm, 'normal-blend particle sprites = the peak alive at once');
    assert.equal(fx.projLayer.children.length, 4 * peakProj, 'three sprites plus one pooled path per projectile record');
    assert.equal(fx.shadowLayer.children.length, peakProj);
    assert.ok(fx.parts.length <= fx.maxParticles);
  });
});

describe('shots', () => {
  test('flight time = distance / sim speed / clock rate; homing on the moving target; one arrival burst', () => {
    FX.setSimProjectileSpeeds(null);
    const a = unit(1, 3, 10), b = unit(2, 9, 10, { isEnemy: true });
    const { fx } = makeFx({ ts: 2, views: [a, b] });
    fx.attack(a, b, 'arrow');
    assert.equal(fx.projs.length, 1);
    const pr = fx.projs[0];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    assert.ok(Math.abs(pr.dur - dist / PROJ.arrow.speed / 2) < 1e-9, `dur ${pr.dur}`);
    assert.equal(pr.trail.texture, fx.tex.tracer);
    assert.equal(liveTex(fx, 'muzzle').length, 1, 'muzzle flash at the shooter');
    b.x = 9.5;                                     // the target moves: the shot follows it
    let t = 0;
    while (!pr.hit && t < 1) { fx.update(DT); t += DT; }
    assert.ok(Math.abs(t - pr.dur) <= DT + 1e-9, `arrived after ${t} (dur ${pr.dur})`);
    assert.equal(pr.tx, 9.5);
    const contacts = liveTex(fx, 'dot').length;
    assert.ok(contacts >= 1, 'short arrival contact');
    assert.equal(liveTex(fx, 'skillContact').length,0,'no star-shaped hit sparkle');
    run(fx, 0.2);
    assert.equal(fx.projs.length, 0, 'released after its short fade');
    assert.equal(pr.trail.visible || pr.halo.visible || pr.core.visible, false);
  });

  test('every projectile kind flies and lands; shells cast a shadow and explode', () => {
    const a = unit(1, 3, 10), b = unit(2, 7, 11, { isEnemy: true });
    const { fx } = makeFx({ views: [a, b] });
    for (const kind of Object.keys(PROJ)) {
      fx.clear();
      fx.attack(a, b, kind);
      assert.equal(fx.projs.length, 1, kind);
      const pr = fx.projs[0];
      fx.update(DT);
      assert.equal(pr.shadow.visible, PROJ[kind].look === 'shell' || kind === 'boomerang', `${kind} shadow`);
      if (kind === 'bomb' || kind === 'droneBomb') {
        run(fx, pr.dur);
        assert.ok(fx.rings.some((r) => r.sp.texture === fx.tex.shock), 'bomb explosion shockwave');
      }
      run(fx, 3);
      assert.equal(fx.projs.length, 0, `${kind} done`);
    }
  });

  test('chain / beam kinds are beams, melee shots are no projectile', () => {
    const a = unit(1, 3, 10), b = unit(2, 5, 10, { isEnemy: true });
    const { fx } = makeFx({ views: [a, b] });
    fx.attack(a, b, 'chain');
    fx.attack(a, b, 'beam');
    fx.attack(a, b, 'none');
    assert.equal(fx.projs.length, 0);
    assert.equal(fx.beamList.length, 2);
    assert.equal(fx._slashAt, a.id);
  });
});

describe('回环射手 boomerang', () => {
  test('out at the boomerang speed, back to where the thrower is now at the return speed, caught there', () => {
    FX.setSimProjectileSpeeds({ ...SIM.PROJECTILE_SPEEDS, boomerang: 15 }, 3.75);
    const thrower = unit(1, 2, 10), target = unit(2, 8, 10, { isEnemy: true });
    const { fx } = makeFx({ ts: 2, views: [thrower, target] });
    fx.attack(thrower, target, 'boomerang');
    const pr = fx.projs[0];
    const out = Math.hypot(target.x - pr.bx, target.y - pr.by);
    let t = 0;
    while (pr.phase === 0 && t < 3) { fx.update(DT); t += DT; }
    assert.ok(Math.abs(t - out / (15 * 2)) <= 2 * DT, `out leg ${t.toFixed(3)} s ≈ ${(out / 30).toFixed(3)} s`);
    thrower.x = 3;                                  // the thrower moved meanwhile: it flies to where it is now
    const back = Math.hypot(thrower.x - target.x, thrower.y - target.y);
    let t2 = 0;
    while (fx.projs.includes(pr) && t2 < 5) { fx.update(DT); t2 += DT; }
    assert.ok(Math.abs(t2 - back / (3.75 * 2)) <= 2 * DT, `back leg ${t2.toFixed(3)} s ≈ ${(back / 7.5).toFixed(3)} s`);
    assert.ok(Math.abs(pr.bx - 3) < 1e-9, 'caught at the thrower');
    FX.setSimProjectileSpeeds(null);
  });

  test('it spins, and is gone at once when the thrower leaves the field', () => {
    const thrower = unit(1, 2, 10), target = unit(2, 8, 10, { isEnemy: true });
    const { fx } = makeFx({ views: [thrower, target] });
    fx.attack(thrower, target, 'boomerang');
    const pr = fx.projs[0];
    fx.update(DT);
    const r0 = pr.core.rotation;
    fx.update(DT);
    assert.notEqual(pr.core.rotation, r0, 'spinning');
    assert.equal(pr.core.texture, fx.tex.boomerang);
    while (pr.phase === 0) fx.update(DT);
    fx.update(DT);
    thrower.destroyed = true;
    fx.update(DT);
    assert.equal(fx.projs.length, 0, 'dropped on the way back');
    // a thrower already knocked out at the hit gets nothing back
    const t2 = unit(3, 2, 11);
    fx.attack(t2, target, 'boomerang');
    t2.alive = false;
    run(fx, 1);
    assert.equal(fx.projs.length, 0);
  });
});

describe('蕾缪安 S3: lock, bombardShell, bombard', () => {
  const setup = () => {
    const lem = unit(1, 2, 10), e1 = unit(21, 8, 10, { isEnemy: true }), e2 = unit(23, 9, 11.5, { isEnemy: true });
    return { lem, e1, e2, ...makeFx({ ts: 2, views: [lem, e1, e2] }) };
  };

  test('a lock follows its enemy until the bombard of the shell fired at it', () => {
    const { fx, e1 } = setup();
    fx.simFx('lock', 8, 10, { id: 21, src: 1 });
    fx.simFx('lock', 9, 11.5, { id: 23, src: 1 });
    assert.equal(fx.locks.length, 2);
    const [L1, L2] = fx.locks;
    e1.x = 8.4;
    fx.update(DT);
    assert.ok(Math.abs(L1.ring.position.x-fx._bodyPt(e1,FX.SHOT_HEIGHT.aim,{}).x)<1e-6,'reticle follows the model on screen');
    assert.equal(L1.ring.texture, fx.tex.reticle);
    // the shell fired at e1's spot takes that lock; it flies t game s = t / 2 real s
    fx.simFx('bombardShell', 8.5, 10.1, { id: 1, r: 1.5, t: 0.3, i: 0 });
    const shell = fx.projs.find((p) => p.kind === 'bombardShell');
    assert.ok(shell, 'a shell in the air');
    assert.ok(Math.abs(shell.dur - 0.15) < 1e-9);
    assert.equal(L1.shell, true);
    assert.equal(L2.shell, false);
    assert.ok(fx.rings.filter((r) => r.x === 8.5 && r.y === 10.1).length >= 2, 'warning rings on the spot');
    run(fx, 0.16);
    assert.equal(fx.projs.filter((p) => p.kind === 'bombardShell').length, 0, 'landed');
    assert.ok(L1.out < 0, 'the lock waits for the impact itself');
    fx.simFx('bombard', 8.5, 10.1, { id: 1, r: 1.5 });
    assert.ok(L1.out >= 0, 'released by its bombard');
    assert.ok(L2.out < 0, 'the other lock stays');
    run(fx, 0.3);
    assert.deepEqual(fx.locks, [L2]);
  });

  test("bombard happens at its (x, y), never on the shooter named in `id`; it is a heavy blast", () => {
    const { fx, lem } = setup();
    fx.simFx('bombard', 8, 10, { id: 1, r: 1.5 });
    assert.ok(fx.rings.length >= 2);
    for (const r of fx.rings) assert.deepEqual([r.x, r.y], [8, 10]);
    assert.ok(!fx.rings.some((r) => r.x === lem.x), 'nothing on 蕾缪安');
    assert.ok(liveTex(fx, 'shard').length > 0, 'debris (heavy)');
  });

  test('a bombard with no shell (older sims) releases the nearest lock; locks time out; the S2 snipe ends its aim lock', () => {
    const { fx } = setup();
    fx.simFx('lock', 8, 10, { id: 21, src: 1 });
    fx.simFx('lock', 9, 11.5, { id: 23, src: 1 });
    fx.simFx('bombard', 9, 11.5, { id: 1, r: 1.5 });
    assert.deepEqual(fx.locks.map((L) => L.out >= 0), [false, true]);
    run(fx, 5 / 2 + 0.3);                            // LOCK_T game s at 2×, plus the fade
    assert.equal(fx.locks.length, 0, 'timed out');
    fx.simFx('lock', 8, 10, { id: 21, src: 1 });
    fx.simFx('crit', 8, 10, { id: 23, src: 1 });     // another enemy: stays
    assert.ok(fx.locks[0].out < 0);
    fx.simFx('crit', 8, 10, { id: 21, src: 1 });
    assert.ok(fx.locks[0].out >= 0, 'the snipe on the locked enemy ends the lock');
  });

  test('the shooter knocked out: locks still waiting for a shell go, the one whose shell is in the air stays', () => {
    const { fx, lem } = setup();
    fx.simFx('lock', 8, 10, { id: 21, src: 1 });
    fx.simFx('lock', 9, 11.5, { id: 23, src: 1 });
    fx.simFx('bombardShell', 8, 10, { id: 1, r: 1.5, t: 0.3 });
    const [L1, L2] = fx.locks;
    lem.alive = false;
    fx.update(DT);
    assert.ok(L1.out < 0, 'its shell still lands');
    assert.ok(L2.out >= 0, 'no shell will come');
    fx.simFx('bombard', 8, 10, { id: 1, r: 1.5 });
    assert.ok(L1.out >= 0);
  });

  test('a long S3 (extra ammo, a stun mid-lock): every reticle stays until the bombard of its own shell', () => {
    // 拉特兰 ammo grants / reloads give S3 more than its 5 shots: 20 locks 0.5 game s apart (a 3 game s stun in the
    // middle), then one shell every 0.3 game s landing 0.3 game s later — the first lock waits ≈ 16 game s for its shell
    const enemies = Array.from({ length: 4 }, (_, k) => unit(30 + k, 7 + k, 9 + (k % 2), { isEnemy: true }));
    const lem = unit(1, 2, 10);
    const { fx } = makeFx({ ts: 2, views: [lem, ...enemies] });
    const g = (s) => s / 2;   // game s → real s at 2×
    const locks = [];
    for (let k = 0; k < 20; k++) {
      const e = enemies[k % 4];
      fx.simFx('lock', e.x, e.y, { id: e.id, src: 1 });
      locks.push(fx.locks[fx.locks.length - 1]);
      run(fx, g(k === 9 ? 3.5 : 0.5));
    }
    assert.equal(new Set(locks).size, 20, 'no reticle recycled for another lock');
    for (let k = 0; k < 20; k++) {
      const e = enemies[k % 4];
      fx.simFx('bombardShell', e.x + 0.1, e.y, { id: 1, r: 1.5, t: 0.3, i: k });
      run(fx, g(0.3));
      const live = fx.locks.filter((L) => L.out < 0).length;
      assert.equal(live, 20 - k, `shell ${k}: every lock whose bombard is still to come is up`);
      fx.simFx('bombard', e.x + 0.1, e.y, { id: 1, r: 1.5 });
    }
    run(fx, 0.3);
    assert.equal(fx.locks.length, 0);
  });

  test('a lock sticks to the enemy named in `id` even when its view is a little off the event spot', () => {
    const { fx, e1 } = setup();
    fx.simFx('lock', 9, 10, { id: 21, src: 1 });   // e1 drawn at (8, 10): a fast walker between snapshots
    assert.equal(fx.locks[0].view, e1);
    e1.x = 7.5;
    fx.update(DT);
    assert.ok(Math.abs(fx.locks[0].ring.position.x-fx._bodyPt(e1,FX.SHOT_HEIGHT.aim,{}).x)<1e-6);
  });

  test('a lock whose shooter goes quiet still times out (S2 aim at an enemy that died)', () => {
    const { fx } = setup();
    fx.simFx('lock', 8, 10, { id: 21, src: 1 });
    run(fx, 5 / 2 - 0.05);
    assert.equal(fx.locks[0].out, -1);
    run(fx, 0.35);
    assert.equal(fx.locks.length, 0);
  });

  test('a long shell flight climbs out of the shooter first; a short one only falls', () => {
    const { fx, lem } = setup();
    fx.simFx('bombardShell', 8, 10, { id: 1, r: 1.5, t: 1.2 });
    fx.simFx('bombardShell', 9, 11.5, { id: 1, r: 1.5, t: 0.3 });
    const [long, short] = fx.projs;
    assert.ok(long.rise > 0 && short.rise === 0);
    lem.x = 2.5;
    fx.update(DT);
    assert.equal(long.x0, 2.5, 'rising from where she stands');
    run(fx, 1);
    assert.equal(fx.projs.length, 0);
  });
});

describe('fx placement, quality, melee, skill', () => {
  test('_where: on the unit when the fx happens there, else at the event position', () => {
    const caster = unit(1, 2, 10);
    const { fx } = makeFx({ views: [caster] });
    assert.equal(fx._where(2.2, 10.1, { id: 1 }).v, caster, 'on the unit');
    assert.equal(fx._where(NaN, NaN, { id: 1 }).v, caster, 'no position: the unit');
    const far = fx._where(5, 10, { id: 1 });
    assert.deepEqual([far.x, far.y, far.v], [5, 10, null], 'an aoe ahead of its caster');
    fx.simFx('aoe', 6, 11, { id: 1, r: 1 });
    assert.ok(fx.rings.length && fx.rings.every((r) => r.x === 6 && r.y === 11), 'drawn where it happens');
  });

  test("quality 'low' and a heavy load skip the cosmetic particles, not the shots", () => {
    const a = unit(1, 3, 10), b = unit(2, 8, 10, { isEnemy: true });
    for (const [opts, cosmetic] of [[{ quality: 'high' }, true], [{ quality: 'low' }, false], [{ quality: 'high', load: 2 }, false]]) {
      const { fx } = makeFx({ ...opts, views: [a, b] });
      fx.attack(a, b, 'bolt');
      fx.attack(a, b, 'arrow');
      run(fx, 0.05);
      assert.equal(fx.projs.length, 2);
      const extras = liveTex(fx, 'dot').length + liveTex(fx, 'muzzle').length;
      assert.equal(extras > 0, cosmetic, JSON.stringify(opts));
    }
  });

  test('melee contacts accent the Spine weapon swing without a second slash arc',()=>{
    const a=unit(1,4,10),b=unit(2,5,10,{isEnemy:true});const {fx}=makeFx({views:[a,b]});
    fx.attack(a,b,'none');fx.damage(b,300,'arts',a);
    assert.equal(liveTex(fx,'slash').length,0);assert.equal(liveTex(fx,'spark').length,0);assert.equal(liveTex(fx,'glow').length,0);assert.equal(fx.contacts.length,1);assert.equal(fx._slashAt,null);

  });

  test('skill activation stays small and its restrained ongoing marks fade when it ends', () => {
    const v = unit(1, 4, 10);
    const { fx } = makeFx({ views: [v] });
    fx.skill(v, true);
    assert.equal(liveTex(fx, 'pillar').length, 0);
    assert.equal(liveTex(fx, 'skillContact').length, 1);
    assert.ok(liveTex(fx, 'skillContact')[0].a0 <= .5);
    assert.equal(fx.rings.length,0);
    assert.equal(fx.auras.size, 1);
    run(fx, 1);
    const a = fx.auras.get(1);
    assert.ok(a.sp.alpha >= .75 && a.sp.alpha <= .85, 'subtle ongoing effect shown');
    fx.skill(v, false);
    run(fx, 0.6);
    assert.equal(fx.auras.size, 0, 'faded out');
  });

  test('clear() drops shots, locks, auras and particles', () => {
    const a = unit(1, 3, 10), b = unit(2, 8, 10, { isEnemy: true });
    const { fx } = makeFx({ views: [a, b] });
    fx.attack(a, b, 'boomerang');
    fx.simFx('lock', 8, 10, { id: 2, src: 1 });
    fx.simFx('bombardShell', 8, 10, { id: 1, r: 1.5, t: 0.3 });
    fx.skill(a, true);
    fx.update(DT);
    fx.clear();
    assert.deepEqual([fx.projs.length, fx.locks.length, fx.auras.size, fx.parts.length], [0, 0, 0, 0]);
    fx.update(DT);
    fx.destroy();
  });
});

test('Drone bombardment marks a fixed point, stays hidden during warning, then drops vertically without a launch arc',()=>{
 const {fx}=makeFx({ts:1,views:[unit(1,2,10)]});
 fx.simFx('bombardShell',8,10,{id:1,r:1.2,t:3,vertical:true});
 const shell=fx.projs[0];assert.equal(shell.vertical,true);
 assert.ok(fx.rings.some(r=>r.x===8&&r.y===10));
 run(fx,2.7);assert.equal(shell.core.visible,false);
 run(fx,.15);assert.equal(shell.core.visible,true);
 const start=1-.22/shell.dur,u=(shell.t/shell.dur-start)/(1-start);
 const expected=cam.project(8,10,5.5*(1-u*u));assert.ok(Math.abs(shell.core.position.x-expected.x)<.01);
 fx.simFx('bombard',8,10,{id:1,r:1.2});run(fx,.05);assert.equal(fx.projs.length,0);
});

test('Explosion particles keep their world position and scale when the camera changes; screen snow stays on screen',()=>{
 const {fx}=makeFx();fx.explosion(8,10,0,1.2,0xff7744);
 const p=fx.parts.find(p=>p.world);assert.ok(p);
 const next=presetCamera('boss',{width:1280,height:720});fx.ctx.cam=()=>next;
 fx.update(0);
 const anchor=next.project(p.world.x,p.world.y,p.world.z||0),ratio=anchor.s/p.as;
 assert.ok(Math.abs(p.sp.position.x-(anchor.x+(p.x-p.ax)*ratio))<1e-6);
 assert.ok(Math.abs(p.sp.position.y-(anchor.y+(p.y-p.ay)*ratio))<1e-6);
 fx.snowfall(0xffffff);const snow=fx.parts.at(-1);assert.equal(snow.world,null);
});

test('ordinary projectile heads and widths return to the previous size without changing flight time',()=>{
 const a=unit(90,4,10),b=unit(91,8,10,{isEnemy:true}),{fx}=makeFx({views:[a,b]});
 fx.attack(a,b,'orb');const pr=fx.projs[0];
 assert.ok(Math.abs(pr.spec.head-PROJ.orb.head*1.8)<1e-9);
 assert.ok(Math.abs(pr.spec.width-PROJ.orb.width*1.8)<1e-9);
 assert.ok(Math.abs(pr.dur-4/PROJ.orb.speed/2)<1e-9);
});
test('interleaved melee attacks retain their individual flat contact effects',()=>{
 const a=unit(90,4,10),b=unit(91,5,10),target=unit(92,6,10,{isEnemy:true}),{fx}=makeFx({views:[a,b,target]});
 fx.attack(a,target,'none');fx.attack(b,target,'none');
 fx.damage(target,100,'phys',a);fx.damage(target,100,'phys',b);
 assert.equal(fx.contacts.length,2);
 assert.equal(liveTex(fx,'spark').length,0);assert.equal(liveTex(fx,'glow').length,0);
});

test('arcing shells remain enlarged while ordinary shots use the restored size',()=>{
 const a=unit(90,4,10),b=unit(91,8,10,{isEnemy:true}),{fx}=makeFx({views:[a,b]});
 fx.attack(a,b,'lob');
 assert.ok(Math.abs(fx.projs[0].spec.head-PROJ.lob.head*2.4)<1e-9);
 fx.clear();
 fx.attack(a,b,'orb');
 assert.ok(Math.abs(fx.projs[0].spec.head-PROJ.orb.head*1.8)<1e-9);
});

test('wide active attacks sweep once per volley and release their graphics',()=>{
 const src=unit(1,3,10,{dir:'RIGHT',statuses:new Set(['skill']),info:{charId:'char_172_svrash',skillIndex:2,skillZoneGrid:[[0,3]]}});
 const targets=[unit(2,5,10),unit(3,5,11)];const {fx}=makeFx({views:[src,...targets]});
 fx.attack(src,targets[0],'none');fx.attack(src,targets[1],'none');assert.equal(fx.sweeps.length,1);
 run(fx,.4);assert.equal(fx.sweeps.length,0);
 assert.equal(FX.wideAttackEffect(src.info,false),false);
});

test('drone warning follows its target, retargets without resetting time, and freezes its landing point at drop',()=>{
 const src=unit(80,5,10),a=unit(81,6,10,{isEnemy:true}),b=unit(82,7,10,{isEnemy:true});
 const {fx}=makeFx({views:[src,a,b]});
 fx.simFx('bombardShell',a.x,a.y,{id:src.id,target:a.id,shot:1,vertical:true,t:3,fall:.44});
 const pr=fx.projs[0];a.x=6.4;run(fx,.2);assert.equal(pr.tx,a.x);assert.ok(pr.warnRings.every(r=>r.x===a.x));
 const time=pr.t;fx.simFx('bombardAim',b.x,b.y,{id:src.id,shot:1,target:b.id});assert.equal(pr.t,time);assert.equal(pr.aimTarget,b.id);
 b.x=7.2;run(fx,.5);assert.equal(pr.tx,b.x);fx.simFx('bombardAim',7.2,10,{id:src.id,shot:1,target:null});
 b.x=9;run(fx,.2);assert.equal(pr.tx,7.2);
});

test('fixed trail lifetime gives faster shots a longer tail; pooled paths clear on release',()=>{
 const a=unit(1,3,10),b=unit(2,9,10,{isEnemy:true});
 const slow=makeFx().fx,fast=makeFx().fx;
 slow.attack(a,b,'arrow');fast.attack(a,b,'arrow');
 slow.projs[0].dur=.8;fast.projs[0].dur=.4;
 slow.update(.12);fast.update(.12);
 assert.ok(fast.projs[0].trail.scale.x>slow.projs[0].trail.scale.x*1.4);
 assert.ok(fast.projs[0].path);fast.clear();assert.equal(fast.projs.length,0);
});

test('weapon tail follows mesh deformation and clears when the attack stops',()=>{
 const fx=makeFx().fx;let shift=0;
 const slot={data:{name:'F_Sword'},bone:{worldX:0,worldY:0},getAttachment:()=>({worldVerticesLength:8,computeWorldVertices(slot,start,count,out){out.set([shift,0,shift+25,0,shift+25,5,shift,5]);}})};
 const a=unit(1,3,10);a.actor={mode:'attack',spine:{toGlobal:p=>p,skeleton:{slots:[slot]}}};
 a.body={toGlobal:p=>({x:800+p.x,y:400+p.y})};a.modelK=1;a.flipValue=1;
 fx.weaponTrail(a,.016,cam);const polygons=[];fx.weaponTrails.get(a).g.drawPolygon=points=>polygons.push(points);shift=20;fx.weaponTrail(a,.016,cam);
 assert.ok(polygons.length>0,'camera scratch-point reuse must not collapse the trail to zero');
 assert.ok(polygons.every(p=>p.every(Number.isFinite)));
 assert.equal(fx.weaponTrails.get(a).samples.length,2);
 assert.notEqual(fx.weaponTrails.get(a).samples[0].x,fx.weaponTrails.get(a).samples[1].x);
 fx.weaponTrail(a,.016,presetCamera('boss',{width:1440,height:900,side:'R',half:true}));
 assert.equal(fx.weaponTrails.get(a).samples.length,2,'changing camera alone must not create weapon movement');
 a.actor.mode='stun';fx.weaponTrail(a,.016,cam);assert.equal(fx.weaponTrails.get(a).samples.length,0);
 fx.clear();assert.equal(fx.weaponTrails.size,0);
});


test('authored enemy ability FX resolves the live unit and plays its exact clip',()=>{
 let args=null;const v=unit(91,5,10,{actor:{has:clip=>clip==='Skill_Begin',setForm:(...a)=>args=a},_formSpec:()=>({roles:{idle:'Idle_B'}})});
 const {fx}=makeFx({views:[v]});fx._simFx('enemySkill',5,10,{id:91,clip:'Skill_Begin',dur:1});
 assert.deepEqual(args,[{idle:'Idle_B'},'Skill_Begin']);
});

test('dedicated textures follow the selected skill and keep original boomerang textures at weapon scale', async()=>{
 const {dedicatedProjectile}=await import('../../public/js/render/dedicatedEffects.js');
 assert.equal(dedicatedProjectile({charId:'char_4056_titi',skillIndex:2},true),'titiDream');
 assert.equal(dedicatedProjectile({charId:'char_4056_titi',skillIndex:0},true),null);
 assert.equal(dedicatedProjectile({charId:'char_4138_narant',skillIndex:2},false),null);
 const src=unit(1,4,10,{info:{charId:'char_4138_narant',skillIndex:2},statuses:new Set(['skill'])}),tgt=unit(2,9,10,{isEnemy:true});
 const {fx}=makeFx({views:[src,tgt]});const tex=new fake.P.Texture();tex.width=1024;fx.weaponTextures.narantBlade=tex;
 fx.attack(src,tgt,'boomerang');fx.update(DT);assert.equal(fx.projs[0].core.texture,tex);
 assert.ok(fx.projs[0].core.scale.x<.2,'large original textures do not become giant quads');fx.clear();
});

test('all damage numbers stay within a narrow horizontal band around the target',()=>{
 const v=unit(906,5,10),{fx}=makeFx({views:[v]});fx.ctx.settings.damageNumberMode='all';
 const limit=fx.ctx.cam().project(v.x,v.y,(v._headTiles||1.2)*.8+.22).s*.035;
 for(let i=0;i<9;i++)fx.damage(v,100,'phys',null,{value:100});
 assert.equal(fx.nums.length,9,'real hits are not merged');
 assert.ok(fx.nums.every(n=>Math.abs(n.ox)<=limit+1e-6),'horizontal displacement stays within 3.5% of a tile');
 fx.clear();
});


test('projectile bodies remain opaque with normal blending while boomerangs ignore global enlargement',()=>{
 const src=unit(701,3,10),tgt=unit(702,9,10,{isEnemy:true});
 const {fx}=makeFx({views:[src,tgt]});fx.ctx.projectileScale=3.2;
 fx.attack(src,tgt,'boomerang');fx.update(DT);
 assert.equal(fx.projs[0].spec.head,PROJ.boomerang.head);
 assert.equal(fx.projs[0].core.alpha,1);
 assert.equal(fx.projs[0].core.blendMode,fake.P.BLEND_MODES.NORMAL);
 fx.clear();fx.attack(src,tgt,'arrow');fx.update(DT);
 assert.equal(fx.projs[0].core.texture,fx.tex.bulletBody);
 assert.equal(fx.projs[0].core.alpha,1);
 assert.equal(fx.projs[0].core.blendMode,fake.P.BLEND_MODES.NORMAL);fx.clear();
});

 test('world attack anchors do not change when switching between centre and either side',()=>{
 const v=unit(99,9,3,{bossArea:{dx:1},_headTiles:2.2}),src=unit(1,12,4);
 const {fx}=makeFx({views:[v,src],ts:1});
 for(const side of ['L','R'])for(const half of [false,true]){
 const camera=presetCamera('boss',{width:1440,height:900,side,half});fx.ctx.cam=()=>camera;
 const fixed={x:10,y:3+2.2*FX.SHOT_HEIGHT.aim*Math.cos(Math.PI/6),z:2.2*FX.MODEL_WORLD_HEIGHT*FX.SHOT_HEIGHT.aim};
 const aim=camera.project(fixed.x,fixed.y,fixed.z);
 assert.deepEqual(FX.bodyPoint(camera,v,FX.SHOT_HEIGHT.aim),fixed);
 const world=FX.bodyPoint(camera,v,FX.SHOT_HEIGHT.aim),point=camera.project(world.x,world.y,world.z);
 assert.ok(Math.abs(point.x-aim.x)<1e-6&&Math.abs(point.y-aim.y)<1e-6);
 fx._lock(v,null,v.x,v.y,0);fx._updateLocks(.1);const L=fx.locks.at(-1);
 assert.ok(Math.abs(L.ring.position.x-aim.x)<1e-6&&Math.abs(L.ring.position.y-aim.y)<1e-6);
 fx.attack(src,v,'arrow');const pr=fx.projs.at(-1);assert.ok(pr);const end=fx._shotPoint(pr,1,camera,{});
 assert.ok(Math.abs(end.x-aim.x)<1e-6&&Math.abs(end.y-aim.y)<1e-6);fx.clear();
 }
 });

test('wide effects distinguish weapons and magic, without using omnidirectional as a sword flag',()=>{
 assert.equal(FX.wideAttackFamily({charId:'char_4064_mlynar',skillIndex:2},true),'blade');
 assert.equal(FX.wideAttackFamily({subProf:'spreadshooter'},false),'cone');
 assert.equal(FX.wideAttackFamily({subProf:'phalanx'},true),'pulse');
 assert.equal(FX.wideAttackFamily({omnidirectional:true,attackType:'arts'},true),null);
 const {fx}=makeFx();fx._wideSweep(unit(10,0,0,{info:{subProf:'spreadshooter'}}));assert.equal(fx.sweeps.length,0,'unknown range never invents a wide radius');
});

test('boss model, impact, lock, projectile and text align in both halves and whole-field framing', async()=>{
 const {modelPoint}=await import('../../public/js/render/worldAnchors.js');
 const target=unit(880,10,3,{bossArea:{dx:1},_headTiles:2.2,z:.4,hover:.3,waterSink:-.18,lift:.1});
 const src=unit(881,5,4),{fx}=makeFx({views:[target,src],ts:1});
 const fixed=FX.bodyPoint(null,target,.5);
 fx.ctx.settings.damageNumberMode='all';
 fx.number(target,123,'phys',false);
 const n=fx.nums[0];
 for(const [side,half]of [['L',true],['R',true],['L',false]]){
  const camera=presetCamera('boss',{width:1440,height:900,side,half});fx.ctx.cam=()=>camera;
  const foot=camera.project(target.x+1,target.y,target.z+target.hover+target.lift+target.waterSink);
  const actual=fx._bodyPt(target,.5,{});
  assert.deepEqual(FX.bodyPoint(camera,target,.5),fixed);
  assert.ok(Math.abs(actual.x-foot.x)<1e-6,'impact stays on the model horizontal centre');
  assert.ok(Math.abs(actual.y-(foot.y-foot.s*target._headTiles*.5))<1e-6,'impact stays at the model chest');
  fx._lock(target,null,0,0,0);fx._updateLocks(0);const lock=fx.locks.at(-1);
  assert.ok(Math.abs(lock.ring.position.x-actual.x)<1e-6);
  assert.ok(Math.abs(lock.ring.position.y-actual.y)<1e-6);
  fx.attack(src,target,'arrow');const end=fx._shotPoint(fx.projs.at(-1),1,camera,{});
  assert.ok(Math.abs(end.x-actual.x)<1e-6&&Math.abs(end.y-actual.y)<1e-6);
  fx._layoutNums(camera);
  const birth=modelPoint(target,target._headTiles*.8+.22),text=camera.project(birth.x,birth.y,birth.z);
  assert.ok(Math.abs(n._x-text.x)<1e-6&&Math.abs(n._y-text.y)<1e-6);
  assert.ok(Math.abs(n._x-foot.x)<1e-6,'text stays above the model, including while changing a live number camera');
 }
 fx.clear();
});

test('garrison/layer pop follows its owner in world space for every bond source',()=>{
 const v=unit(912,3,10),{fx}=makeFx({views:[v]});
 fx.pop(null,'+5',0xffffff,0,[v.x,v.y],v.id);fx._updatePops(.1);
 const first=fx.pops[0].c.position.x;v.x+=2;fx._updatePops(.1);
 assert.notEqual(fx.pops[0].c.position.x,first,'moving owners retain their own pop');
 fx.clear();
});

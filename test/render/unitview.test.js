// test/render/unitview.test.js — render/units.js UnitView and render/textures.js caches against a headless fake PIXI
// (test/render/fakepixi.js): tier chips (tokens have no tier), fallback-portrait allocation (no throw-away
// placeholder canvases, nothing built when the Spine model is already there), and the per-mount texture helpers
// (mountain silhouette, tier-chip redraw) that must not allocate a new canvas each time.

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';

let fake, UnitView, T;
before(async () => {
  fake = installFakePixi();
  ({ UnitView } = await import('../../public/js/render/units.js'));
  T = await import('../../public/js/render/textures.js');
});
after(() => fake.restore());

const tick = () => new Promise((r) => setImmediate(r));
const cam = () => presetCamera('prep', { width: 1280, height: 720 });
const diamonds = () => fake.canvases.filter((c) => c.width === 160 && c.height === 160);

/** Asset store stub: avatar image + (optionally) a Spine model, both resolved asynchronously. */
function store({ image = true, spine = false, imageDelay = 0 } = {}) {
  const img = { width: 180, height: 180 };
  const entry = { skel: '/s/x.skel', atlas: '/s/x.atlas', textures: ['/s/x.png'], anims: { idle: 'Idle' }, animations: { Idle: 1 } };
  return {
    picture: (id) => (id ? `/pic/${id}.png` : null),
    image: (u) => new Promise((r) => (imageDelay ? setTimeout(() => r(image ? img : null), imageDelay) : r(image ? img : null))),
    spineEntry: () => (spine ? entry : null),
    spine: { acquire: async () => ({ animations: [{ name: 'Idle' }] }), release() {} },
  };
}

function view(info, opts = {}, assets = store()) {
  const ctx = fakeViewCtx(fake.P, { assets, cam: cam });
  return new UnitView(ctx, { id: 1, side: 'ally', kind: 'chess', defId: 'char_x', tier: 3, x: 5, y: 12, maxHp: 1000, ...info }, opts);
}

test('prep pips retain both equipment slots and a zero-slot morph, then remove only unequipped pips', () => {
  const v = view({}, { prep: true });
  v.setItems(['one', 'two', 'morph']);
  assert.deepEqual(v.itemPips.map((p) => p._url), ['one', 'two', 'morph']);
  v.setItems(['one', 'two']);
  assert.deepEqual(v.itemPips.map((p) => p._url), ['one', 'two']);
  v.setItems([]);
  assert.equal(v.itemPips.length, 0);
  v.destroy();
});

describe('tier chips', () => {
  test('optional recruit never adds a battlefield label in prep or battle', () => {
    for (const prep of [true, false]) {
      const v = view({ optionalRecruit: true }, { prep });
      for (let i = 0; i < 3; i++) assert.doesNotThrow(() => v.update(1 / 60, cam(), i / 60));
      assert.equal(v.recruitText, undefined);
      v.destroy();
    }
  });
  test('summon tokens in the hand show no tier chip (tokens have no tier)', async () => {
    const v = view({ kind: 'token', defId: 'token_10028_vigil_wolf', avatar: 'token_10028_vigil_wolf' }, { prep: true });
    for (let i = 0; i < 3; i++) v.update(1 / 60, cam(), i / 60);
    assert.ok(!v.chip || !v.chip.visible, 'no chip on a token');
  });

  test('operators keep their chip in prep and in battle; enemies never have one', () => {
    const p = view({ kind: 'chess', tier: 4 }, { prep: true });
    p.update(1 / 60, cam(), 0);
    assert.ok(p.chip && p.chip.visible);
    const b = view({ kind: 'chess', tier: 2 });
    b.update(1 / 60, cam(), 0);
    assert.ok(b.chip && b.chip.visible);
    const e = view({ side: 'enemy', kind: 'enemy', defId: 'enemy_1007_slime' });
    e.update(1 / 60, cam(), 0);
    assert.equal(e.chip, null);
  });
});

describe('fallback portraits (avatar diamonds)', () => {
  test('an avatar that loads builds one diamond — no image-less placeholder first', async () => {
    const before = diamonds().length;
    const v = view({ defId: 'char_a', avatar: 'char_a' });
    v.update(1 / 60, cam(), 0);
    await tick(); await tick();
    v.update(1 / 60, cam(), 1 / 60);
    assert.equal(diamonds().length - before, 1, 'one 160×160 canvas');
    assert.notEqual(v.fallback.texture, fake.P.Texture.EMPTY, 'the diamond shows');
  });

  test('a unit whose Spine model is ready before its first frame builds no diamond at all', async () => {
    const before = diamonds().length;
    const v = view({ defId: 'char_b', avatar: 'char_b' }, {}, store({ spine: true }));
    await tick(); await tick();
    assert.ok(v.spineReady, 'spine ready');
    for (let i = 0; i < 30; i++) v.update(1 / 60, cam(), i / 60);
    assert.equal(diamonds().length - before, 0);
  });

  test('a missing avatar falls back to the procedural placeholder (once)', async () => {
    const before = diamonds().length;
    const v = view({ defId: 'char_c', avatar: 'char_c' }, {}, store({ image: false }));
    await tick(); await tick();
    for (let i = 0; i < 3; i++) v.update(1 / 60, cam(), i / 60);
    assert.equal(diamonds().length - before, 1);
    assert.notEqual(v.fallback.texture, fake.P.Texture.EMPTY);
  });

  test('圣聆初雪 S2: the frozen gate (保护目标（冻结状态）, no art in the data) is an ice diamond, not the plain placeholder', async () => {
    const before = diamonds().length;
    const v = view({ kind: 'token', defId: 'token_10058_sbell2_icetgt' }, {}, store());   // (an owner avatar would load)
    await tick(); await tick();
    for (let i = 0; i < 3; i++) v.update(1 / 60, cam(), i / 60);
    assert.equal(v._frameColor(), 0x9fe6ff, 'ice frame');
    assert.equal(diamonds().length - before, 1);
    assert.notEqual(v.fallback.texture, T.diamondTexture('token_10058_sbell2_icetgt', null, 0x9fe6ff), 'its own (ice) glyph, not the procedural one');
    assert.equal(v.fallback.texture, T.diamondTexture('token_10058_sbell2_icetgt', null, 0x9fe6ff, { ice: true }));
  });

  test('a slow avatar shows the placeholder meanwhile, then the picture', async () => {
    const before = diamonds().length;
    let release;
    const gate = new Promise((r) => { release = r; });
    const assets = { ...store(), image: () => gate };
    const v = view({ defId: 'char_d', avatar: 'char_d' }, {}, assets);
    v.update(1 / 60, cam(), 0);
    assert.equal(diamonds().length - before, 0, 'nothing built while the avatar may still arrive quickly');
    const t0 = Date.now();
    while (v.fallback.texture === fake.P.Texture.EMPTY && Date.now() - t0 < 5000) { await new Promise((r) => setTimeout(r, 40)); v.update(1 / 60, cam(), 0); }
    assert.ok(Date.now() - t0 >= 300, 'placeholder only after the wait');
    assert.notEqual(v.fallback.texture, fake.P.Texture.EMPTY, 'placeholder while waiting');
    release({ width: 180, height: 180 });
    await tick(); await tick();
    v.update(1 / 60, cam(), 0);
    assert.equal(diamonds().length - before, 2, 'placeholder + picture');
  });

  test('two views of the same unit share the cached diamond', async () => {
    const a = view({ defId: 'char_e', avatar: 'char_e' });
    a.update(1 / 60, cam(), 0);
    await tick(); await tick();
    a.update(1 / 60, cam(), 0);
    const before = diamonds().length;
    const b = view({ defId: 'char_e', avatar: 'char_e' });
    b.update(1 / 60, cam(), 0);
    await tick(); await tick();
    b.update(1 / 60, cam(), 0);
    assert.equal(diamonds().length, before);
    assert.equal(a.fallback.texture, b.fallback.texture);
  });
});

describe('diamond cache', () => {
  test('bounded LRU; eviction never destroys a texture a view may still show', () => {
    const first = T.diamondTexture('lru_0', null, 0xffffff);
    for (let i = 1; i < 400; i++) {
      T.diamondTexture(`lru_${i}`, null, 0xffffff);
      if (i % 50 === 0) assert.equal(T.diamondTexture('lru_0', null, 0xffffff), first, 'recently used stays cached');
    }
    assert.ok(!first.destroyed && !first.baseTexture.destroyed);
    const n0 = diamonds().length;
    T.diamondTexture('lru_1', null, 0xffffff);
    assert.equal(diamonds().length, n0 + 1, 'the least recently used ones were evicted');
  });
});

describe('per-mount textures', () => {
  test('silhouetteTexture is cached per image (the field view builds it on every mount)', () => {
    const img = { width: 1024, height: 236 };
    const n0 = fake.canvases.length;
    const t1 = T.silhouetteTexture(img);
    const t2 = T.silhouetteTexture(img);
    assert.equal(t1, t2);
    assert.equal(fake.canvases.length - n0, 1);
    assert.notEqual(T.silhouetteTexture({ width: 512, height: 100 }), t1);
  });

  test('refreshTierChips redraws the chip atlas in place (no new canvas, chips handed out stay valid)', () => {
    const chip = T.tierChip(3, false);
    const n0 = fake.canvases.length;
    const b0 = fake.baseTextures.length;
    for (let i = 0; i < 5; i++) T.refreshTierChips();
    const again = T.tierChip(3, false);
    assert.equal(fake.canvases.length, n0, 'no new canvas');
    assert.equal(fake.baseTextures.length, b0, 'no new base texture');
    assert.equal(again.baseTexture, chip.baseTexture);
    assert.ok(!chip.destroyed && !chip.baseTexture.destroyed);
  });
});

describe('field view teardown (app.js releaseGl)', () => {
  test('drops the dead renderer’s GL copies of shared textures, buffers, geometries and cached programs', async () => {
    const { releaseGl } = await import('../../public/js/render/app.js');
    const UID = 7;
    const listeners = [];
    const mkBt = () => ({ _glTextures: { [UID]: { texture: {} }, 3: { texture: {} } } });
    const shared = [mkBt(), mkBt()];
    const deleted = [];
    const ts = {
      managedTextures: shared.slice(),
      destroyTexture(bt, skipRemove) {
        deleted.push(bt);
        delete bt._glTextures[UID];
        listeners.push('off');
        if (!skipRemove) this.managedTextures.splice(this.managedTextures.indexOf(bt), 1);
      },
    };
    const disposed = [];
    const sys = (name) => ({ disposeAll(lost) { disposed.push([name, lost]); } });
    const prog = { glPrograms: { [UID]: { program: 'p7' }, 3: { program: 'p3' } } };
    const gl = { deleted: [], deleteProgram(p) { this.deleted.push(p); } };
    const prevPixi = globalThis.PIXI;
    globalThis.PIXI = { ...prevPixi, utils: { ...(prevPixi?.utils || {}), ProgramCache: { src: prog } } };
    try {
      releaseGl({ CONTEXT_UID: UID, gl, texture: ts, geometry: sys('geometry'), buffer: sys('buffer'), framebuffer: sys('framebuffer') });
    } finally { globalThis.PIXI = prevPixi; }
    assert.deepEqual(deleted, shared);
    assert.equal(ts.managedTextures.length, 0);
    for (const bt of shared) assert.deepEqual(Object.keys(bt._glTextures), ['3'], 'other contexts untouched');
    assert.deepEqual(disposed.map((d) => d[0]).sort(), ['buffer', 'framebuffer', 'geometry']);
    assert.ok(disposed.every((d) => d[1] === false));
    assert.deepEqual(Object.keys(prog.glPrograms), ['3']);
    assert.deepEqual(gl.deleted, ['p7']);
    assert.doesNotThrow(() => releaseGl(null));
    assert.doesNotThrow(() => releaseGl({}));
  });
});

// user playtest #4 item 1: picking is by tile (render/pick.js); bounds() is the body's screen rect for tooltips / overlays
describe('bounds (view.pieceScreenRect)', () => {
  test('a unit: 0.7 tile wide, from its head (UNIT.headroom) to just below its feet; an enemy by its model height', async () => {
    const v = view({ defId: 'char_p1', avatar: 'char_p1' }, { prep: true });
    v.update(1 / 60, cam(), 0);
    const { x, y, s } = v.screen;
    const r = v.bounds();
    assert.ok(Math.abs(r.x - (x - 0.35 * s)) < 1e-6 && Math.abs(r.width - 0.7 * s) < 1e-6);
    assert.ok(Math.abs(r.y - (y - 1.18 * s)) < 1e-6 && Math.abs(r.y + r.height - (y + 0.1 * s)) < 1e-6);
    assert.equal(typeof v.pickShape, 'undefined', 'no hit shapes any more');
    const foe = view({ side: 'enemy', kind: 'enemy', defId: 'enemy_big' }, {}, store({ spine: true }));
    await tick(); await tick();
    foe.actor.entry.bounds = { height: 640 }; // setup-pose bounds: 2 tiles (UNIT.modelScale 1/320) × 0.92
    foe.update(1 / 60, cam(), 0);
    const fr = foe.bounds();
    assert.ok(Math.abs(fr.y - (foe.screen.y - foe._headTiles * foe.screen.s)) < 1e-6 && foe._headTiles > 1.5, 'its own height');
  });

  test('item plates: floating above the slot; centred on the pointer while dragged (lifted)', async () => {
    const { ItemView } = await import('../../public/js/render/units.js');
    const ctx = fakeViewCtx(fake.P, { assets: store(), cam });
    const it = new ItemView(ctx, { id: 'p:9', uid: 9, defId: 'item_x', x: 3, y: 7 });
    it.setWorld(3, 7, 0.16);
    it.update(1 / 60, cam(), 0);
    let r = it.bounds();
    assert.ok(Math.abs(r.y + r.height - it.screen.y) < 1e-6, 'resting: the plate above its anchor');
    it.lift = 0.3;
    it.update(1 / 60, cam(), 0);
    r = it.bounds();
    const g = cam().project(3, 7, 0.16);
    assert.ok(Math.abs(r.x + r.width / 2 - g.x) < 1e-6 && Math.abs(r.y + r.height / 2 - g.y) < 1e-6, 'dragged: centred on its ground point (the pointer)');
    assert.equal(it.plate.anchor.y, 0.5);
  });
});

describe('enemy preview pen figures (lod idle)', () => {
  /** A UnitView of a pen figure with a Spine model, an impostor atlas (full or not) and a counting renderer. */
  async function penFigure(full) {
    let frame = 0;
    const renders = [];
    const atlas = {
      alloc: (w, h) => (full ? null : { w, h, tex: new fake.P.Texture(), clip: false }),
      free() {}, park(o) { o.visible = false; }, unpark(o) { o.visible = true; }, draw() {},
    };
    const ctx = fakeViewCtx(fake.P, {
      assets: store({ spine: true }), cam, frameNo: () => frame, impostors: atlas,
      renderer: { resolution: 1, render: (obj, o) => renders.push(o?.renderTexture || null) },
    });
    const v = new UnitView(ctx, { id: 'e:0', preview: true, side: 'enemy', kind: 'enemy', defId: 'enemy_1007_slime', tier: 1, x: 9, y: 15, maxHp: 1, facing: -1 }, { prep: true, lod: 'idle' });
    await tick(); await tick();
    assert.ok(v.spineReady, 'spine ready');
    let steps = 0;
    const upd = v.actor.update.bind(v.actor);
    v.actor.update = (dt) => { steps++; return upd(dt); };
    const step = () => { v.update(1 / 60, cam(), frame / 60); frame++; };
    return { v, step, renders, steps: () => steps };
  }

  test('visible preview keeps complete skeletons outside the shared atlas and animates every frame', async () => {
    const { v, step, renders, steps } = await penFigure(false);
    for (let i = 0; i < 30; i++) step();
    assert.ok(!v.imp, 'no shared atlas can erase neighbouring attachments');
    assert.equal(renders.length, 0, 'drawn by the atlas flush, no per-figure render call');
    assert.equal(steps(), 30, 'native frame cadence for visible preview');
  });
});

test('Airborne drones draw above ground operators regardless of row depth',()=>{
 const drone=view({kind:'token',motion:'FLY',x:7,y:12}),op=view({x:7,y:9});
 drone.flying=true;drone.update(1/60,cam(),0);op.update(1/60,cam(),0);
 assert.ok(drone.root.zIndex>op.root.zIndex);
});

test('Operator attack animation never adds a positional lunge',()=>{
 const v=view({kind:'op'}),camera=cam();v.update(.1,camera,0);
 const before={x:v.root.position.x,y:v.root.position.y};
 v.onAttack({x:8,y:12},1,'none');v.update(.1,camera,.1);v.update(.1,camera,.2);
 assert.equal(v.root.position.x,before.x);assert.equal(v.root.position.y,before.y);
});

test('target facing transitions for operators and enemies in 100ms without changing animation time', async () => {
  for(const side of ['ally','enemy']){
    const v=view({side,kind:side==='ally'?'op':'enemy',dir:'RIGHT'},{},store({spine:true}));
    await tick();v.update(.01,cam(),0);const before=v.flipValue,clock=v.actor.clock,originalDir=v.dir;
    v.faceTarget({x:side==='ally'?0:10,y:12});v.update(.025,cam(),.025);
    assert.notEqual(v.flipValue,before);assert.ok(Math.abs(v.flipValue)<1,'flip takes time');
    assert.ok(Math.abs(v.actor.clock-clock-.025)<1e-6,'animation clock is independent');
    v.update(.1,cam(),.125);assert.equal(Math.abs(v.flipValue),1);
    assert.equal(v.dir,originalDir,'target facing does not rotate the gameplay range');v.destroy();
  }
});

test('skill range clears immediately on death and skill end, including offscreen early returns',()=>{
 const v=view({charId:'char_358_lisa',skillZoneGrid:[[0,0],[0,1]]});
 v.setSkill(true);v.update(1/60,cam(),0);assert.equal(v.skillZone.visible,true);
 v.die();assert.equal(v.skillZone.visible,false);assert.equal(v.statuses.has('skill'),false);
 v.revive();v.setSkill(true);v.update(1/60,cam(),1);assert.equal(v.skillZone.visible,true);
 v.setSkill(false);assert.equal(v.skillZone.visible,false);
 v.setSkill(true);v.update(1/60,cam(),2);v.alive=false;v._cull=()=>true;
 v.update(1/60,cam(),3);assert.equal(v.skillZone.visible,false);
});

test('operator range style is stable across copies and skins with representative colours and no hatching', async()=>{
 const {skillRangeStyle}=await import('../../public/js/render/units.js');
 const a=skillRangeStyle({charId:'char_358_lisa',id:1,spine:'skin_a'});
 assert.deepEqual(a,skillRangeStyle({charId:'char_358_lisa',id:2,spine:'skin_b'}));
 const b=skillRangeStyle({charId:'char_1020_reed2'});assert.notDeepEqual(a,b);
 assert.equal(a.pattern,undefined);
 assert.equal(skillRangeStyle({charId:'char_4064_mlynar'}).color,0xf1c64f);
 const {skillRangeInset}=await import('../../public/js/render/units.js');
 assert.deepEqual(skillRangeInset([-.5,-.5,.5,-.5],.1),[-.5,-.4,.5,-.4]);
});

test('fixed-facing aerial units never flip towards attack targets',()=>{
 const v=view({kind:'token',fixedFacing:true,motion:'FLY',x:7,y:10});
 v.visFacing=1;v.faceTarget({x:3,y:10});assert.equal(v.visFacing,1);
 v.visFacing=-1;v.update(1/60,cam(),0);assert.equal(v.flipValue,1);
});


test('instant skill footprint can outlive skill-on event without outliving its snapshot or operator',()=>{
 const v=view({charId:'char_102_texas'});v.setSkill(true);v.setSkill(false);
 v.skillTiles=[[10,3],[10,4]];v.update(1/60,cam(),0);assert.equal(v.skillZone.visible,true);
 v.skillTiles=null;v.update(1/60,cam(),.1);assert.equal(v.skillZone.visible,false);
 v.skillTiles=[[10,3]];v.update(1/60,cam(),.2);v.die();assert.equal(v.skillZone.visible,false);
});


test('concealed allies keep opaque bodies and textured mist; refraction draws only while active', async () => {
 const {UF}=await import('../../shared/constants.js');
 const v=view({side:'ally'}); v.fadeIn=1; v.flags=UF.STEALTH;
 let clouds=0; v.stateFx.drawEllipse=()=>{clouds++;return v.stateFx;};
 v.update(1/60,cam(),0);
 await tick();v.update(1/60,cam(),.2);
 assert.equal(v.root.alpha,1);assert.equal(clouds,0,'no ellipse-based fog');assert.ok(v.stealthMist.length>=3);assert.ok(v.stealthMist.every(sp=>sp.alpha>=.5),'mist remains legible through its pulse');assert.ok(v.stealthMist.every(sp=>sp.visible));
 v.flags=0;v.update(1/60,cam(),.3);assert.ok(v.stealthMist.every(sp=>!sp.visible),'mist clears when stealth ends');
 const e=view({side:'enemy'}); e.statuses.add('ab:refraction');
 let arcs=0; e.stateFx.drawPolygon=()=>{arcs++;return e.stateFx;};
 e.update(1/60,cam(),0); assert.equal(arcs,4);
 arcs=0; e.statuses.delete('ab:refraction'); e.update(1/60,cam(),1); assert.equal(arcs,0);
});

test('impostor bounds include the measured attack pose and stay stable after returning to idle',()=>{
 const v=view({});
 const rects=new Map([['Idle',[-80,-150,80,30]],['Attack',[-110,-520,120,40]]]);
 v.actor={entry:{anims:{idle:'Idle',attack:{loop:'Attack'}}},has:name=>rects.has(name),names:new Set(rects.keys()),clipBounds:()=>rects};
 v._box=null;
 const box=v._impBox();
 assert.ok(box.over.has('Attack') || (box.y0<=-520 && box.y0+box.h>=40),'a tall attack is fully included or rendered directly without cropping');
 assert.equal(v._impBox(),box,'idle and attack share stable measured texture bounds');
 v.actor=null;v.destroy();
});

test('skill tiles follow each tile height, and raised overlays clear immediately on retreat',()=>{
 const heights=[],camera=cam(),ctx=fakeViewCtx(fake.P,{assets:store(),heightAt:(r,c)=>c===6?.6:0,cam:()=>camera});
 const original=camera.project.bind(camera);camera.project=(x,y,z,out)=>{heights.push({x,y,z});return original(x,y,z,out);};
 const v=new UnitView(ctx,{id:100,side:'ally',kind:'op',x:5,y:10,maxHp:1000,dir:'RIGHT',skillZoneGrid:[[0,0],[0,1]],charId:'test'});
 v.setSkill(true);v.update(.016,camera,0);
 assert.ok(heights.some(p=>Math.abs(p.x-5)<=.5&&Math.abs(p.z-.02)<1e-6));
 assert.ok(heights.some(p=>Math.abs(p.x-6)<=.5&&Math.abs(p.z-.62)<1e-6));
 assert.equal(v.skillZoneExtra.size,1);v.die();assert.ok([...v.skillZoneExtra.values()].every(g=>!g.visible));v.destroy();
});


test('skill range outline follows the union shape without shared tile borders',async()=>{
 const {skillRangeEdges}=await import('../../public/js/render/units.js');
 const adjacent=skillRangeEdges([[0,0],[0,1]]);
 assert.equal([...adjacent.values()].flat().length,6);
 assert.ok(!adjacent.get('0,0').some(([x0,y0,x1,y1])=>x0===.5&&x1===.5));
 assert.ok(!adjacent.get('0,1').some(([x0,y0,x1,y1])=>x0===-.5&&x1===-.5));
 const box=skillRangeEdges(Array.from({length:9},(_,i)=>[Math.floor(i/3),i%3]));
 assert.equal(box.get('1,1').length,0);assert.equal([...box.values()].flat().length,12);
 const l=skillRangeEdges([[0,0],[0,1],[1,0]]);assert.equal([...l.values()].flat().length,8);
 const shifted=skillRangeEdges([[0-.9,0-.3],[0-.9,1-.3],[1-.9,0-.3]]);assert.equal([...shifted.values()].flat().length,8);
});


test('skill range dash marks leave stable gaps on horizontal and vertical outer edges',async()=>{
 const {skillRangeDashes}=await import('../../public/js/render/units.js');
 const horizontal=skillRangeDashes([-.5,-.5,.5,-.5]);assert.equal(horizontal.length,3);
 for(const [i,edge]of horizontal.entries()){
  assert.ok(Math.abs(edge[2]-edge[0]-.22)<1e-6);
  assert.ok(edge[2]<(horizontal[i+1]?.[0]??.5));
 }
 const vertical=skillRangeDashes([.5,-.5,.5,.5]);assert.equal(vertical.length,3);
 assert.ok(vertical.every(e=>e[0]===.5&&e[2]===.5));
 assert.deepEqual(skillRangeDashes([0,0,0,0]),[]);
});

test('inset union boundaries meet at convex and concave corners, without internal tile edges',async()=>{
 const {skillRangeEdges,skillRangeDashes}=await import('../../public/js/render/units.js');
 for(const tiles of [[[0,0]],[[0,0],[0,1]],[[0,0],[0,1],[1,0]],[[0,0],[1,1]]]){
  const boundary=skillRangeEdges(tiles,.1),points=new Map();
  for(const [r,c]of tiles)for(const e of boundary.get(`${r},${c}`)){
   for(const [x,y]of [[e[0]+c,e[1]+r],[e[2]+c,e[3]+r]]){const key=`${x.toFixed(5)},${y.toFixed(5)}`;points.set(key,(points.get(key)||0)+1);}
   const dashes=skillRangeDashes(e,true);assert.deepEqual(dashes[0].slice(0,2),e.slice(0,2));assert.deepEqual(dashes.at(-1).slice(2),e.slice(2));
  }
  assert.ok([...points.values()].every(count=>count===2),'every contour corner joins exactly two edges');
 }
 const edges=skillRangeEdges([[0,0]],.1).get('0,0');assert.deepEqual(edges[0],[-.4,-.4,.4,-.4]);
});

test('operator colours stay intact while pastel outlines gain saturation',async()=>{
 const {skillRangeStyle}=await import('../../public/js/render/units.js');
 for(const charId of ['char_358_lisa','char_388_mint','char_4064_mlynar','char_469_indigo']){
  const a=skillRangeStyle({charId,skillIndex:0});
  for(const skillIndex of [1,2])assert.deepEqual(a,skillRangeStyle({charId,skillIndex}));
  assert.equal(a.source,'operator-concept');assert.equal(a.fillAlpha,.17);
  const rgb=c=>[c>>16&255,c>>8&255,c&255],spread=c=>Math.max(...rgb(c))-Math.min(...rgb(c));
  assert.ok(spread(a.outlineColor)>=spread(a.color));assert.equal(a.pattern,undefined);
 }
 assert.equal(skillRangeStyle({charId:'char_4064_mlynar'}).color,0xf1c64f);
});

test('status effects are not dropped when the four HUD icon slots are full; shield flag produces a barrier',async()=>{
 const {UF}=await import('../../shared/constants.js');
 const v=view({side:'enemy'});v.flags=UF.STUNNED|UF.SLEEP|UF.COLD|UF.INVULN|UF.SHIELD;v.statuses.add('ab:refraction');
 assert.equal(v._iconKeys().length,4);
 assert.ok(v._iconKeys(Infinity).includes('refraction'));
 let bubbles=0,polys=0;v.stateFx.drawEllipse=()=>{bubbles++;return v.stateFx;};v.stateFx.drawPolygon=()=>{polys++;return v.stateFx;};
 v.update(1/60,cam(),0);assert.ok(bubbles>=2);assert.equal(polys,4);
});

test('freeze covers the full body and pauses Spine instead of changing its playback rate permanently',async()=>{
 const {UF}=await import('../../shared/constants.js');const v=view({side:'enemy'},{},store({spine:true}));await tick();await tick();
 const updates=[];v.actor.update=dt=>updates.push(dt);
 assert.ok(v.root.children.indexOf(v.stateFx)>v.root.children.indexOf(v.body),'ice is drawn in front of the opaque body');
 const polys=[];v.stateFx.drawPolygon=p=>{polys.push(p);return v.stateFx;};
 v.flags=UF.FROZEN;v.update(1/60,cam(),0);assert.ok(polys[0].some((v,i)=>i%2===1&&v<0));assert.ok(updates.every(dt=>dt===0));
 v.flags=0;v.update(1/60,cam(),1);assert.ok(updates.at(-1)>0);
});

test('stealth darkens the equipped Spine tint without fading the body and restores it on exit',async()=>{
 const {UF}=await import('../../shared/constants.js');
 const v=view({side:'ally'}, {},store({spine:true}));await tick();await tick();
 for(let i=0;i<30;i++)v.update(1/60,cam(),i/60);
 v.flags=UF.STEALTH;v.update(1/60,cam(),1);
 assert.equal(v.root.alpha,1);assert.equal(v.actor.spine.alpha,1);assert.notEqual(v.actor.spine.tint,0xffffff);
 v.flags=0;v.update(1/60,cam(),1.1);assert.equal(v.actor.spine.tint,0xffffff);
});

test('preparation skeletons never enter the shared impostor atlas even under high load', async () => {
 let allocated=0;
 const ctx=fakeViewCtx(fake.P,{assets:store({spine:true}),cam,renderer:{resolution:1,render(){}},impostorInterval:()=>3,loadLevel:()=>2,impostors:{alloc(){allocated++;return null},park(){},unpark(){}}});
 const v=new UnitView(ctx,{id:91,side:'ally',kind:'op',defId:'char_x',x:5,y:12,maxHp:1000},{prep:true});
 await tick();await tick();for(let i=0;i<30;i++)v.update(1/60,cam(),i/60);
 assert.ok(v.spineReady);assert.ok(!v.imp);assert.equal(allocated,0);v.destroy();
});

test('clipped combat skeletons use an isolated target cleared on every refresh', async()=>{
 let allocated=0;const renders=[];
 const ctx=fakeViewCtx(fake.P,{assets:store({spine:true}),cam,renderer:{resolution:1,render(obj,opts){renders.push(opts)}},impostorInterval:()=>1,impostors:{alloc(){allocated++;return null},park(o){o.visible=false},unpark(o){o.visible=true}}});
 const v=new UnitView(ctx,{id:92,side:'ally',kind:'op',defId:'char_x',x:5,y:12,maxHp:1000});await tick();await tick();
 v.actor.clipped=true;v.actor.clipOn=true;
 for(let i=0;i<5;i++)v.update(1/60,cam(),i/60);
 assert.equal(allocated,0);assert.equal(renders.length,5);assert.ok(renders.every(o=>o.clear===true));assert.ok(v.imp.rt);v.destroy();
});

test('ally HP bars retain their normal color below 30 percent and after healing',()=>{
 const v=view({kind:'op'});
 v.hp=1000;v._updateHud(1/60,40,100,100,1,0);const normal=v.hpFill.tint,width=v.hpFill.width;
 for(const hp of [299,100,1,700]){v.hp=hp;v._updateHud(1/60,40,100,100,1,0);assert.equal(v.hpFill.tint,normal);assert.ok(Math.abs(v.hpFill.width-width*hp/1000)<1e-8);}
 v.destroy();
});

test('frozen allies and enemies still play their death clip while the last snapshot retains FROZEN',async()=>{
 const {UF}=await import('../../shared/constants.js');
 for(const side of ['ally','enemy']){
  const assets=store({spine:true});const entry={skel:'/s/death.skel',atlas:'/s/death.atlas',textures:[],animations:{Idle:1,Die:.8},anims:{idle:'Idle',die:'Die'}};
  assets.spineEntry=()=>entry;assets.spine.acquire=async()=>({animations:[{name:'Idle'},{name:'Die'}]});
  const v=view({side,kind:side==='enemy'?'enemy':'op'},{},assets);await tick();await tick();
  v.flags=UF.FROZEN;v.update(1/60,cam(),0);v.die();await tick();await tick();
  v.update(.2,cam(),.2);
  assert.equal(v.flags&UF.FROZEN,UF.FROZEN,'the stale snapshot remains frozen');
  assert.equal(v.actor.current,'Die');assert.ok(v.actor.spine.state.tracks[0].trackTime>0,'death animation advances');
  assert.equal(v.actor.frozen,false);v.destroy();
 }
});

test('skill outlines share their inset and animate dashes without leaving the edge',async()=>{
 const {skillRangeStyle,skillRangeDashes}=await import('../../public/js/render/units.js');
 assert.equal(skillRangeStyle({charId:'char_358_lisa'}).inset,skillRangeStyle({charId:'char_4064_mlynar'}).inset);
 const edge=[0,0,1,0],first=skillRangeDashes(edge,false,0),next=skillRangeDashes(edge,false,.16);
 assert.notDeepEqual(first,next);
 for(const phase of [0,.16,.32,.64])for(const [x0,y0,x1,y1] of skillRangeDashes(edge,false,phase)){
  assert.ok(x0>=0&&x1<=1&&x1>x0);assert.equal(y0,0);assert.equal(y1,0);
 }
});


test('airborne movers enter union fields aloft and keep altitude over raised surfaces',async()=>{
 const {FLY_HOVER}=await import('../../public/js/render/units.js');
 const {UF,ANIM}=await import('../../shared/constants.js');
 const camera=presetCamera('unite',{width:1600,height:900});
 const native=view({side:'enemy',motion:'FLY',kind:'enemy'});
 assert.equal(native.hover,FLY_HOVER,'native flight is already elevated on the first frame');
 const late=view({side:'enemy',kind:'enemy'});late.ctx.heightAt=(r,c)=>c>=12?.55:0;
 const sample=(x,flags)=>({id:1,x,y:10,hp:1000,maxHp:1000,sp:0,spMax:0,anim:ANIM.MOVE,flags});
 late.sync(sample(11,UF.FLYING),0);late.update(1/60,camera,0);assert.equal(late.hover,FLY_HOVER,'first airborne snapshot also enters elevated');
 late.sync(sample(12,UF.FLYING),.05);late.update(1/60,camera,.05);
 assert.equal(late.z+late.hover,FLY_HOVER,'terrain height must not change flight altitude');
 late.sync(sample(11,UF.FLYING),.1);late.update(1/60,camera,.1);assert.ok(late.z+late.hover>=FLY_HOVER);
 late.sync(sample(11,0),.2);for(let i=0;i<90;i++)late.update(1/60,camera,.2+i/60);assert.equal(late.flying,false);assert.equal(late.hover,0,'temporary flight still expires and lands');
 const ground=view({side:'enemy',kind:'enemy'});ground.ctx.heightAt=()=>.55;ground.sync(sample(12,0),0);ground.update(1/60,camera,0);assert.equal(ground.z,0,'ground enemy movement is unchanged');
 native.destroy();late.destroy();ground.destroy();
});

test('range fill keeps its original colour; saturated outlines are not recoloured',async()=>{
 const {skillRangeStyle}=await import('../../public/js/render/units.js');
 const {skillVisualTheme}=await import('../../public/js/render/skillVisualTheme.js');
 for(const info of [{charId:'char_4064_mlynar'},{charId:'char_172_svrash'},{charId:'char_350_surtr'}]){
  const raw=skillVisualTheme(info).color,s=skillRangeStyle(info);assert.equal(s.color,raw);
  const rgb=c=>[c>>16&255,c>>8&255,c&255],a=rgb(raw),b=rgb(s.outlineColor);
  const sat=(Math.max(...a)-Math.min(...a))/Math.max(...a);
  if(sat>=.45)assert.equal(s.outlineColor,raw,'already saturated hue remains unchanged');
  else{assert.equal(Math.max(...a),Math.max(...b),'brightness remains unchanged');assert.ok((Math.max(...b)-Math.min(...b))/Math.max(...b)>.59);}
 }
});

 test('hit tint fades slightly longer but clears within a quarter second',()=>{
 const v=view({side:'ally'});v.onHit();v.update(.18,cam(),.18);assert.ok(v.flash>0);v.update(.05,cam(),.23);assert.equal(v.flash,0);
 });

test('mystic charge count initializes a real HUD text and clears in preparation',()=>{
 const v=view({energyMax:3});v.setEnergy(2);assert.equal(v.energyText.text,'●●○');assert.equal(v.energyText.visible,true);
 v.prep=true;v.setEnergy(1);assert.equal(v.energyText.visible,false);
});

test('the shield sits inside the HP bar right after the HP fill, sized by the remaining shield HP',()=>{
 const v=view({maxHp:1000});v.hp=600;v.shieldHp=250;v.update(.016,cam(),0);
 assert.equal(v.shieldBar.visible,true);
 assert.ok(Math.abs(v.shieldBar.position.y-v.hpFill.position.y)<1e-6,'same row as the HP fill');
 assert.ok(Math.abs(v.shieldBar.position.x-(v.hpFill.position.x+v.hpFill.width))<1e-6,'starts where the HP ends');
 assert.ok(Math.abs(v.shieldBar.width/v.hpFill.width-250/600)<1e-6);
 // HP + shield past the max HP rescales the bar to their sum
 v.hp=1000;v.shieldHp=1000;v.update(.016,cam(),1);assert.ok(Math.abs(v.shieldBar.width/v.hpFill.width-1)<1e-6);
 v.shieldHp=0;v.flags=32;v.update(.016,cam(),2);assert.equal(v.shieldBar.visible,false);v.destroy();
});

test('fixed giant boss art and HUD use the hit-area centre without moving its simulation position',async()=>{
 const camera=presetCamera('boss',{width:1440,height:900});
 const ctx=fakeViewCtx(fake.P,{assets:store({spine:true}),cam:()=>camera});
 ctx.lookupDef=()=>({hitArea:{w:4.95,h:2.95,dx:1,dy:1}});
 const v=new UnitView(ctx,{id:1,kind:'enemy',side:'enemy',defId:'organ',boss:true,x:9,y:3,maxHp:1000});
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.ok(v.spineReady);v.bossModelCenter=80;v.visFacing=-1;v.update(.016,camera,0);
 const centre=camera.project(10,3,0);assert.equal(v.screen.x,centre.x);assert.equal(v.x,9);assert.equal(v.y,3);
 assert.ok(v.body.position.x>0);
 v.visFacing=1;v.flipValue=null;v.update(.016,camera,1);assert.ok(v.body.position.x<0);assert.equal(v.screen.x,centre.x);
 v.destroy();
});

test('active Notes display one foreground treble-clef effect regardless of stack count and hide on expiry',()=>{
 const v=view({kind:'enemy',side:'enemy'});v.setNoteStacks(1);v.update(.016,cam(),0);
 assert.ok(v.noteClef);assert.ok(v.noteFx.visible);assert.ok(v.root.children.indexOf(v.noteFx)>v.root.children.indexOf(v.body));
 const clef=v.noteClef,fx=v.noteFx;v.setNoteStacks(600);v.update(.016,cam(),1);assert.equal(v.noteClef,clef);assert.equal(v.noteFx,fx);assert.ok(v.noteFx.visible);
 v.setNoteStacks(0);v.update(.016,cam(),2);assert.equal(v.noteFx.visible,false);v.destroy();
});

test('Eyjafjalla Volcano uses its front model while facing up, returning to back when the skill ends',async()=>{
 const {UF}=await import('../../shared/constants.js');
 for(const id of ['char_180_amgoat','skin_char_180_amgoat_summer_5','skin_char_180_amgoat_sanrio_2']){
  const a=store();a.hasBack=()=>true;
  const v=view({spine:id,charId:'char_180_amgoat',skillIndex:2}, {},a);v.dir='UP';v.alive=true;
  v.flags=0;assert.equal(v._wantsBack(),true);v.flags=UF.SKILL;assert.equal(v._wantsBack(),false);
  v.info.skillIndex=1;assert.equal(v._wantsBack(),true);v.destroy();
 }
});

describe('GitHub #648: the Hidden Core 假想敌：管 (enemy_9021_acduml_2)', () => {
  const boss = (defId) => view({ side: 'enemy', kind: 'enemy', defId, boss: true, x: 9, y: 3, maxHp: 600000 });

  test('faces right as authored whatever turn it is given — so do the other 管 and both 胄; other leaders still turn', () => {
    for (const key of ['enemy_9021_acduml_2', 'enemy_9021_acduml', 'enemy_9013_acstmk', 'enemy_9013_acstmk_2']) {
      const h = boss(key);
      assert.equal(h.visFacing, 1, `${key}: right from the start`);
      h.visFacing = -1; // an attack, a walk or the prep leader's faceLeader
      assert.equal(h.visFacing, 1, `${key}: still right`);
    }
    const b = boss('enemy_1521_dslily'); // 盐风主教昆图斯: a huge leader with the regular FaceSwitcher 3
    assert.equal(b.visFacing, -1, 'an enemy starts facing left');
    b.visFacing = 1;
    assert.equal(b.visFacing, 1, 'and turns');
  });

  test('its boss HUD sits 1.4 tiles right of the model (the prefab _bossHudOffset); the model stays on its tile', () => {
    const h = boss('enemy_9021_acduml_2');
    const b = boss('enemy_9021_acduml');
    for (const v of [h, b]) v.update(1 / 60, cam(), 0);
    assert.equal(h.screen.x, b.screen.x, 'the model is drawn at the unit position');
    const c = cam();
    const dx = c.project(10.4, 3, 0).x - c.project(9, 3, 0).x;
    assert.ok(dx > 0);
    assert.ok(Math.abs((h.hpFill.position.x - b.hpFill.position.x) - dx) < 1, `HP bar moved by ${h.hpFill.position.x - b.hpFill.position.x} px (1.4 tiles ≈ ${dx})`);
  });
});

test('official shield replaces custom status geometry while Notes remain visible',async()=>{
 const {UF}=await import('../../shared/constants.js');const v=view({side:'enemy'});
 v.flags=UF.SHIELD;let bubbles=0;v.stateFx.drawEllipse=()=>{bubbles++;return v.stateFx;};
 v.update(.016,cam(),0);assert.ok(bubbles>0);
 bubbles=0;v.ctx.ofx={active:true};v.ctx.officialStatusKey=name=>name==='shield'?'common_shield_01':null;
 v.setNoteStacks(3);v.setCorrosion(1);v.update(.016,cam(),1);
 assert.equal(bubbles,0);assert.equal(v.noteFx.visible,true);assert.ok(v.noteClef);assert.equal(v.corrosionFx.visible,true);
 v.ctx.ofx.active=false;v.update(.016,cam(),2);assert.ok(bubbles>0);v.destroy();
});

test('official effects replace mystic stored-attack displays and imperial drone range circles',()=>{
 const caster=view({energyMax:3});caster.ctx.ofx={active:true};caster.setEnergy(2);caster.update(.016,cam(),0);assert.equal(caster.energyText.visible,false);
 caster.ctx.ofx.active=false;caster.update(.016,cam(),.1);assert.equal(caster.energyText.visible,true);caster.destroy();
 const drone=view({side:'enemy',defId:'enemy_1112_emppnt',spine:'enemy_1112_emppnt',rangeRadius:2});drone.ctx.ofx={active:true};drone.update(.016,cam(),0);assert.equal(drone.attackRange.visible,false);
 drone.ctx.ofx.active=false;drone.update(.016,cam(),.1);assert.equal(drone.attackRange.visible,true);drone.destroy();
});

test('invulnerable summons hide HP and invulnerability while ordinary units retain both',async()=>{
 const {UF}=await import('../../shared/constants.js');
 for(const kind of ['token','chess']){
  const v=view({kind});v.flags=UF.INVULN;v.update(1/60,cam(),1);
  assert.equal(v.hpBg.visible,kind!=='token');
  assert.equal(v._iconKeys(Infinity).includes('invuln'),kind!=='token');
  v.flags=0;v.update(1/60,cam(),2);assert.equal(v.hpBg.visible,true);v.destroy();
 }
});

test("an operator's 起飞 lifts its model alone: the HP bar keeps its ground place", async () => {
 const {UF,ANIM}=await import('../../shared/constants.js');
 const camera=presetCamera('normal',{width:1600,height:900});
 const mk=(flags)=>{const v=view({settings:undefined});v.ctx.settings={hpBarStyle:'official'};const s={id:1,x:5,y:12,hp:1000,maxHp:1000,sp:0,spMax:0,anim:ANIM.IDLE,flags};v.sync(s,0);for(let i=0;i<60;i++)v.update(1/60,camera,i/60);return v;};
 const ground=mk(0),air=mk(UF.FLYING);
 assert.ok(air.hover>0,'airborne');
 assert.ok(air.root.y<ground.root.y-1,'the model is up');
 assert.ok(Math.abs(air.hpBg.y-ground.hpBg.y)<0.5,`the bar stays (${air.hpBg.y} vs ${ground.hpBg.y})`);
 ground.destroy();air.destroy();
});

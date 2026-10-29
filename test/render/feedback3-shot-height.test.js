// Attack points use the same fixed world plane as the authored models.
// Camera framing changes only their projection, never their world coordinates.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { installFakePixi, fakeViewCtx } from './fakepixi.js';
import { presetCamera } from '../../public/js/render/projection.js';
import {UF} from '../../shared/constants.js';

let fake, FX, UnitView;
before(async () => {
  fake = installFakePixi();
  FX = await import('../../public/js/render/fx.js');
  ({ UnitView } = await import('../../public/js/render/units.js'));
});
after(() => fake.restore());

const cam = presetCamera('normal', { width: 1600, height: 900 });
test('temporary airborne snapshots put an actual UnitView above ground units and restore depth after landing',()=>{
 const ctx=fakeViewCtx(fake.P,{cam});
 const air=new UnitView(ctx,{id:91,kind:'enemy',side:'enemy',x:5,y:12,maxHp:1000,flying:true});
 const ground=new UnitView(ctx,{id:92,kind:'op',side:'ally',x:5,y:9,maxHp:1000});
 assert.equal(air.flying,true,'spawn/reconnect preserves temporary flight before its first snapshot');
 const sample=flags=>({x:5,y:12,hp:1000,maxHp:1000,sp:0,spMax:0,flags,anim:0,vx:0});
 air.sync(sample(UF.FLYING),0);air.update(.05,cam,0);ground.update(.05,cam,0);
 assert.ok(air.root.zIndex>ground.root.zIndex);
 air.sync(sample(0),.1);air.update(.05,cam,.1);
 assert.equal(air.flying,false);assert.ok(air.root.zIndex<ground.root.zIndex);
 air.destroy();ground.destroy();
});
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg}: ${a} vs ${b}`);

test('Camera.liftFor: the world height that draws `px` above a point — exact on every preset camera', () => {
  const fields = { normal: [[2, 9, 0], [10, 11, 0.4], [9, 12, 0]], prep: [[2, 7, 0.16], [8, 12, 0]], boss: [[3, 0, 0], [10, 3, 0], [18, 5, 0.4]], unite: [[2, 9, 0], [18, 12, 0]] };
  for (const [kind, pts] of Object.entries(fields)) {
    const c = presetCamera(kind, { width: 1280, height: 720 });
    for (const [x, y, z] of pts) {
      for (const px of [0, 20, 64, 140]) {
        const h = c.liftFor(x, y, z, px);
        close(c.project(x, y, z).y - c.project(x, y, z + h).y, px, 1e-6, `${kind} (${x},${y},${z}) +${px}px`);
      }
    }
  }
  const s = cam.scaleAt(5, 10, 0);
  assert.ok(cam.liftFor(5, 10, 0, s) > 1.8, 'one tile of screen height is ≈ 2 world tiles under the 30° pitch');
});

/** A unit view as the FX system reads it. */
const unit = (id, x, y, o = {}) => ({ id, x, y, z: 0, hover: 0, _headTiles: 1.18, alive: true, destroyed: false, isEnemy: false, info: { defId: 'char_x' }, onHit() {}, ...o });
function makeFx() {
  const ctx = fakeViewCtx(fake.P);
  return new FX.FxSystem({
    P: fake.P, layers: ctx.layers, cam: () => cam, heightAt: () => 0, settings: { quality: 'high', damageNumbers: true },
    timeScale: () => 2, loadLevel: () => 0, subProfOf: () => null, view: () => null, screenSize: () => ({ width: 1600, height: 900 }), fieldTop: () => 120,
  });
}
/** Share of a unit's drawn model height (above its feet, on screen) of world point (x, y, z). */
const share = (v, x, y, z) => { const f = cam.project(x, y, v.z); return (f.y - cam.project(x, y, z).y) / (v._headTiles * f.s); };

test('an arrow leaves the shooter at its hands and flies at the target\'s chest (SHOT_HEIGHT), not at the hips', () => {
  assert.deepEqual({ ...FX.SHOT_HEIGHT }, { launch: 0.45, aim: 0.5 });
  const fx = makeFx();
  const src = unit(1, 3, 10), tgt = unit(2, 7, 11, { isEnemy: true, _headTiles: 1.6 });
  fx.attack(src, tgt, 'arrow');
  const pr = fx.projs[fx.projs.length - 1];
  close(pr.z0,src.z+src.hover+src._headTiles*FX.MODEL_WORLD_HEIGHT*FX.SHOT_HEIGHT.launch,1e-9,'fixed world launch height');
  close(pr.tz,tgt.z+tgt.hover+tgt._headTiles*FX.MODEL_WORLD_HEIGHT*FX.SHOT_HEIGHT.aim,1e-9,'fixed world target height');
  // the old rule: 0.45 × head height as a world height → ≈ 18–23 % of the model
  assert.ok(share(src, src.x, src.y, 0.45 * src._headTiles) < 0.25, 'the hip height it used to start from');
  // a raised / flying unit: measured from where it is drawn
  const fly = unit(3, 6, 9, { z: 0.4, hover: 0.32 });
  close(FX.bodyZ(cam,fly,.5),.72+1.18*.5*FX.MODEL_WORLD_HEIGHT,1e-9);
});

test('operator models and fallback portraits both keep their place on an attack', async () => {
  const entry = { skel: '/s/x.skel', atlas: '/s/x.atlas', textures: ['/s/x.png'], anims: { idle: 'Idle', attack: { begin: null, loop: 'Attack', end: null } }, animations: { Idle: 1, Attack: 1 } };
  let ready = false;
  const assets = { picture: () => null, image: async () => null, spineEntry: () => entry,
    spine: { acquire: () => (ready ? Promise.resolve({ animations: [{ name: 'Idle' }, { name: 'Attack' }] }) : new Promise(() => {})), release() {} } };
  const make = () => new UnitView(fakeViewCtx(fake.P, { assets, cam: () => cam }), { id: 1, side: 'ally', kind: 'op', defId: 'c', spine: 'c', tier: 3, x: 4, y: 10, maxHp: 1000, dir: 'RIGHT' });
  const target = { x: 8, y: 12 };
  const feet = cam.project(4, 10, -0.08);   // units stand STAND_SINK (0.08 tile) below the tile top (render/units.js)
  // no model (still loading): the operator portrait also stays fixed
  const d = make();
  d.update(1 / 60, cam, 0);
  d.onAttack(target, 1, 'arrow');
  d.update(0.1, cam, 0.1); d.update(0.01, cam, 0.11);   // (the jolt peaks a tenth of a second in)
  close(d.root.position.x, feet.x, 1e-6, 'portrait x'); close(d.root.position.y, feet.y, 1e-6, 'portrait y');
  // a Spine model shown: no jolt
  ready = true;
  const v = make();
  await new Promise((r) => setImmediate(r)); await new Promise((r) => setImmediate(r));
  assert.ok(v.actor && v.spineReady);
  v.update(1 / 60, cam, 0);
  v.onAttack(target, 1, 'arrow');
  for (let i = 0; i < 4; i++) {
    v.update(0.05, cam, 0.05 * i);
    close(v.root.position.x, feet.x, 1e-6, 'x'); close(v.root.position.y, feet.y, 1e-6, 'y');
  }
  assert.equal(v.actor.current, 'Attack', 'the model shows the attack with its own clip');
});

test('submerged ground bodies sink and recover without lowering airborne or platform units', async () => {
  const {submergedVisual} = await import('../../public/js/render/units.js');
  let tile = {drawn:true,glyph:'d',devH:0};
  const ctx=fakeViewCtx(fake.P,{cam});ctx.tileAt=()=>tile;
  const v=new UnitView(ctx,{id:991,kind:'op',side:'ally',x:5,y:9,maxHp:1000});
  assert.equal(submergedVisual(ctx,v),true);
  v.update(.1,cam,0);assert.equal(v.waterSink,-.18);
  const p=FX.bodyPoint(cam,v,.5);const sink=p.z;
  tile={drawn:true,glyph:'R'};v.update(.1,cam,.1);
  assert.equal(v.waterSink,0);assert.ok(FX.bodyPoint(cam,v,.5).z>sink);
  tile={drawn:true,glyph:'d',devH:.2};assert.equal(submergedVisual(ctx,v),false);
  tile.devH=0;v.flying=true;assert.equal(submergedVisual(ctx,v),false);
  v.destroy();
});


test('stationary boss sorts between the rear two rows and front two rows in every boss framing', async()=>{
 const {unitDepthKey}=await import('../../public/js/render/units.js');
 const area={w:4.95,h:2.95,dx:0,dy:1};
 for(const [side,half]of [['L',true],['R',true],['L',false]]){
  const camera=presetCamera('boss',{width:1440,height:900,side,half});
  const boss=unitDepthKey(camera,10,1,0,false,area);
  for(const x of [7,10,13]){
   for(const y of [4,3])assert.ok(unitDepthKey(camera,x,y)<boss,'rear rows are behind the boss');
   for(const y of [1,0])assert.ok(unitDepthKey(camera,x,y)>boss,'front rows cover the boss');
  }
  assert.equal(unitDepthKey(camera,10,1,0,true,area),unitDepthKey(camera,10,1,0,true),'airborne and moving units are unchanged');
 }
});

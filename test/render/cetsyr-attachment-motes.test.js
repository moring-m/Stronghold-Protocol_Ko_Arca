import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {installFakePixi} from './fakepixi.js';
import {MoteRing,MOTE_ART,MOTE_ORBIT} from '../../public/js/render/motes.js';
let fake,UnitView;
before(async()=>{fake=installFakePixi();({UnitView}=await import('../../public/js/render/units.js'));});
after(()=>fake.restore());
test('official attachment ring is bounded, retries delayed textures and destroys its sprites',()=>{
 let texture=null;const ring=new MoteRing({PIXI:fake.P,getTexture:()=>texture});
 ring.setState(3);assert.equal(ring.sprites.length,3);
 texture=new fake.P.Texture();ring.setState(3);
 assert.equal(ring.sprites[0].texture,texture);assert.equal(ring.sprites[0].width,MOTE_ART.w);assert.equal(ring.sprites[0].height,MOTE_ART.h);
 ring.setState(6,true);assert.equal(ring.sprites.length,6);assert.equal(ring.sprites[0].position.x,MOTE_ORBIT.wide);
 for(let i=0;i<1800;i++)ring.update(1/60);
 assert.equal(ring.sprites.length,6);assert.equal(ring.root.children.length,6);
 ring.destroy();assert.equal(ring.sprites.length,0);
});
test('mote orbit preserves missing slots and battle phase, pauses with game time, expires and leaves simplified mode alone',()=>{
 const view={P:fake.P,ctx:{ofx:{active:true,time:2}},alive:true,down:false,spineReady:true,actor:{effectTexture:()=>new fake.P.Texture()},body:new fake.P.Container()};
 view.setMoteState=UnitView.prototype.setMoteState;view.sync=UnitView.prototype._syncMoteRing;
 view.setMoteState({slots:[true,false,true],phase:1,speed:30,radius:1.15});view.sync();
 const ring=view.moteRing;assert.equal(ring.sprites.length,3);assert.equal(ring.sprites[1].visible,false);
 const p=ring.phase;for(let i=0;i<120;i++)view.sync();assert.equal(ring.phase,p);
 view.ctx.ofx.time=2.5;view.sync();assert.ok(Math.abs(ring.phase-(1+Math.PI/12))<1e-9);
 view.ctx.ofx.time=2.8;view.sync();assert.equal(view.moteRing,null);
 view.setMoteState({slots:[true,true,true]});view.ctx.ofx.active=false;view.sync();assert.equal(view.moteRing,null);
});

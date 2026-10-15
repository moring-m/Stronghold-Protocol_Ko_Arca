import {test} from 'node:test';import assert from 'node:assert/strict';import{installFakePixi,fakeViewCtx}from'./fakepixi.js';
test('HP loss trail disappears in .3 seconds at every frame rate and healing/max HP changes stay bounded',async()=>{
 const fake=installFakePixi();try{const{UnitView}=await import('../../public/js/render/units.js');
 for(const fps of [30,60,120]){const v=new UnitView(fakeViewCtx(fake.P),{id:1,kind:'op',side:'ally',maxHp:100});v.hp=20;v._updateHpTrail(0);assert.equal(v.ghostHp,100);for(let i=0;i<fps*.3+1;i++)v._updateHpTrail(1/fps);assert.equal(v.ghostHp,20);v.hp=10;v._updateHpTrail(.05);assert.ok(v.ghostHp>10);v.hp=100;v._updateHpTrail(0);assert.equal(v.ghostHp,100);v.maxHp=1;v.hp=.5;v._updateHpTrail(0);assert.ok(v.ghostHp<=1);v._updateHpTrail(.31);assert.equal(v.ghostHp,.5);v.destroy();}
 }finally{fake.restore();}
});

test('skill maximum-HP changes never create a white damage trail, while real subsequent damage does',async()=>{
 const fake=installFakePixi();try{const{UnitView}=await import('../../public/js/render/units.js'),v=new UnitView(fakeViewCtx(fake.P),{id:2,kind:'op',side:'ally',maxHp:100});
 v._updateHpTrail(0);v.maxHp=300;v.hp=300;v._updateHpTrail(0);assert.equal(v.ghostHp,300);
 v.maxHp=100;v.hp=100;v._updateHpTrail(0);assert.equal(v.ghostHp,100);assert.equal(v._trailRemaining,0);
 v.hp=80;v._updateHpTrail(0);assert.equal(v.ghostHp,100);assert.equal(v._trailRemaining,.3);v._updateHpTrail(.31);assert.equal(v.ghostHp,80);v.destroy();
 }finally{fake.restore();}
});

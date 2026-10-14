import{test}from'node:test';import assert from'node:assert/strict';import{installFakePixi,fakeViewCtx}from'./fakepixi.js';
test('corrosion snapshot stacks activate a target-owned haze and clearing them hides it',async()=>{
 const fake=installFakePixi();try{const{UnitView}=await import('../../public/js/render/units.js');const v=new UnitView(fakeViewCtx(fake.P),{id:1,kind:'enemy',side:'enemy',maxHp:100});v.setCorrosion(1);assert.equal(v.corrosionFx.parent,v.root);assert.equal(v.corrosionFx.visible,true);v.setCorrosion(50);assert.equal(v.corrosionStacks,50);v.setCorrosion(0);assert.equal(v.corrosionFx.visible,false);v.destroy();}finally{fake.restore();}
});

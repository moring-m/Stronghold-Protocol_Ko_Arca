import {test,before,after} from 'node:test';import assert from 'node:assert/strict';
import {installFakePixi,fakeViewCtx} from './fakepixi.js';import {presetCamera} from '../../public/js/render/projection.js';import {renderInfo} from '../../public/js/render/app/info.js';
let fake,UnitView,FxSystem;before(async()=>{fake=installFakePixi();({UnitView}=await import('../../public/js/render/units.js'));({FxSystem}=await import('../../public/js/render/fx.js'));});after(()=>fake.restore());
test('mystic charges are smaller, below SP and above extra gauges at each zoom level',()=>{
 for(const max of [3,4,9])for(const zoom of [45,90,140]){const v=new UnitView(fakeViewCtx(fake.P),{id:1,kind:'op',side:'ally',energyMax:max,maxHp:100});try{v.spMax=100;v.sp=20;v.setEnergy(max-1);v._updateHud(.02,zoom,200,200,1,0);assert.equal(v.energyText.style.fontSize,12);assert.equal(v.energyText.text,'●'.repeat(max-1)+'○');assert.ok(v.energyText.y-v.energyText.height/2>v._spY);assert.equal(v.energyText.visible,true);v.prep=true;v._updateHud(.02,zoom,200,200,1,0);assert.equal(v.energyText.visible,false);}finally{v.destroy();}}
});
test('secondary unit-info adapter preserves the charge count and capacity',()=>{const r=renderInfo({id:1,energy:4,energyMax:9});assert.equal(r.energy,4);assert.equal(r.energyMax,9);});

test('arts attack creates a visible pooled projectile instead of disappearing',()=>{
 const ctx=fakeViewCtx(fake.P),src=new UnitView(ctx,{id:1,kind:'token',side:'ally',maxHp:100,x:4,y:10}),target=new UnitView(ctx,{id:2,kind:'enemy',side:'enemy',maxHp:100,x:6,y:10});
 const fx=new FxSystem({...ctx,cam:()=>presetCamera('normal',{width:1280,height:720}),heightAt:()=>0,settings:{quality:'high'},timeScale:()=>1,view:id=>id===1?src:target,screenSize:()=>({width:1280,height:720}),fieldTop:()=>0});
 try{fx.attack(src,target,'arts');assert.equal(fx.projs.length,1);assert.ok(fx.projs[0].core.visible);}
 finally{fx.destroy();src.destroy();target.destroy();}
});

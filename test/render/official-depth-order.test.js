import test from 'node:test';
import assert from 'node:assert/strict';
import {OfficialFx} from '../../public/js/render/vfx/system.js';
import {presetCamera} from '../../public/js/render/projection.js';
class Container {
 constructor(){this.children=[];}
 addChild(child){child.parent?.removeChild(child);this.children.push(child);child.parent=this;}
 removeChild(child){this.children=this.children.filter(c=>c!==child);child.parent=null;}
 destroy(){this.parent?.removeChild(this);this.destroyed=true;}
}
test('attached official effects interleave with unit models; ground and explicit overlays retain their passes',()=>{
 const renderer={screen:{width:1280,height:720}},cam=presetCamera('normal',renderer.screen);
 const fx=new OfficialFx({P:{Container},renderer,cam:()=>cam,lib:{}});fx.glr={upload(){}};
 const a={root:new Container()},b={root:new Container()};const am={},bm={};a.root.addChild(am);b.root.addChild(bm);
 const entries=[];
 function entry(id,owner,ground=false,queue=3000,order=0){const effect={depthOwner:owner,build:()=>({kind:'ps',first:entries.indexOf(e)*6,count:6})};const e={id,effect,ground,queue,order,layer:0,dist:0,mat:{state:{}},meshKey:null};entries.push(e);return e;}
 entry('a-late',a,false,3000,2);entry('b',b);entry('a-early',a,false,3000,1);entry('ground',a,true);entry('overlay',a,false,4000);entry('world',null);
 fx.effects=[{gather(_cam,sink){entries.forEach(sink);}}];fx._prepare(renderer);
 assert.deepEqual(fx.unitItems.get(a).map(e=>e.id),['a-early','a-late']);assert.deepEqual(fx.unitItems.get(b).map(e=>e.id),['b']);
 assert.deepEqual(fx.items.ground.map(e=>e.id),['ground']);assert.deepEqual(fx.items.over.map(e=>e.id),['overlay','world'].sort((x,y)=>x==='world'?-1:1));
 assert.deepEqual(a.root.children,[am,fx.unitLayers.get(a)]);assert.deepEqual(b.root.children,[bm,fx.unitLayers.get(b)]);
 const old=fx.unitLayers.get(a);entries.splice(0,entries.length);fx.frameNo++;fx._prepare(renderer);assert.equal(old.destroyed,true);assert.deepEqual(a.root.children,[am]);assert.equal(fx.unitLayers.size,0);
});

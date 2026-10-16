import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FxSystem} from '../../public/js/render/fx.js';
class Point {set(x,y=x){this.x=x;this.y=y;}}
class Text {constructor(text,options){this.options=options;this.anchor=new Point();this.position=new Point();this.scale=new Point();}destroy(){}}
class Container {constructor(){this.position=new Point();this.scale=new Point();this.children=[];}addChild(t){this.children.push(t);}}
test('SP and bond gain numbers use healing font size and camera scaling',()=>{
 let zoom=115;
 const f=Object.create(FxSystem.prototype);
 Object.assign(f,{P:{BitmapText:Text,Container},labels:[],pops:[],ctx:{cam:()=>({project:()=>({x:0,y:0,s:zoom})}),screenSize:()=>({width:100,height:100}),layers:{text:{addChild(){}},screen:{addChild(){}}}},_proj:()=>({x:0,y:0,s:zoom}),_groundZ:()=>0,_viewOf:()=>null});
 f.numberAt(0,0,'+2',0xffffff,.8,{x:0,y:0,z:0},true);
 f.pop(null,'+2',0xffffff,0,[0,0],null,true);
 assert.equal(f.labels[0].t.options.fontSize,24);
 assert.equal(f.pops[0].labelText.options.fontSize,24);
 f._updateLabels(.2);f._updatePops(.2);
 assert.ok(Math.abs(f.labels[0].t.scale.x-.9)<1e-9);
 assert.ok(Math.abs(f.pops[0].labelText.scale.x*f.pops[0].c.scale.x-.9)<1e-9);
 zoom=57.5;f._updateLabels(.01);f._updatePops(.01);
 assert.ok(Math.abs(f.labels[0].t.scale.x-.45)<1e-9);
 assert.ok(Math.abs(f.pops[0].labelText.scale.x*f.pops[0].c.scale.x-.45)<1e-9);
});

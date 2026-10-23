import test from 'node:test';import assert from 'node:assert/strict';import {FxSystem} from '../../public/js/render/fx.js';import {presetCamera} from '../../public/js/render/projection.js';
test('BLOCK, SP and ordinary combat notices share healing text size and camera scaling',()=>{
 class Text{constructor(text,options){this.text=text;this.options=options;this.anchor={set(){}};this.position={set(){}};this.scale={set:v=>this.sc=v};}destroy(){}}
 const fx=Object.create(FxSystem.prototype),cam=presetCamera('normal',{width:1280,height:720});Object.assign(fx,{P:{BitmapText:Text},labels:[],ctx:{cam:()=>cam,layers:{text:{addChild(){}}}}});
 for(const size of [720,400]){cam.height=size;const at={x:5,y:10,z:0},p=cam.project(5,10,0);fx.labels=[];for(const [text,heal]of [['BLOCK',false],['+5',true],['!',false]])fx.numberAt(p.x,p.y,text,0xffffff,.8,at,heal);fx._updateLabels(.1);assert.ok(fx.labels.every(l=>l.t.options.fontSize===24));assert.ok(fx.labels.every(l=>l.t.sc===fx.labels[0].t.sc));}
});

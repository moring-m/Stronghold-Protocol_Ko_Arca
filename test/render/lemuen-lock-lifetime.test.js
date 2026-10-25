import {test} from 'node:test';import assert from 'node:assert/strict';
import {SkillFx} from '../../public/js/render/vfx/skillfx.js';
import {FX_BINDINGS} from '../../public/js/render/vfx/skills.js';
function fixture(){
 const fx=Object.create(SkillFx.prototype),handles=[];
 fx.locks=[];fx.units=new Map();fx._on=u=>!!u.active;
 fx.w={ofx:{time:0},playOn(key,at,opts){const h={alive:true,key,at,opts,stop(){this.alive=false;}};handles.push(h);return h;}};
 const owner={id:1,v:{alive:true},active:true};fx.units.set(1,owner);return{fx,owner,handles};
}
test('Lemuen crosshairs stay through the shell flight, including a target that dies before impact',()=>{
 assert.equal(FX_BINDINGS.skchr_lemuen_3.lock.hold,'lock');
 const {fx,owner,handles}=fixture(),target={x:4,y:3,alive:true};
 fx._lockOn(owner,['crosshair'],{},target,4,3);target.x=5;fx._syncLocks(1);assert.equal(fx.locks[0].x,5);assert.equal(handles[0].alive,true);
 fx._lockShell('bombardShell',5,3,{id:1});target.alive=false;owner.active=false;fx.w.ofx.time=2;fx._syncLocks(2);
 assert.equal(handles[0].alive,true);assert.equal(fx.locks[0].x,5);
 fx._lockShell('bombard',5,3,{id:1});assert.equal(handles[0].alive,false);assert.equal(fx.locks.length,0);
});
test('crosshair bookkeeping is bounded and stale/no-shooter locks stop',()=>{
 const {fx,owner,handles}=fixture();
 for(let i=0;i<50;i++)fx._lockOn(owner,['crosshair'],{},null,i,3);
 assert.equal(fx.locks.length,48);assert.equal(handles[0].alive,false);
 owner.v.alive=false;owner.active=false;fx._syncLocks(1);assert.equal(fx.locks.length,0);assert.ok(handles.every(h=>!h.alive));
});

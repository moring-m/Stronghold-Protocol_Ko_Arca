import{test}from'node:test';import assert from'node:assert/strict';
import{makotoSimpleFx,makotoOfficialFx}from'../../public/js/render/makotoFx.js';
import{MAKOTO_RANGE}from'../../shared/makoto.js';
function fixture(){const calls=[],units=new Map([[1,{id:1,x:5,y:10,z:.465,info:{charId:'char_4217_makoto'}}],[2,{id:2,x:7,y:10,z:0}],[3,{id:3,x:4,y:11,z:0}]]);return{calls,units,fx:{_viewOf:id=>units.get(id),_groundZ:()=>0,_ts:()=>2,ctx:{cam:()=>({project:(x,y,z)=>({x:x*60,y:y*60-z*30,s:60})})},_anchored:(x,y,z,fn)=>fn(),ring:(...a)=>calls.push(['ring',...a]),burst:(...a)=>calls.push(['burst',...a]),particle:(...a)=>calls.push(['particle',...a]),heal:(...a)=>calls.push(['heal',...a]),tileFlash:(...a)=>calls.push(['tiles',...a])}};}
test('persona and damage effects differ and execute lands on its target, including platform height',()=>{
 const{fx,calls}=fixture();makotoSimpleFx(fx,'makotoPersonaReady',5,10,{id:1});assert.ok(Math.abs(calls[0][3]-.48)<1e-9);
 calls.length=0;makotoSimpleFx(fx,'makotoExecute',5,10,{id:1,target:2});assert.deepEqual(calls[0].slice(1,3),[7,10]);assert.equal(calls.filter(c=>c[0]==='particle').length,2);
 const color=calls[0][6];calls.length=0;makotoSimpleFx(fx,'makotoArtsHit',5,10,{id:1,target:2});assert.notEqual(calls[0][6],color);
});
test('heals use actual targets and all-out areas use every member position, not just caster',()=>{
 const{fx,calls,units}=fixture();makotoSimpleFx(fx,'makotoHeal',5,10,{id:1,targets:[3]});assert.deepEqual(calls.find(c=>c[0]==='ring').slice(1,3),[units.get(3).x,units.get(3).y]);assert.ok(!calls.some(c=>c[0]==='heal'));
 calls.length=0;makotoSimpleFx(fx,'makotoAllOut',5,10,{id:1,members:[1,3]});const tiles=calls.filter(c=>c[0]==='tiles');assert.equal(tiles.length,2);assert.deepEqual(tiles[1][1],MAKOTO_RANGE.map(([r,c])=>[11+r,4+c]));assert.equal(tiles[0][1].length,13);
});
test('official dispatch never consumes simplified events or claims missing prefabs; unrelated events untouched',()=>{
 const owner={info:{charId:'char_4217_makoto'}},w={ofx:{active:false},view:()=>({}),playOn:()=>{throw Error('official spawn in simple mode');}};
 for(const k of ['makotoHeal','makotoExecute','makotoAllOut','makotoAllOutStart','makotoPersonaReady','makotoPhysicalHit'])assert.equal(makotoOfficialFx(w,owner,k,0,0,{targets:[2],target:2,members:[1]}),false);
 w.ofx.active=true;w.playOn=()=>null;assert.equal(makotoOfficialFx(w,owner,'makotoExecute',0,0,{target:2}),false);
 w.playOn=()=>({});assert.equal(makotoOfficialFx(w,owner,'makotoExecute',0,0,{target:2}),true);
 assert.equal(makotoOfficialFx(w,{info:{charId:'other'}},'makotoExecute'),null);
 const{fx}=fixture();assert.equal(makotoSimpleFx(fx,'unrelated',0,0,{}),false);
});

import{test}from'node:test';import assert from'node:assert/strict';
import{SpineActor}from'../../public/js/render/spine.js';import{UnitView}from'../../public/js/render/units.js';import{FxWiring}from'../../public/js/render/vfx/wiring.js';import{TalentFx}from'../../public/js/render/vfx/talentfx.js';import{UF}from'../../shared/constants.js';
class Skin{constructor(name){this.name=name;this.parts=[];}addSkin(s){this.parts.push(s.name);}}
function actor(){const base=new Skin('default');let active,applications=0;const a={spine:{skeleton:{data:{defaultSkin:base,skins:[base]},setSkin(s){active=s;},setSlotsToSetupPose(){}},state:{apply(){applications++;}}}};return{a,base,active:()=>active,applications:()=>applications};}
test('default-only bodies remain visible and immediately support a state skin added at runtime',()=>{
 const{a,base,active,applications}=actor(),set=states=>SpineActor.prototype.setVisualStates.call(a,states);
 for(let i=0;i<100;i++){assert.equal(set(['freeze','skill1','unknown']),false);assert.equal(a.authoredVisualStates.size,0);}
 assert.deepEqual(active().parts,['default']);assert.equal(applications(),1);
 const frozen=new Skin('frozen');a.spine.skeleton.data.skins.push(frozen);assert.equal(set(['freeze']),true);assert.deepEqual(active().parts,['default','frozen']);assert.equal(a.authoredVisualStates.has('freeze'),true);
 assert.equal(set([]),false);assert.deepEqual(active().parts,['default']);
 a.spine.skeleton.data.skins=[base,new Skin('skill_1'),new Skin('stunned')];assert.equal(set(['skill1','stun']),true);assert.deepEqual(active().parts,['default','skill_1','stunned']);
});
test('state attachment changes invalidate live bounds even when the animation is frozen',()=>{
 const{a}=actor();let bounds={x:-4,y:-8,width:8,height:9},calls=0;a.spine.state.tracks=[];a.spine.getLocalBounds=()=>{calls++;return bounds;};
 const set=states=>SpineActor.prototype.setVisualStates.call(a,states);set([]);
 const v={actor:a,_box:{x0:-5,y0:-10,w:10,h:12,over:new Set()}},check=()=>UnitView.prototype._impOver.call(v);
 assert.equal(check(),false);assert.equal(check(),false);assert.equal(calls,1);
 a.spine.skeleton.data.skins.push(new Skin('frozen'));bounds={x:-20,y:-8,width:30,height:9};set(['freeze']);assert.equal(check(),true);assert.equal(calls,2);
});
test('official status loops recover after expiry and stop for death, downed state or hidden preparation',()=>{
 const log=[],w={idx:{generic:{status:{freeze:'ice',shield:'shield',invulnerable:'inv'}}},ofx:{lib:{has:()=>true}},statusSeen:new Map(),loops:new Map(),statusKey:FxWiring.prototype.statusKey,status(v,name,on){log.push([name,on]);if(on)this.loops.set(`${v.id}|${name}`,{alive:true});else this.loops.delete(`${v.id}|${name}`);}};
 const v={id:1,flags:UF.FROZEN,statuses:new Set()};const sync=()=>FxWiring.prototype.syncStatuses.call(w,v);
 sync();assert.deepEqual(log,[['freeze',true]]);sync();assert.equal(log.length,1);
 w.loops.get('1|freeze').alive=false;sync();assert.deepEqual(log.at(-1),['freeze',true]);
 for(const key of ['down','prep']){v[key]=true;sync();assert.equal(w.loops.size,0);v[key]=false;sync();assert.equal(w.loops.size,1);}
 v.alive=false;sync();assert.equal(w.loops.size,0);v.alive=true;v.flags=0;sync();assert.equal(w.statusSeen.size,0);
 v.flags=UF.INVULN;v.isToken=true;sync();assert.equal(w.loops.size,0);v.isToken=false;sync();assert.equal(w.loops.size,1);
 v.flags=0;sync();assert.equal(w.loops.size,0);
});
test('talent loop rows preserve order, duplicate entries, post-effect exclusions and later plan changes',()=>{
 const a={key:'a',hold:'skill'},b={key:'b',hold:'cast'},post={key:'p',hold:'skill',from:'RebornTalent._buffs'};
 const bind={plan:{loop:[a,post],start:[b,a],range:[]}},read=()=>TalentFx.prototype._loopsOf.call({},bind);
 assert.deepEqual(read(),[a,a]);bind.plan.range.push({key:'c',hold:'skill'});assert.deepEqual(read().map(e=>e.key),['a','a','c']);bind.plan.start=[];a.hold='cast';assert.deepEqual(read().map(e=>e.key),['c']);
});

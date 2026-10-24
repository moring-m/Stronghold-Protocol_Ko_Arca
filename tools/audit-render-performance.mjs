// Deterministic output signatures for comparing a reference renderer with performance changes.
import{createHash}from'node:crypto';import{SpineActor}from'../public/js/render/spine.js';import{FxWiring}from'../public/js/render/vfx/wiring.js';import{TalentFx}from'../public/js/render/vfx/talentfx.js';import{OfficialFx}from'../public/js/render/vfx/system.js';import{presetCamera}from'../public/js/render/projection.js';import{UF}from'../shared/constants.js';
let seed=42;const rnd=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};const output={},hash=createHash('sha256');let checks=0;
const save=v=>{hash.update(JSON.stringify(v));checks++;};
class Skin{constructor(name){this.name=name;this.parts=[];}addSkin(s){this.parts.push(s.name);}}
const states=['stun','sleep','invuln','freeze','cold','burn','poison','rage','shield','refraction','stealth','skill1','skill2','skill3','unknown'];
for(let model=0;model<20;model++){
 const base=new Skin('default'),skins=[base,...states.filter(()=>rnd(2)).map(s=>new Skin(s==='freeze'?'frozen':s))];if(model===0)skins.length=0;if(model===1)skins.length=1;
 let active=[],applied=0;const a={spine:{skeleton:{data:{defaultSkin:base,skins},setSkin(s){active=s.parts.slice();},setSlotsToSetupPose(){}},state:{apply(){applied++;}}}};
 for(let frame=0;frame<500;frame++){
  if(frame===250)a.spine.skeleton.data.skins=[base,new Skin('freeze'),new Skin('skill_1')];
  const input=Array.from({length:rnd(8)},()=>states[rnd(states.length)]),on=SpineActor.prototype.setVisualStates.call(a,input);save([model,frame,on,active,[...a.authoredVisualStates],applied]);
 }
}
output.skins={checks,sha256:hash.digest('hex')};
const sh=createHash('sha256');checks=0;let log=[];const flags=[UF.SHIELD,UF.INVULN,UF.STEALTH,UF.FROZEN,UF.STUNNED,UF.SLEEP,UF.COLD];
const w={idx:{generic:{status:Object.fromEntries(['shield','invulnerable','stealth','freeze','stun','sleep','cold','burn'].map(k=>[k,k]))}},ofx:{lib:{has:()=>true}},statusSeen:new Map(),loops:new Map(),statusKey:FxWiring.prototype.statusKey,status(v,name,on){log.push([name,on]);const key=`${v.id}|${name}`;if(on)this.loops.set(key,{alive:true});else this.loops.delete(key);}};
const v={id:1};for(let frame=0;frame<10000;frame++){
 Object.assign(v,{flags:flags.reduce((f,b)=>f|(rnd(2)?b:0),0),statuses:new Set(Array.from({length:rnd(5)},()=>states[rnd(states.length)])),isToken:!!rnd(2),prep:!rnd(11),alive:!!rnd(9),down:!rnd(13)});
 if(rnd(2))v._iconKeys=()=>v.statuses;else delete v._iconKeys;
 if(!rnd(4))for(const h of w.loops.values())h.alive=false;
 log=[];FxWiring.prototype.syncStatuses.call(w,v);sh.update(JSON.stringify([frame,log,[...(w.statusSeen.get(1)||[])],[...w.loops].map(([k,h])=>[k,h.alive])]));checks++;
}output.statuses={checks,sha256:sh.digest('hex')};
const lh=createHash('sha256'),b={plan:{loop:[],start:[],range:[]}};for(let i=0;i<5000;i++){
 const list=['loop','start','range'][rnd(3)];if(rnd(2))b.plan[list]=[];else b.plan[list].push({key:'k'+rnd(8),hold:rnd(2)?'skill':'cast',from:rnd(3)?'PassiveBuffAbility._buffs':'RebornTalent._buffs'});
 lh.update(JSON.stringify(TalentFx.prototype._loopsOf.call({},b)));
}output.loops={checks:5000,sha256:lh.digest('hex')};
class Container{constructor(){this.children=[];}addChild(c){c.parent?.removeChild(c);this.children.push(c);c.parent=this;}removeChild(c){this.children=this.children.filter(x=>x!==c);c.parent=null;}destroy(){this.parent?.removeChild(this);this.destroyed=true;}}
const renderer={screen:{width:1280,height:720}},cam=presetCamera('normal',renderer.screen),fx=new OfficialFx({P:{Container},renderer,cam:()=>cam,lib:{}}),owners=Array.from({length:6},(_,i)=>{const root=new Container();root.addChild({id:'model'+i});return{root};});fx.glr={upload(){}};
const dh=createHash('sha256');for(let frame=0;frame<500;frame++){
 if(frame%17===0)owners[rnd(6)].root.addChild({id:'hud'+frame});
 let entries=[];for(let i=0;i<40;i++){const owner=owners[rnd(6)],effect={depthOwner:owner,build:()=>({kind:'ps',first:i*6,count:6})};entries.push({id:i,effect,ground:!rnd(7),queue:rnd(7)?3000:4000,order:rnd(5),layer:0,dist:0,mat:{state:{}},meshKey:null});}
 fx.effects=[{gather(_cam,sink){entries.forEach(sink);}}];fx.frameNo++;fx._prepare(renderer);
 dh.update(JSON.stringify({groups:[...fx.unitItems].map(([o,x])=>[owners.indexOf(o),x.map(e=>[e.id,e.first,e.count])]),ground:fx.items.ground.map(e=>e.id),over:fx.items.over.map(e=>e.id),children:owners.map(o=>o.root.children.map(x=>x.id||'effect'))}));
}output.drawOrder={checks:500,sha256:dh.digest('hex')};console.log(JSON.stringify(output,null,2));

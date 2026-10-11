// One battle queue; equal-frame applications are coalesced by caster/target.
// No per-stack timers, buffs, hooks or render objects. Attribution stays with the caster.
import * as S from './support/index.js';
import {metaBonds} from './support/meta.js';
const BOND='leithanienShip',TAG='leithanien:note';
const field=u=>u?.alive&&u.deployed&&!u.hidden;
const has=(u,key)=>u?.items?.some(id=>id.startsWith(`chess_item_custom_leithanien_${key}_`));
const trait=u=>u?.def?.raw?.customTrait||S.gameData().garrisons?.[u?.def?.raw?.garrisonIds?.[0]];
function push(h,x){let i=h.length;h.push(x);while(i){let p=(i-1)>>1;if(h[p].next<=x.next)break;h[i]=h[p];i=p;}h[i]=x;}
function pop(h){const x=h[0],last=h.pop();if(h.length){let i=0;while(i*2+1<h.length){let c=i*2+1;if(c+1<h.length&&h[c+1].next<h[c].next)c++;if(h[c].next>=last.next)break;h[i]=h[c];i=c;}h[i]=last;}return x;}
const six=(b,u)=>S.bondActive(b,u.ownerId,BOND)&&S.bondState(b,u.ownerId,BOND).count>=6;
export function install(b){
 if(!b.players.some(p=>p.bonds?.[BOND])&&!b.allyUnits.some(u=>u.def?.bonds?.includes(BOND)))return;
 const heap=[],cohorts=new Map(),counts=new Map();
 const state={heap,cohorts,applications:0,damageBatches:0,liveStacks:0};
 b.leithanien=state;
 const members=()=>b.allyUnits.filter(u=>u.kind==='op'&&S.isMember(b,u,BOND));
 const add=(u,bonds,n,limit,key)=>{const k=`${u.id}:${key}`,used=counts.get(k)||0;if(used>=limit)return;const gained=S.gainLayers(b,{playerId:u.ownerId,bonds,n,source:u,reason:'leithanien:trait'});if(gained>0)counts.set(k,used+1);};
 const refresh=u=>{
  if(u.kind!=='op')return;
  const g=trait(u),layers=S.bondLayers(b,u.ownerId,BOND);
  if(g?.effectKey==='custom_leithanien_hp'||g?.effectKey==='custom_leithanien_atk')S.passiveBuff(b,u,'leithanien:trait:stats',S.directMods({[g.effectKey.endsWith('_hp')?'hp':'atk']:Math.floor(layers/3)*g.bb.count}));
  const score=u.items?.find(id=>id.startsWith('chess_item_custom_leithanien_score_'));
  if(score)S.passiveBuff(b,u,'leithanien:score:arts',{artsDealtMul:score.endsWith('_b')?1.6:1.4});
 };
 const apply=(u,t)=>{
  if(!field(t)||t.side!=='enemy')return;
  const L=S.bondLayers(b,u.ownerId,BOND),duration=six(b,u)?10+Math.floor(L/30):5;
  const now=b.time,end=now+duration,key=`${u.id}:${t.id}:${now}:${duration}`;
  let c=cohorts.get(key);
  if(c){c.amount+=u.s.atk*.1;c.stacks++;}else{c={key,u,t,next:now+1,end,amount:u.s.atk*.1,stacks:1};cohorts.set(key,c);push(heap,c);}
  state.applications++;state.liveStacks++;t.mem.leithanienStacks=(t.mem.leithanienStacks||0)+1;
  // A single target marker, refreshed only when its expiry extends.
  const old=t.findBuff('leithanien:note');
  if(!old||old.timeLeft<duration)b.addBuff(t,{key:'leithanien:note',duration,refresh:'replace',source:u});
  if(six(b,u)){t.mem.leithanienWeakenUntil=Math.max(t.mem.leithanienWeakenUntil||0,end);
   const slow=t.findBuff('leithanien:slow');if(!slow||slow.timeLeft<duration)b.addBuff(t,{key:'leithanien:slow',duration,refresh:'replace',mods:{moveMul:.75},source:u});
  }
  if(trait(u)?.effectKey==='custom_leithanien_notes'){
   const k=u.id+':notes',n=(counts.get(k)||0)+1;counts.set(k,n);
   if(n%5===0)add(u,S.unitBonds(u),trait(u).bb.count,10,'notesGain');
  }
 };
 b.on('damaged',c=>{if(c.amount>0&&c.source?.kind==='op'&&c.source.side==='ally'&&c.target?.side==='enemy'&&!c.dmg?.tags?.includes(TAG)&&S.isMember(b,c.source,BOND)&&S.bondActive(b,c.source.ownerId,BOND))apply(c.source,c.target);});
 b.on('hit',c=>{const source=c.source||c.credit;if(source?.side==='enemy'&&(source.mem.leithanienWeakenUntil||0)>b.time)c.dmg.mul*=.75;});
 b.on('tick',()=>{
  const sums=new Map();
  while(heap.length&&heap[0].next<=b.time+1e-8){
   const c=pop(heap);
   if(!field(c.t)){cohorts.delete(c.key);state.liveStacks-=c.stacks;c.t.mem.leithanienStacks=Math.max(0,(c.t.mem.leithanienStacks||0)-c.stacks);continue;}
   const k=c.u.id+':'+c.t.id;let sum=sums.get(k);if(!sum){sum={u:c.u,t:c.t,amount:0};sums.set(k,sum);}sum.amount+=c.amount;
   c.next+=1;
   if(c.next<=c.end+1e-8)push(heap,c);else{cohorts.delete(c.key);state.liveStacks-=c.stacks;c.t.mem.leithanienStacks=Math.max(0,(c.t.mem.leithanienStacks||0)-c.stacks);}
  }
  for(const c of sums.values()){
   const bonus=S.bondActive(b,c.u.ownerId,BOND)?.2+.0025*S.bondLayers(b,c.u.ownerId,BOND):0;
   b.dealDamage(c.u,c.t,{amount:c.amount*(1+bonus),type:'arts',canDodge:false,silent:true,tags:[TAG,'dot']});state.damageBatches++;
  }
 });
 b.on('skillStart',({unit:u})=>{
  if(!field(u)||u.kind!=='op'||!S.isMember(b,u,BOND))return;
  const shared=members().some(a=>a.ownerId===u.ownerId&&field(a)&&has(a,'score')&&has(a,'bell'));
  if(has(u,'score')||shared)for(const e of b.enemies)apply(u,e);
 });
 b.on('deploy',({unit:u,move})=>{refresh(u);if(!move&&trait(u)?.effectKey==='custom_leithanien_deploy')add(u,[BOND],trait(u).bb.count,8,'deploy');});
 b.on('layerGain',({playerId,bondId})=>{if(bondId===BOND)b.after(0,()=>{for(const u of b.allyUnits)if(u.ownerId===playerId)refresh(u);});});
 b.on('damaged',({target,type,dmg,amount})=>{if(type!=='element'||dmg?.element!=='necrosis'||!(amount>0))return;for(const u of members())if(field(u)&&trait(u)?.effectKey==='custom_leithanien_burst'&&S.inRange(u,target))add(u,[BOND,'arcaneShip'],trait(u).bb.count,7,'burst');});
 b.on('kill',({killer:u,victim})=>{if(victim?.side==='enemy'&&trait(u)?.effectKey==='custom_leithanien_kill'){const k=u.id+':kill',used=counts.get(k)||0;if(used>=5)return;let gained=S.gainLayers(b,{playerId:u.ownerId,bonds:[BOND],n:trait(u).bb.count,source:u});gained+=S.gainLayers(b,{playerId:u.ownerId,bonds:['swiftShip'],n:trait(u).bb.swiftCount??trait(u).bb.count,source:u});if(gained>0)counts.set(k,used+1);}});
 for(const u of b.allyUnits)refresh(u);
}
export function registerMeta(registry){
 registry.garrison('custom_leithanien_gain',{onGain(ctx){ctx.addLayers(BOND,ctx.source.bb.count);}});
 registry.garrison('custom_leithanien_prep',{onPrepEnd(ctx){for(const p of ctx.board())if(metaBonds(ctx,p).includes(BOND))for(const id of metaBonds(ctx,p))ctx.addLayers(id,ctx.source.bb.count,{requireActive:true});}});
 registry.band('band_custom_leithanien_witchking',{
  onLayers(ctx,ev){if(ev.bondId!==BOND)return;const owed=Math.floor(ctx.layers(BOND)/40),key='leithanien:witchking:paid';let paid=ctx.counter(key);while(paid<owed){if(ctx.shopLevel()<=1)break;const id=ctx.rollChess({bond:BOND,maxTier:ctx.shopLevel()-1,ignoreCounts:true});if(!id||!ctx.grantChess(id,{requirePool:false}))break;ctx.setCounter(key,++paid);}},
  onPrepStart(ctx){this.onLayers(ctx,{bondId:BOND});},
 });
}

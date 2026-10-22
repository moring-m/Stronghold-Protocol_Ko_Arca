import {augmentBossHpMultiplier,augmentEnemyHpMultiplier} from '../../shared/gameplayModes.js';
import { makeCtx } from './effectsMeta.js';
import { triggerGainEffects } from '../sim/content/garrisons/meta.js';
import { createRng, deriveSeed } from '../sim/rng.js';
import { normalizeRuleValues } from '../../shared/customExtensions.js';
import { PHASE, ERR } from '../../shared/constants.js';
import { AUGMENT_ROUNDS, createAugmentCatalog, rollAugmentGrade, drawAugmentCard, augmentView } from '../../shared/augments.js';
const ok={ok:true},fail=(error,detail)=>detail?({error,detail}):({error});
export class AugmentMode {
 constructor(match){this.m=match;this.settings=normalizeRuleValues(match.customExtensions.ruleValues);this.enabled=match.customExtensions.rules?.includes('augments')===true;this.rng=createRng(deriveSeed(match.seed,'augments'));this.history=[];this.completed=new Set();this.seen=new Map();this.enemySeen=new Set();this.allies=new Map();this.enemies=[];this.roundLog=[];this.current=null;this.pending=new Map();this.delivering=false;}
 voting(){return this.current?.side==='enemy'&&this.settings.augmentEnemyVote>0;}
 voters(){return this.m.alivePlayers().filter(p=>!p.left);}
 operatorAvailable(id,ps){return !!this.m.gd.chess(id)&&!this.m.bannedChess.includes(this.m.gd.baseIdOf(id))&&(!ps||ps.canRecruit(id));}
 chessCandidates(effect,ps){return (effect.candidates||Object.keys(this.m.data.chess)).filter(id=>{const c=this.m.data.chess[id];return c&&!c.isGolden&&!c.isHidden&&!c.isDiy&&!c.optionalRecruit&&c.visible!==false&&c.tier===effect.tier&&this.operatorAvailable(id,ps);});}
 starterFamilies(effect,ps){
  return effect.families.map(f=>({bondId:f.bondId,tiers:f.tiers.map(ids=>ids.filter(id=>this.operatorAvailable(id,ps)))})).filter(f=>this.m.bondLive(f.bondId)&&f.tiers.every(ids=>ids.length));
 }
 host(){const m=this.m,id=m.opts.getHostId?.()||m.opts.hostId;const chosen=m.players.get(id);return chosen&&!chosen.left?id:m.order.find(p=>!p.isBot&&!p.left)?.playerId||m.alivePlayers()[0]?.playerId||null;}
 catalog(side,ps){return createAugmentCatalog(this.m.data,this.m.round).filter(a=>a.side===side&&a.grade===this.current.grade&&!(a.effect.kind==='freeUpgrade'&&ps?.shop.level>=this.m.gd.maxShopLevel)&&!(a.effect.kind==='harmony'&&this.m.gd.config.customRules?.defaultHarmony)&&(a.effect.kind!=='starterPack'||this.starterFamilies(a.effect,ps).length>0)&&!(side==='enemy'?this.enemies:this.allies.get(ps?.playerId)||[]).some(chosen=>chosen.id===a.id||(['extraAttack','spCost','trueDamage'].includes(a.effect.kind)&&chosen.effect.kind===a.effect.kind))&&(!a.bondId||this.m.bondLive(a.bondId))&&(a.effect.kind!=='elemental'||this.m.factions.some(f=>/element|ele|元素|원소/i.test(f)))&&(a.effect.kind!=='chess'||this.chessCandidates(a.effect,ps).length>0));}
 makeSlots(side,ps){const seen=side==='enemy'?this.enemySeen:this.seen.get(ps.playerId)||new Set();if(ps)this.seen.set(ps.playerId,seen);const candidates=this.catalog(side,ps),cards=[];for(let i=0;i<3;i++)cards.push(drawAugmentCard(candidates,seen,cards,this.rng));return {cards,rerolls:Array(3).fill(side==='ally'?this.settings.augmentAllyRerolls:this.settings.augmentEnemyRerolls),picked:cards.some(Boolean)?null:-1};}
 enter(){const m=this.m;if(!this.enabled||!AUGMENT_ROUNDS.includes(m.round)||this.completed.has(m.round)||m.round>=m.gd.bossRound)return false;const grade=rollAugmentGrade(this.rng,this.history,{silver:this.settings.augmentSilver,gold:this.settings.augmentGold,prism:this.settings.augmentPrism});this.history.push(grade);this.completed.add(m.round);this.current={id:`augment-${m.round}`,round:m.round,grade,side:'ally',settling:false,slots:new Map(),boss:null};m.phase=PHASE.SP_DRAFT;m.sp=null;for(const p of m.alivePlayers())this.current.slots.set(p.playerId,this.makeSlots('ally',p));m.setDeadline(m.soloUntimed?0:120,()=>this.timeout());this.notify();for(const p of m.alivePlayers())if(p.botControlled)m.later(m.scaled(400),()=>{if(this.current?.side==='ally')this.choose(p,0);});if(this.ready())this.settle();return true;}
 notify(){for(const ps of this.m.spectators.values())this.m.sendTo(ps.playerId,this.spectatorView(ps));this.m.markPublic();for(const p of this.m.order)this.m.markPrivate(p);}
 timeout(){const s=this.current;if(!s||s.settling)return;if(s.side==='ally'){for(const p of this.m.alivePlayers())if(s.slots.get(p.playerId)?.picked==null)this.choose(p,Math.floor(this.rng()*3));}else if(this.voting()){if(this.settings.augmentEnemyVote===1)for(const p of this.voters())if(!s.votes.has(p.playerId))s.votes.set(p.playerId,Math.floor(this.rng()*3));this.settle();}else{const p=this.m.players.get(this.host());if(p)this.choose(p,Math.floor(this.rng()*3));else this.settle();}}
 ready(){const s=this.current;return s&&(this.voting()?this.voters().every(p=>s.votes.has(p.playerId)):s.side==='ally'&&this.m.alivePlayers().every(p=>s.slots.get(p.playerId)?.picked!=null));}
 settle(){const s=this.current;if(!s||s.settling)return;s.settling=true;if(this.voting())this.resolveVote({defer:true});this.m.setDeadline(3,()=>{if(this.current!==s)return;if(s.side==='ally'){for(const [id,slot] of s.slots){const ps=this.m.players.get(id),card=slot.cards[slot.picked];if(ps&&card)this.applyChoice(ps,card);}this.enterEnemy();}else{if(this.voting()&&this.resolveVote())return;const card=s.boss.cards[s.boss.picked],ps=this.m.players.get(this.host());if(card&&ps)this.applyChoice(ps,card);this.current=null;this.notify();this.m.afterRoundStart();}});this.notify();}
 enterEnemy(){const s=this.current;if(!s)return;s.side='enemy';s.settling=false;s.boss=this.makeSlots('enemy');s.votes=new Map();s.rerollsLeft=this.settings.augmentEnemyRerolls;if(s.boss.picked===-1){this.settle();return;}this.m.setDeadline(this.m.soloUntimed?0:120,()=>this.timeout());this.notify();if(this.voting()){this.scheduleBots();return;}const host=this.m.players.get(this.host());if(host?.botControlled)this.m.later(this.m.scaled(400),()=>{if(this.current===s&&s.side==='enemy')this.choose(host,0);});}
 select(ps,msg,reroll=false){const s=this.current;if(!s||this.m.phase!==PHASE.SP_DRAFT||s.settling||msg.eventId!==s.id||msg.side!==s.side)return fail(ERR.WRONG_PHASE);if(s.side==='ally'&&!ps.alive)return fail(ERR.ELIMINATED);if(this.voting())return this.vote(ps,msg,reroll);if(s.side==='enemy'&&ps.playerId!==this.host())return fail(ERR.NOT_HOST);const slots=s.side==='ally'?s.slots.get(ps.playerId):s.boss;if(!slots||slots.picked!=null)return fail(ERR.ALREADY);const idx=msg.idx;if(!Number.isInteger(idx)||idx<0||idx>2||slots.cards[idx]?.id!==msg.cardId)return fail(ERR.BAD_TARGET);if(reroll){if(slots.rerolls[idx]<=0)return fail(ERR.BAD_TARGET,'리롤 횟수를 모두 사용했습니다.');const candidates=this.catalog(s.side,s.side==='ally'?ps:null),seen=s.side==='ally'?this.seen.get(ps.playerId):this.enemySeen;const card=drawAugmentCard(candidates,seen,slots.cards,this.rng);if(!card)return fail(ERR.BAD_TARGET,'다른 증강이 없습니다.');slots.cards[idx]=card;slots.rerolls[idx]--;this.notify();return ok;}this.choose(ps,idx);return ok;}
 choose(ps,idx){const s=this.current;if(!s||s.settling)return;if(this.voting())return this.vote(ps,{idx,cardId:s.boss.cards[idx]?.id});const slots=s.side==='ally'?s.slots.get(ps.playerId):s.boss;if(!slots||slots.picked!=null)return;let card=slots.cards[idx];if(!card){idx=slots.cards.findIndex(Boolean);card=slots.cards[idx];}if(!card){slots.picked=-1;if(s.side==='enemy'||this.ready())this.settle();return;}slots.picked=idx;
  this.notify();if(s.side==='enemy'||this.ready())this.settle();
 }
 applyChoice(ps,card){const s=this.current;this.roundLog.push({round:s.round,grade:s.grade,side:s.side,playerId:s.side==='ally'?ps.playerId:this.host(),augment:augmentView(card)});if(s.side==='ally'){const chosen=this.allies.get(ps.playerId)||[];chosen.push(card);this.allies.set(ps.playerId,chosen);this.grant(ps,card);}else this.enemies.push(card);}
 scheduleBots(){const s=this.current;for(const p of this.voters())if(p.botControlled)this.m.later(this.m.scaled(400),()=>{if(this.current===s&&!s.settling)this.vote(p,{idx:Math.floor(this.rng()*3),cardId:s.boss.cards[0]?.id});});}
 vote(ps,msg,reroll=false){const s=this.current,idx=msg.idx;if(!ps.alive||ps.left)return fail(ERR.ELIMINATED);if(reroll)return fail(ERR.BAD_TARGET);if(s.votes.has(ps.playerId))return fail(ERR.ALREADY);if(!Number.isInteger(idx)||idx<0||idx>3)return fail(ERR.BAD_TARGET);if(idx===3){if(msg.cardId!=='augment-reroll'||s.rerollsLeft<=0)return fail(ERR.BAD_TARGET);}else if(!s.boss.cards[idx]||(!ps.botControlled&&s.boss.cards[idx].id!==msg.cardId))return fail(ERR.BAD_TARGET);s.votes.set(ps.playerId,idx);this.shortenVoteDeadline();this.notify();if(this.ready())this.settle();return ok;}
 shortenVoteDeadline(){
  const s=this.current;if(!this.voting()||this.settings.augmentEnemyVote!==1||s.settling)return;
  const counts=[0,0,0,0],voters=this.voters();for(const p of voters){const idx=s.votes.get(p.playerId);if(Number.isInteger(idx))counts[idx]++;}
  if(Math.max(...counts)>voters.length/2&&this.m.deadline-this.m.sched.now()>this.m.scaled(10000))this.m.setDeadline(10,()=>this.timeout());
 }
 resolveVote({defer=false}={}){const s=this.current;if(!s.boss.cards.some(Boolean)){s.boss.picked=-1;return false;}const counts=[0,0,0,0];for(const p of this.voters()){const idx=s.votes.get(p.playerId);if(Number.isInteger(idx)&&idx>=0&&idx<4)counts[idx]++;}const max=Math.max(...counts),tied=counts.map((n,i)=>n===max?i:-1).filter(i=>i>=0&&(i<3?!!s.boss.cards[i]:s.rerollsLeft>0));let chosen=s.voteResultIdx;if(!Number.isInteger(chosen)){if(this.settings.augmentEnemyVote===2){const eligible=counts.map((n,i)=>(i<3?s.boss.cards[i]:s.rerollsLeft>0)?n:0),total=eligible.reduce((a,b)=>a+b,0);let roll=this.rng()*total;chosen=eligible.findIndex(n=>{roll-=n;return roll<0;});if(chosen<0){const available=s.boss.cards.map((c,i)=>c?i:-1).filter(i=>i>=0);chosen=available[Math.floor(this.rng()*available.length)];}}else chosen=tied.length?tied[Math.floor(this.rng()*tied.length)]:s.boss.cards.findIndex(Boolean);}const idx=chosen;s.voteResultIdx=idx;if(defer){if(idx<3)s.boss.picked=idx;return false;}if(idx===3){s.rerollsLeft--;s.boss=this.makeSlots('enemy');s.votes.clear();delete s.voteResultIdx;s.settling=false;this.m.setDeadline(this.m.soloUntimed?0:120,()=>this.timeout());this.notify();this.scheduleBots();return true;}s.boss.picked=idx;return false;}
 recast(ps){
  const deployed=[...ps.board.values()].filter(p=>p.kind==='chess');
  for(const piece of deployed){
   const rec=this.m.gd.chess(piece.id),tier=rec?.tier+1;if(!rec||tier>6)continue;
   const candidates=Object.keys(this.m.data.chess).filter(id=>{const c=this.m.data.chess[id];return c.tier===tier&&!c.isGolden&&!c.isHidden&&!c.isDiy&&!c.optionalRecruit&&c.visible!==false&&this.operatorAvailable(id,ps)&&(!rec.isGolden||this.m.gd.goldenIdOf(id));});
   if(!candidates.length)continue;
   const id=candidates[Math.floor(this.rng()*candidates.length)];ps.removeTokensOf(piece.uid);ps.returnCopies(piece);
   piece.id=rec.isGolden?this.m.gd.goldenIdOf(id):id;piece.poolCopies=0;piece.poolExempt=true;piece.meta={};
  }
  ps.recompute();
 }
 grant(ps,card){const e=card.effect;if(e.kind==='beastHeart')this.beastHeart(ps);if(e.kind==='freeUpgrade'){ps.addFunds(e.amount,{reason:'augment'});ps.shop.upgradePrice=0;}if(e.kind==='playerHp'){if(this.m.gd.config.customRules?.sharedHp&&this.m.teamLp!=null){this.m.teamLp+=e.amount;this.m._syncTeamLp();}else ps.lp+=e.amount;this.m.markPublic();}if(e.kind==='recast')this.recast(ps);if(e.kind==='harmony')ps.recompute();if(e.kind==='layers'){const ids=Object.keys(ps.bonds).filter(id=>ps.bonds[id].active&&this.m.bondLive(id)&&!this.m.gd.bond(id)?.noStack);for(const id of ids)ps.addLayers(id,this.m.gd.bond(id).isCore?e.core:e.aux,{requireActive:true,reason:'augment'});}if(e.kind==='refresh')ps.shop.freeRefreshes+=e.count;if(e.kind==='income')ps.addFunds(e.amount,{reason:'augment'});const grants=[];
  if(e.kind==='starterPack'){const families=this.starterFamilies(e,ps);if(families.length){const family=families[Math.floor(this.rng()*families.length)];for(const ids of family.tiers)grants.push({kind:'chess',id:ids[Math.floor(this.rng()*ids.length)]});}}
  if(e.kind==='hammerGrant')for(let n=0;n<e.count&&e.items.length;n++)grants.push({kind:'item',id:e.items[Math.floor(this.rng()*e.items.length)]});
  if(e.kind==='beastHeart'){const pool=Object.keys(this.m.data.chess).filter(id=>{const c=this.m.data.chess[id];return c.isGolden&&!c.isHidden&&!c.isDiy&&!c.optionalRecruit&&c.visible!==false&&this.operatorAvailable(id,ps);});for(let n=0;n<e.count&&pool.length;n++)grants.push({kind:'chess',id:pool[Math.floor(this.rng()*pool.length)]});}
  if(e.kind==='items')e.items.forEach((id,i)=>{for(let n=0;n<(e.counts?.[i]??e.count);n++)grants.push({kind:'item',id});});
  if(e.kind==='chess'){const pool=this.chessCandidates(e,ps);for(let n=0;n<e.count&&pool.length;n++)grants.push({kind:'chess',id:pool[Math.floor(this.rng()*pool.length)]});}
  if(grants.length){this.pending.set(ps.playerId,[...(this.pending.get(ps.playerId)||[]),...grants]);this.drain(ps);if(this.pending.get(ps.playerId)?.length)this.m.toast(ps,'info','증강 보상을 보관 중입니다. 대기석의 빈 공간이 생기면 지급합니다.');}ps.dirty();
 }
 drain(ps){if(!this.enabled||this.delivering)return;const queue=this.pending.get(ps.playerId);if(!queue?.length)return;this.delivering=true;try{while(queue.length){const stale=queue.findIndex(g=>g.kind==='chess'&&!this.operatorAvailable(g.id,ps));if(stale>=0){queue.splice(stale,1);continue;}const free=ps.hand.some(x=>!x)||ps.temp.some(x=>!x),idx=queue.findIndex(g=>free||(g.kind==='item'?ps.completesItemMerge(g.id):ps.completesChessMerge(g.id)));if(idx<0)break;const g=queue[idx];const p=g.kind==='item'?ps.acquireItem(g.id,{source:'augment',fromPool:false}):ps.acquireChess(g.id,{source:'augment',fromPool:false});if(!p)break;queue.splice(idx,1);}}finally{this.delivering=false;}}
 beastHeart(ps){
  // Sell the snapshot of all operators first, including equipment returns, then destroy all equipment.
  const pieces=[...ps.board.values(),...ps.hand,...ps.temp].filter(p=>p?.kind==='chess');
  for(const piece of pieces){const loc=ps.find(piece.uid);if(!loc)continue;ps._detach(loc);ps.removeTokensOf(piece.uid);ps.returnCopies(piece);for(const item of piece.items||[])this.m.dispatchItem(ps,item,piece,'onDestroy',{item,holder:piece,reason:'augment'});piece.items=[];const ev={piece,gain:ps.gd.sellPrice(piece.id)};this.m.dispatch(ps,'onSold',ev);ps.addFunds(Math.max(0,Math.trunc(Number(ev.gain)||0)),{reason:'sell'});ps.stats.sells++;ps.round.sells++;}
  for(const item of [...ps.hand,...ps.temp].filter(p=>p?.kind==='item')){const loc=ps.find(item.uid);if(loc){ps._detach(loc);this.m.dispatchItem(ps,item,null,'onDestroy',{item,holder:null,reason:'augment'});}}
  ps.recompute();
 }
 roundStart(ps){
  for(const card of this.allyCards(ps))if(card.effect.kind==='gainTrait'){
   const ctx=makeCtx(this.m,ps,{kind:'augment',key:card.id},'onRoundStart');
   const candidates=ctx.board().filter(p=>p.kind==='chess'&&ctx.garrisonsOf(p.uid).some(g=>g.eventType==='SERVER_GAIN')).sort((a,b)=>(b.col-a.col)||(a.row-b.row));
   if(candidates[0])triggerGainEffects(ctx,candidates[0]);
  }
 }
 allyCards(ps){return this.allies.get(ps.playerId)||[];}
 income(ps){return this.allyCards(ps).reduce((n,a)=>n+(a.effect.kind==='income'?a.effect.amount:0),0);}
 price(ps,chess){return this.allyCards(ps).reduce((n,a)=>n+(a.effect.kind==='price'&&Number.isFinite(chess?.tier)&&chess.tier<=(a.effect.maxTier??Infinity)?a.effect.amount:0),0);}
 battleState(){if(!this.enabled)return null;return {enemyAtkMultiplier:this.m.gameplayMode==='augment'||this.settings.enemyAtkByAugment===1?1+this.history.length*.08:1,enemyDefMultiplier:this.m.gameplayMode==='augment'||this.settings.enemyDefByAugment===1?1+this.history.length*.08:1,enemyResBonus:this.m.gameplayMode==='augment'||this.settings.enemyResByAugment===1?this.history.length*4:0,enemyHpMultiplier:this.m.gameplayMode==='augment'||this.enabled&&this.settings.enemyHpByAugment===1?augmentEnemyHpMultiplier(this.history):1,allies:Object.fromEntries([...this.allies].map(([id,list])=>[id,list.map(a=>({id:a.id,effect:a.effect}))])),enemies:this.enemies.map(a=>({id:a.id,effect:a.effect}))};}
 leakHpCost(){return 1;}
 breakthroughCost(){return this.enabled?this.enemies.reduce((n,a)=>n+(a.effect.kind==='leak'?a.effect.amount:0),0):0;}
 creditLeaks(field,counts){
  const cost=this.breakthroughCost();if(!cost||field.kind!=='normal'||!counts)return;
  const paid=field.augmentLeaksBy||(field.augmentLeaksBy={});
  const allowed=new Set([...(field.players||[]),...(field.spec?.spawns||[]).map(s=>s.ownerPlayerId??s.sourcePlayerId)]);
  for(const [id,raw]of Object.entries(counts)){
   const ps=this.m.players.get(id);if(!allowed.has(id)||!ps?.alive||!Number.isInteger(raw)||raw<0)continue;
   const n=Math.min(100000,raw),delta=Math.max(0,n-(paid[id]||0));if(!delta)continue;
   paid[id]=n;
   const shared=this.m.gd.config.customRules?.sharedHp&&this.m.teamLp!=null;
   const losses=field.augmentHpLostBy||(field.augmentHpLostBy={});
   const loss=Math.min(Math.max(0,shared?this.m.teamLp:ps.lp),Math.max(0,10-(losses[id]||0)),delta*cost);
   losses[id]=(losses[id]||0)+loss;
   if(shared){this.m.teamLp-=loss;this.m._syncTeamLp();}else ps.lp-=loss;
   ps.stats.lpLost+=loss;ps.dirty();this.m.markPublic();
  }
 }
 // Only the server-approved surrender flag converts remaining enemies into breakthrough leaks.
 // Cumulative creditLeaks accounting also covers entries already charged during the fight.
 creditResult(field,result=field.result){if(result&&!result.synthetic)this.creditLeaks(field,Object.fromEntries(Object.entries(result.perPlayer||{}).map(([id,p])=>[id,(p.leaked||[]).filter(l=>field.endRequested||l.entered===true).length])));}

 bossHpMultiplier(){return (this.m.gameplayMode==='augment'||this.enabled&&this.settings.bossHpByAugment===1?augmentBossHpMultiplier(this.history):1)*(1+this.enemies.reduce((n,a)=>n+(a.effect.mods?.hpPct||0),0));}
 publicView(){if(!this.enabled)return null;const s=this.current;return {leakHpCost:this.leakHpCost(),selectedEnemies:this.enemies.map(augmentView),selectedAllies:Object.fromEntries([...this.allies].map(([id,c])=>[id,c.map(augmentView)])),history:this.history.slice(),selection:s?{id:s.id,round:s.round,grade:s.grade,side:s.side,settling:s.settling,settleDeadline:s.settling?this.m.deadline:0,rerollLimit:s.side==='ally'?this.settings.augmentAllyRerolls:this.settings.augmentEnemyRerolls,vote:this.voting(),weightedVote:this.voting()&&this.settings.augmentEnemyVote===2,voteResultIdx:s.voteResultIdx??null,votes:this.voting()?Object.fromEntries(s.votes):null,rerollsLeft:s.rerollsLeft,hostId:this.host(),picked:Object.fromEntries([...s.slots].map(([id,slot])=>[id,slot.picked!=null])),bossPicked:s.boss?.picked!=null,bossPickedIdx:s.boss?.picked,cards:s.side==='enemy'?s.boss.cards.map(c=>c?augmentView(c):null):null,rerolls:s.side==='enemy'?s.boss.rerolls.slice():null}:null};}
 spectatorView(ps){const s=this.current;return {playerId:ps?this.m._watchTargetOf(ps):null,t:'m.augmentWatch',eventId:s?.id,choices:s?.side==='ally'?Object.fromEntries([...s.slots].map(([id,slot])=>[id,{cards:slot.cards.map(c=>c?augmentView(c):null),rerolls:slot.rerolls.slice(),picked:slot.picked}])):{}};}
 privateView(ps){if(!this.enabled)return null;const s=this.current,slot=s?.side==='ally'?s.slots.get(ps.playerId):null;return {selected:this.allyCards(ps).map(augmentView),pending:(this.pending.get(ps.playerId)||[]).length,selection:slot?{eventId:s.id,cards:slot.cards.map(c=>c?augmentView(c):null),rerolls:slot.rerolls.slice(),picked:slot.picked}:null};}
}

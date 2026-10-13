import {test} from 'node:test';import assert from 'node:assert/strict';
import {Match} from '../../server/match/Match.js';import {loadData} from '../../server/data.js';import {VirtualScheduler} from '../../server/match/scheduler.js';
import {PHASE,ERR} from '../../shared/constants.js';import {rollAugmentGrade,createAugmentCatalog,drawAugmentCard} from '../../shared/augments.js';import {buildResult} from '../../server/match/results.js';
const data=loadData('content/production/data');
function fixture(t,{n=1,enabled=true,host='p0',seed=1}={}){const sched=new VirtualScheduler();const m=new Match({data,mode:n===8?'coop8':n===1?'solo':'coop',difficulty:'NORMAL',seed,customExtensions:{rules:enabled?['augments']:[]},seats:Array.from({length:n},(_,i)=>({seat:i,playerId:'p'+i,name:'P'+i,connected:true})),getHostId:()=>host,scheduler:sched,send:()=>true,broadcast:()=>{},onEnd:()=>{}});t.after(()=>m.dispose());return {m,sched,ps:m.players.get('p0')};}
function request(m,ps,idx=0,reroll=false){const s=m.augments.current,slot=s.side==='ally'?s.slots.get(ps.playerId):s.boss;return m.handle(ps.playerId,{t:reroll?'g.augmentReroll':'g.augmentPick',eventId:s.id,side:s.side,idx,cardId:slot.cards[idx].id});}
test('grade probability boundaries and three consecutive silver prevention preserve gold/prism ratio',()=>{
 assert.deepEqual([0,.249,.25,.749,.75,.999].map(x=>rollAugmentGrade(()=>x)),['silver','silver','gold','gold','prism','prism']);
 assert.equal(rollAugmentGrade(()=>.1,['silver']),'silver');assert.equal(rollAugmentGrade(()=>.1,['silver','silver']),'gold');assert.equal(rollAugmentGrade(()=>.8,['silver','silver']),'prism');
});
test('catalog expands valid bond/tier grants and enforces allowed rounds and enemy tiers',()=>{
 for(const round of [4,7,10])for(const c of createAugmentCatalog(data,round)){
  assert.ok(c.rounds.includes(round));if(c.effect.candidates)assert.ok(c.effect.candidates.every(id=>data.chess[id].tier===c.effect.tier));
  if(c.effect.kind==='items')assert.ok(c.effect.items.every(id=>data.items[id]));
 }
 assert.ok(!createAugmentCatalog(data,4).some(a=>a.name==='페가수스'));assert.ok(createAugmentCatalog(data,10).some(a=>a.name==='페가수스'));
});
test('each player gets private choices; independent rerolls retain other slots and reject stale cards',t=>{
 const {m}=fixture(t,{n:8});m.round=4;m.afterRoundStart();const ps=m.players.get('p0'),other=m.players.get('p1'),slot=m.augments.current.slots.get(ps.playerId);const old=slot.cards.slice(),others=m.augments.privateView(other).selection;
 assert.equal(m.augments.publicView().selection.cards,null);assert.equal(slot.cards.length,3);assert.ok(slot.cards.every(a=>a.grade===m.augments.current.grade));
 assert.deepEqual(request(m,ps,0,true),{ok:true});assert.notEqual(slot.cards[0].id,old[0].id);assert.equal(slot.cards[1].id,old[1].id);assert.deepEqual(m.augments.privateView(other).selection,others);
 assert.equal(m.handle(ps.playerId,{t:'g.augmentPick',eventId:m.augments.current.id,side:'ally',idx:0,cardId:old[0].id}).error,ERR.BAD_TARGET);
 assert.equal(slot.rerolls[0],0);assert.equal(slot.rerolls[1],1);assert.equal(request(m,ps,0,true).error,ERR.BAD_TARGET);
});
test('seen cards never return until exhaustion; reset excludes the currently displayed cards',()=>{
 const a=[{id:'a'},{id:'b'},{id:'c'},{id:'d'}],seen=new Set(['a','b','c']);assert.equal(drawAugmentCard(a,seen,[a[0],a[1],a[2]],()=>0).id,'d');assert.equal(drawAugmentCard(a,seen,[a[0],a[1],a[2]],()=>0).id,'d');assert.ok(seen.has('a'));
});
test('all eight picks settle for exactly three seconds; only host controls enemy choices and rerolls',t=>{
 const {m,sched}=fixture(t,{n:8,host:'p3'});m.round=4;m.afterRoundStart();assert.equal(m.deadline-sched.now(),60000);
 for(const ps of m.order)assert.deepEqual(request(m,ps),{ok:true});assert.ok(m.augments.current.settling);assert.equal(m.deadline-sched.now(),3000);
 sched.advance(2999);assert.equal(m.augments.current.side,'ally');sched.advance(1);assert.equal(m.augments.current.side,'enemy');assert.equal(m.deadline-sched.now(),60000);
 assert.equal(request(m,m.players.get('p0')).error,ERR.NOT_HOST);assert.equal(request(m,m.players.get('p0'),0,true).error,ERR.NOT_HOST);
 assert.deepEqual(request(m,m.players.get('p3'),0,true),{ok:true});assert.deepEqual(request(m,m.players.get('p3')),{ok:true});assert.equal(m.deadline-sched.now(),3000);sched.advance(3000);assert.equal(m.phase,PHASE.PREP);assert.equal(m.augments.roundLog.length,9);assert.equal(m.errorCount,0);
});
test('solo choices have no deadline but retain three-second settling',t=>{
 const {m,sched,ps}=fixture(t);m.round=4;m.afterRoundStart();assert.equal(m.deadline,0);sched.advance(120000);assert.equal(m.augments.allyCards(ps).length,0);request(m,ps);assert.equal(m.deadline-sched.now(),3000);sched.advance(3000);assert.equal(m.augments.current.side,'enemy');assert.equal(m.deadline,0);sched.advance(120000);assert.equal(m.augments.enemies.length,0);request(m,ps);sched.advance(3000);assert.equal(m.phase,PHASE.PREP);
});
test('disabled augments never change normal phases or expose selected cards',t=>{const {m}=fixture(t,{enabled:false});m.round=4;m.afterRoundStart();assert.equal(m.augments.current,null);assert.equal(m.augments.battleState(),null);assert.equal(m.augments.publicView(),null);assert.equal(m.augments.income(m.players.get('p0')),0);});
test('grant rewards ignore stock, beacon remains separate, and funds/price effects persist',t=>{
 const {m,ps}=fixture(t);m.round=4;const catalog=createAugmentCatalog(m.data,10);const beacon=catalog.find(a=>a.name==='인력사무소');m.augments.grant(ps,beacon);assert.equal([...ps.hand,...ps.temp].filter(p=>p?.id==='chess_item_5_04_e_a').length,4);assert.equal(ps.completesItemMerge('chess_item_5_04_e_a'),false);
 const frugal=createAugmentCatalog(m.data,4).find(a=>a.name==='알뜰살뜰'),price=catalog.find(a=>a.name==='예견');m.augments.allies.set(ps.playerId,[frugal,price]);assert.equal(m.augments.income(ps),3);assert.equal(ps.priceOf({kind:'chess',id:'x',basePrice:2}),1);assert.equal(ps.priceOf({kind:'item',id:'x',basePrice:2}),2);
 const result=buildResult(m,{victory:false,hiddenReached:false,hiddenCleared:false,reason:'test'});assert.ok(result.augments);assert.equal(result.players[0].augments.length,2);
});

test('an eight-player augmented match progresses from setup to final result through all three selections',async t=>{
 const {makeMatch}=await import('./harness.js');
 const h=makeMatch({mode:'coop8',humans:1,bots:7,data,customExtensions:{rules:['augments']},fake:true,script:b=>({duration:1,bossDps:b.kind==='boss'||b.kind==='hidden'?1e9:0}),botRehearsal:0});t.after(()=>h.m.dispose());h.start();h.m.handle('p_0',{t:'g.autoplay',on:true});
 const result=h.runToEnd({maxSteps:200000});
 assert.deepEqual(h.m.augments.history.length,3);assert.deepEqual([...h.m.augments.completed],[4,7,10]);assert.equal(result.augments.picks.filter(p=>p.side==='enemy').length,3);assert.equal(h.m.errorCount,0,JSON.stringify(h.logs.error));
});

test('one human with seven AI seats gets untimed personal and enemy augment choices',async t=>{
 const {makeMatch}=await import('./harness.js');const h=makeMatch({mode:'coop8',humans:1,bots:7,data,customExtensions:{rules:['augments']},fake:true});t.after(()=>h.m.dispose());const m=h.m;m.round=4;m.afterRoundStart();assert.equal(m.deadline,0);const human=m.order.find(p=>!p.isBot);m.augments.choose(human,0);for(const p of m.order.filter(p=>p.isBot))m.augments.choose(p,0);h.sched.advance(3000);assert.equal(m.augments.current.side,'enemy');assert.equal(m.deadline,0);
});

test('custom grade weights and separate rerolls persist; obsolete exclusions have no effect',t=>{
 const {m,ps}=fixture(t);m.customExtensions.ruleValues={augmentSilver:0,augmentGold:100,augmentPrism:0,augmentAllyRerolls:3,augmentEnemyRerolls:0};m.augments.settings={...m.augments.settings,...m.customExtensions.ruleValues};const disabled=createAugmentCatalog(m.data,4).filter(a=>a.grade==='gold'&&a.side==='ally').slice(0,10).map(a=>a.id);m.customExtensions.disabledAugments=disabled;m.round=4;m.afterRoundStart();assert.equal(m.augments.current.grade,'gold');const slots=m.augments.current.slots.get(ps.playerId);assert.deepEqual(slots.rerolls,[3,3,3]);assert.ok(m.augments.catalog("ally",ps).some(a=>disabled.includes(a.id)));m.augments.enterEnemy();assert.deepEqual(m.augments.current.boss.rerolls,[0,0,0]);assert.equal(request(m,ps,0,true).error,ERR.BAD_TARGET);
});

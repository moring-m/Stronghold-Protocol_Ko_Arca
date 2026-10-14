import {test} from 'node:test';import assert from 'node:assert/strict';
import {Match} from '../../server/match/Match.js';import {loadData} from '../../server/data.js';import {VirtualScheduler} from '../../server/match/scheduler.js';
import {PHASE,ERR} from '../../shared/constants.js';import {rollAugmentGrade,createAugmentCatalog,drawAugmentCard} from '../../shared/augments.js';import {buildResult} from '../../server/match/results.js';
const data=loadData('content/production/data');
function fixture(t,{n=1,enabled=true,host='p0',seed=1,ruleValues={},rules=[]}={}){const sched=new VirtualScheduler();const m=new Match({data,mode:n===8?'coop8':n===1?'solo':'coop',difficulty:'NORMAL',seed,customExtensions:{rules:enabled?['augments',...rules]:[],ruleValues},seats:Array.from({length:n},(_,i)=>({seat:i,playerId:'p'+i,name:'P'+i,connected:true})),getHostId:()=>host,scheduler:sched,send:()=>true,broadcast:()=>{},onEnd:()=>{}});t.after(()=>m.dispose());return {m,sched,ps:m.players.get('p0')};}
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
 const {m,sched}=fixture(t,{n:8,host:'p3'});m.round=4;m.afterRoundStart();assert.equal(m.deadline-sched.now(),120000);
 for(const ps of m.order)assert.deepEqual(request(m,ps),{ok:true});assert.ok(m.augments.current.settling);assert.equal(m.deadline-sched.now(),3000);
 sched.advance(2999);assert.equal(m.augments.current.side,'ally');sched.advance(1);assert.equal(m.augments.current.side,'enemy');assert.equal(m.deadline-sched.now(),120000);
 assert.equal(request(m,m.players.get('p0')).error,ERR.NOT_HOST);assert.equal(request(m,m.players.get('p0'),0,true).error,ERR.NOT_HOST);
 assert.deepEqual(request(m,m.players.get('p3'),0,true),{ok:true});assert.deepEqual(request(m,m.players.get('p3')),{ok:true});assert.equal(m.deadline-sched.now(),3000);sched.advance(3000);assert.equal(m.phase,PHASE.PREP);assert.equal(m.augments.roundLog.length,9);assert.equal(m.errorCount,0);
});
test('solo choices have no deadline but retain three-second settling',t=>{
 const {m,sched,ps}=fixture(t);m.round=4;m.afterRoundStart();assert.equal(m.deadline,0);sched.advance(120000);assert.equal(m.augments.allyCards(ps).length,0);request(m,ps);assert.equal(m.deadline-sched.now(),3000);sched.advance(3000);assert.equal(m.augments.current.side,'enemy');assert.equal(m.deadline,0);sched.advance(120000);assert.equal(m.augments.enemies.length,0);request(m,ps);sched.advance(3000);assert.equal(m.phase,PHASE.PREP);
});
test('disabled augments never change normal phases or expose selected cards',t=>{const {m}=fixture(t,{enabled:false});m.round=4;m.afterRoundStart();assert.equal(m.augments.current,null);assert.equal(m.augments.battleState(),null);assert.equal(m.augments.publicView(),null);assert.equal(m.augments.income(m.players.get('p0')),0);});
test('grant rewards ignore stock, beacon remains separate, and funds/price effects persist',t=>{
 const {m,ps}=fixture(t);m.round=4;const catalog=createAugmentCatalog(m.data,10);const beacon=catalog.find(a=>a.name==='인력사무소');m.augments.grant(ps,beacon);assert.equal([...ps.hand,...ps.temp].filter(p=>p?.id==='chess_item_5_04_e_a').length,4);assert.equal(ps.completesItemMerge('chess_item_5_04_e_a'),false);
 const frugal=createAugmentCatalog(m.data,4).find(a=>a.name==='알뜰살뜰 III'),price=catalog.find(a=>a.name==='예견');m.augments.allies.set(ps.playerId,[frugal,price]);assert.equal(m.augments.income(ps),3);for(const tier of [1,2,3,4,5,6]){const id=Object.keys(m.data.chess).find(id=>m.data.chess[id].tier===tier&&!m.data.chess[id].isGolden);assert.equal(ps.priceOf({kind:'chess',id,basePrice:2}),tier<=3?1:2);}assert.equal(ps.priceOf({kind:'item',id:'x',basePrice:2}),2);
 const result=buildResult(m,{victory:false,hiddenReached:false,hiddenCleared:false,reason:'test'});assert.ok(result.augments);assert.equal(result.players[0].augments.length,2);
});

for(const voting of [0,1])test(`an eight-player augmented match progresses through all selections (vote=${voting})`,async t=>{
 const {makeMatch}=await import('./harness.js');
 const h=makeMatch({mode:'coop8',humans:1,bots:7,data,customExtensions:{rules:['augments'],ruleValues:{augmentEnemyVote:voting}},fake:true,script:b=>({duration:1,bossDps:b.kind==='boss'||b.kind==='hidden'?1e9:0}),botRehearsal:0});t.after(()=>h.m.dispose());h.start();h.m.handle('p_0',{t:'g.autoplay',on:true});
 const result=h.runToEnd({maxSteps:200000});
 assert.deepEqual(h.m.augments.history.length,3);assert.deepEqual([...h.m.augments.completed],[4,7,10]);assert.equal(result.augments.picks.filter(p=>p.side==='enemy').length,3);assert.equal(h.m.errorCount,0,JSON.stringify(h.logs.error));
});

test('one human with seven AI seats gets untimed personal and enemy augment choices',async t=>{
 const {makeMatch}=await import('./harness.js');const h=makeMatch({mode:'coop8',humans:1,bots:7,data,customExtensions:{rules:['augments']},fake:true});t.after(()=>h.m.dispose());const m=h.m;m.round=4;m.afterRoundStart();assert.equal(m.deadline,0);const human=m.order.find(p=>!p.isBot);m.augments.choose(human,0);for(const p of m.order.filter(p=>p.isBot))m.augments.choose(p,0);h.sched.advance(3000);assert.equal(m.augments.current.side,'enemy');assert.equal(m.deadline,0);
});

test('custom grade weights and separate rerolls persist; obsolete exclusions have no effect',t=>{
 const {m,ps}=fixture(t);m.customExtensions.ruleValues={augmentSilver:0,augmentGold:100,augmentPrism:0,augmentAllyRerolls:3,augmentEnemyRerolls:0};m.augments.settings={...m.augments.settings,...m.customExtensions.ruleValues};const disabled=createAugmentCatalog(m.data,4).filter(a=>a.grade==='gold'&&a.side==='ally').slice(0,10).map(a=>a.id);m.customExtensions.disabledAugments=disabled;m.round=4;m.afterRoundStart();assert.equal(m.augments.current.grade,'gold');const slots=m.augments.current.slots.get(ps.playerId);assert.deepEqual(slots.rerolls,[3,3,3]);assert.ok(m.augments.catalog("ally",ps).some(a=>disabled.includes(a.id)));m.augments.enterEnemy();assert.deepEqual(m.augments.current.boss.rerolls,[0,0,0]);assert.equal(request(m,ps,0,true).error,ERR.BAD_TARGET);
});

function enemyVote(t,n=4,rerolls=1){const h=fixture(t,{n,ruleValues:{augmentEnemyVote:1,augmentEnemyRerolls:rerolls}});h.m.round=4;h.m.afterRoundStart();for(const p of h.m.alivePlayers())request(h.m,p);h.sched.advance(3000);return h;}
function vote(m,p,idx){return m.handle(p.playerId,{t:'g.augmentPick',eventId:m.augments.current.id,side:'enemy',idx,cardId:idx===3?'augment-reroll':m.augments.current.boss.cards[idx].id});}
test('personal augment grants wait for all choices and the settling countdown',t=>{
 const {m,sched,ps}=fixture(t,{n:2});m.round=4;m.afterRoundStart();const gift=createAugmentCatalog(data,4).find(c=>c.side==='ally'&&c.effect.kind==='income');assert.ok(gift);m.augments.current.slots.get(ps.playerId).cards[0]=gift;const money=ps.funds;
 request(m,ps);assert.equal(ps.funds,money);assert.equal(m.augments.allyCards(ps).length,0);request(m,m.players.get('p1'));sched.advance(2999);assert.equal(ps.funds,money);sched.advance(1);assert.equal(ps.funds,money+gift.effect.amount);
});
test('enemy votes accept every alive player, settle in three seconds and apply only the majority',t=>{
 const {m,sched}=enemyVote(t);assert.equal(m.deadline-sched.now(),120000);assert.equal(m.augments.publicView().selection.vote,true);const winning=m.augments.current.boss.cards[1].id;
 for(const [i,p]of m.alivePlayers().entries())assert.deepEqual(vote(m,p,i===0?0:1),{ok:true});assert.equal(m.augments.enemies.length,0);sched.advance(2999);assert.equal(m.augments.enemies.length,0);sched.advance(1);assert.equal(m.augments.enemies[0].id,winning);assert.equal(m.phase,PHASE.PREP);
});
test('full reroll votes consume one opportunity, reset votes and forbid individual rerolls',t=>{
 const {m,sched}=enemyVote(t);const ps=m.players.get('p0'),before=m.augments.current.boss.cards.map(c=>c.id);assert.equal(request(m,ps,0,true).error,ERR.BAD_TARGET);for(const p of m.alivePlayers())vote(m,p,3);sched.advance(3000);const s=m.augments.current;assert.equal(s.rerollsLeft,0);assert.equal(s.votes.size,0);assert.equal(s.settling,false);assert.equal(m.augments.enemies.length,0);assert.notDeepEqual(s.boss.cards.map(c=>c.id),before);assert.equal(vote(m,ps,3).error,ERR.BAD_TARGET);for(const p of m.alivePlayers())vote(m,p,0);sched.advance(3000);assert.equal(m.augments.enemies.length,1);
});
test('ties are randomized only among the highest voted choices, including reroll',t=>{
 for(const roll of [0,.999]){const {m,sched}=enemyVote(t,2);m.augments.rng=()=>roll;const candidates=m.augments.current.boss.cards.map(c=>c.id);vote(m,m.players.get('p0'),0);vote(m,m.players.get('p1'),1);sched.advance(3000);assert.equal(m.augments.enemies[0].id,candidates[roll===0?0:1]);}
});
test('vote deadline resolves abstentions and selected cards never return after candidate exhaustion',t=>{
 const {m,sched}=enemyVote(t,2);vote(m,m.players.get('p0'),0);sched.advance(120000);assert.equal(m.augments.current.settling,true);sched.advance(3000);assert.equal(m.phase,PHASE.PREP);
 m.round=7;m.afterRoundStart();const s=m.augments.current,p=m.players.get('p0');s.grade='silver';const ally=m.augments.catalog('ally',p)[0];m.augments.allies.set(p.playerId,[ally]);assert.ok(!m.augments.catalog('ally',p).some(c=>c.id===ally.id));m.augments.seen.set(p.playerId,new Set(m.augments.catalog('ally',p).map(c=>c.id)));assert.ok(!m.augments.makeSlots('ally',p).cards.some(c=>c?.id===ally.id));
 s.side='enemy';const enemy=m.augments.catalog('enemy')[0];m.augments.enemies.push(enemy);m.augments.enemySeen=new Set(m.augments.catalog('enemy').map(c=>c.id));assert.ok(!m.augments.makeSlots('enemy').cards.some(c=>c?.id===enemy.id));
});

test('a selected augment excludes only itself, not a different grade of the same effect or another players choices',t=>{
 const {m,ps}=fixture(t,{n:2});m.round=4;m.afterRoundStart();const s=m.augments.current,catalog=createAugmentCatalog(m.data,4),chosen=catalog.find(a=>a.name==='공격력 증가 I'&&a.side==='ally'),other=catalog.find(a=>a.name==='공격력 증가 II'&&a.side==='ally');m.augments.allies.set(ps.playerId,[chosen]);s.grade='silver';assert.ok(!m.augments.catalog('ally',ps).some(a=>a.id===chosen.id));assert.ok(m.augments.catalog('ally',m.players.get('p1')).some(a=>a.id===chosen.id));s.grade='gold';assert.ok(m.augments.catalog('ally',ps).some(a=>a.id===other.id));
});

test('only the new Harmony activation augment exists, is personal and is excluded by the custom rule',t=>{
 const {m,ps}=fixture(t,{n:2});m.round=4;m.afterRoundStart();m.augments.current.grade='gold';const card=m.augments.catalog('ally',ps).find(c=>c.name==='조화');assert.ok(card);assert.equal(ps.bonds.maniShip?.active||false,false);m.augments.allies.set(ps.playerId,[card]);m.augments.grant(ps,card);assert.equal(ps.bonds.maniShip.active,true);assert.equal(m.players.get('p1').bonds.maniShip?.active||false,false);
 const other=fixture(t,{rules:['defaultHarmony']});other.m.round=4;other.m.afterRoundStart();other.m.augments.current.grade='gold';assert.equal(other.ps.bonds.maniShip.active,true);assert.ok(!other.m.augments.catalog('ally',other.ps).some(c=>c.name==='조화'));
});
for(const [round,core,aux]of [[4,8,4],[7,16,8],[10,24,12]])test(`Stack I gives only active stackable core/aux bonds their round ${round} amounts`,t=>{
 const {m,ps}=fixture(t);ps.bondCountBonus={yanShip:5,swiftShip:5,maniShip:1};ps.recompute();assert.ok(ps.bonds.yanShip.active&&ps.bonds.swiftShip.active);const card=createAugmentCatalog(data,round).find(a=>a.name==='중첩 I');m.augments.grant(ps,card);assert.equal(ps.layers.yanShip,core);assert.equal(ps.layers.swiftShip,aux);assert.equal(ps.layers.maniShip||0,0);assert.equal(ps.layers.arcaneShip||0,0);
});
for(const [round,tier]of [[4,4],[7,5],[10,6]])test(`Starter pack grants one operator of each tier up to ${tier} from one eligible bond`,t=>{
 const {m,ps}=fixture(t);m.round=round;const card=createAugmentCatalog(data,round).find(a=>a.name==='스타터 팩'),families=m.augments.starterFamilies(card.effect,ps);assert.ok(families.length);const expected=families[0].tiers.map(ids=>ids[0]);m.augments.rng=()=>0;m.augments.grant(ps,card);const pieces=[...ps.hand,...ps.temp].filter(p=>p?.kind==='chess');assert.equal(expected.length,tier);for(const id of expected)assert.ok(pieces.some(p=>p.id===id),id);assert.deepEqual(expected.map(id=>data.chess[id].tier),Array.from({length:tier},(_,i)=>i+1));const blocked=card.effect.families[0];m.bannedChess.push(...blocked.tiers[0]);assert.ok(!m.augments.starterFamilies(card.effect,ps).some(f=>f.bondId===blocked.bondId));
});
test('round variants of the same named augment retain one identity while tiers remain distinct',()=>{
 const rows=[4,7,10].map(round=>createAugmentCatalog(data,round));for(const name of ['스타터 팩','중첩 I','중첩 II','중첩 III'])assert.equal(new Set(rows.map(list=>list.find(a=>a.name===name).id)).size,1,name);assert.notEqual(rows[0].find(a=>a.name==='중첩 I').id,rows[0].find(a=>a.name==='중첩 II').id);const catalog=rows[0];assert.equal(catalog.find(a=>a.name==='알뜰살뜰 II').effect.amount,2);assert.equal(catalog.find(a=>a.name==='알뜰살뜰 III').effect.amount,3);
});

test('spectators see all ally offers and selected card without exposing offers publicly',t=>{
 const {m,ps}=fixture(t,{n:4});m.round=4;m.afterRoundStart();
 const before=m.augments.spectatorView();assert.equal(Object.keys(before.choices).length,4);assert.equal(before.choices.p0.cards.length,3);assert.equal(m.augments.publicView().selection.cards,null);
 assert.equal(before.choices.p0.picked,null);request(m,ps,1);assert.equal(m.augments.spectatorView().choices.p0.picked,1);
 for(const p of m.alivePlayers().slice(1))request(m,p,0);
});
test('Swordmaster and Arts master exclude every other tier in their own family after selection',t=>{
 const {m,ps}=fixture(t);m.round=4;m.afterRoundStart();
 for(const family of ['소드마스터','아츠 마스터'])for(const suffix of ['I','II','III']){
  const selected=createAugmentCatalog(data,4).find(a=>a.name===`${family} ${suffix}`);m.augments.allies.set(ps.playerId,[selected]);
  for(const grade of ['silver','gold','prism']){m.augments.current.grade=grade;const pool=m.augments.catalog('ally',ps);assert.ok(!pool.some(a=>a.name.startsWith(family)));assert.ok(pool.some(a=>a.effect.kind==='income'));}
 }
});
test('cataclysm replaces deployed operators without gains, retaining promotion, equipment, position and direction',t=>{
 const{m,ps}=fixture(t);const normal=Object.keys(data.chess).find(id=>data.chess[id].tier===2&&!data.chess[id].isGolden&&!data.chess[id].isDiy&&!data.chess[id].isHidden&&!data.chess[id].optionalRecruit),gold=m.gd.goldenIdOf(normal);
 const piece=ps.newPiece('chess',gold,{dir:'LEFT',poolExempt:true});piece.items=[ps.newPiece('item','chess_item_2_06_e_a')];ps.board.set('10,3',piece);const items=piece.items,uid=piece.uid,gained=ps.round.gainedChess;
 m.augments.grant(ps,createAugmentCatalog(data,4).find(a=>a.name==='대격변'));assert.equal(ps.board.get('10,3'),piece);assert.equal(m.gd.chess(piece.id).tier,3);assert.equal(m.gd.chess(piece.id).isGolden,true);assert.equal(piece.dir,'LEFT');assert.equal(piece.uid,uid);assert.equal(piece.items,items);assert.equal(ps.round.gainedChess,gained);assert.equal(piece.poolCopies,0);
});
test('Head hunting grants one, three or five operators and absent call grants eight communicators',t=>{
 const{m,ps}=fixture(t);ps.hand.fill(null);ps.temp.fill(null);
 for(const [suffix,n]of [['I',1],['II',3],['III',5]]){const c=createAugmentCatalog(data,10).find(a=>a.name===`헤드헌팅 ${suffix}`);assert.equal(c.effect.count,n);const before=ps.round.gainedChess;m.augments.grant(ps,c);assert.equal(ps.round.gainedChess-before,n);ps.hand.fill(null);ps.temp.fill(null);}
 const c=createAugmentCatalog(data,4).find(a=>a.name==='부재중 전화');assert.equal(c.effect.count,8);assert.deepEqual(c.effect.items,['chess_item_2_06_e_a']);
});

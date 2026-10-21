import {test} from 'node:test';import assert from 'node:assert/strict';
import {Match} from '../../server/match/Match.js';import {loadData} from '../../server/data.js';import {VirtualScheduler} from '../../server/match/scheduler.js';
import {PHASE,ERR} from '../../shared/constants.js';import {rollAugmentGrade,createAugmentCatalog,drawAugmentCard} from '../../shared/augments.js';import {buildResult} from '../../server/match/results.js';
const data=loadData('content/production/data');
function fixture(t,{n=1,enabled=true,host='p0',seed=1,ruleValues={},rules=[],protectedBonds=[],protectedAuxBonds=[]}={}){const sched=new VirtualScheduler();const m=new Match({data,mode:n===8?'coop8':n===1?'solo':'coop',difficulty:'NORMAL',seed,customExtensions:{rules:enabled?['augments',...rules]:[],ruleValues,protectedBonds,protectedAuxBonds},seats:Array.from({length:n},(_,i)=>({seat:i,playerId:'p'+i,name:'P'+i,connected:true})),getHostId:()=>host,scheduler:sched,send:()=>true,broadcast:()=>{},onEnd:()=>{}});t.after(()=>m.dispose());return {m,sched,ps:m.players.get('p0')};}
function request(m,ps,idx=0,reroll=false){const s=m.augments.current,slot=s.side==='ally'?s.slots.get(ps.playerId):s.boss;return m.handle(ps.playerId,{t:reroll?'g.augmentReroll':'g.augmentPick',eventId:s.id,side:s.side,idx,cardId:slot.cards[idx].id});}
test('grade probability boundaries and three consecutive silver prevention preserve gold/prism ratio',()=>{
 assert.deepEqual([0,.199,.2,.699,.7,.999].map(x=>rollAugmentGrade(()=>x)),['silver','silver','gold','gold','prism','prism']);
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
 assert.deepEqual(request(m,m.players.get('p3'),0,true),{ok:true});assert.deepEqual(request(m,m.players.get('p3')),{ok:true});assert.equal(m.deadline-sched.now(),3000);assert.equal(m.augments.publicView().selection.settleDeadline,m.deadline);sched.advance(2999);assert.equal(m.augments.current.side,'enemy');sched.advance(1);assert.equal(m.phase,PHASE.PREP);assert.equal(m.augments.roundLog.length,9);assert.equal(m.errorCount,0);
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
 for(const [i,p]of m.alivePlayers().entries())assert.deepEqual(vote(m,p,i===0?0:1),{ok:true});assert.equal(m.augments.enemies.length,0);assert.equal(m.augments.publicView().selection.voteResultIdx,1);assert.equal(m.augments.publicView().selection.bossPickedIdx,1);assert.equal(m.augments.publicView().selection.settleDeadline-sched.now(),3000);sched.advance(2999);assert.equal(m.augments.enemies.length,0);sched.advance(1);assert.equal(m.augments.enemies[0].id,winning);assert.equal(m.phase,PHASE.PREP);
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
 const {m,ps}=fixture(t,{protectedBonds:['yanShip'],protectedAuxBonds:['swiftShip']});ps.bondCountBonus={yanShip:5,swiftShip:5,maniShip:1};ps.recompute();assert.ok(ps.bonds.yanShip.active&&ps.bonds.swiftShip.active);const card=createAugmentCatalog(data,round).find(a=>a.name==='중첩 I');m.augments.grant(ps,card);assert.equal(ps.layers.yanShip,core);assert.equal(ps.layers.swiftShip,aux);assert.equal(ps.layers.maniShip||0,0);assert.equal(ps.layers.arcaneShip||0,0);
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
test('breakthrough charges each entry immediately, separately from the round HP cap',t=>{
 const {m}=fixture(t,{n:2});const players=[...m.players.values()];for(const p of players){p.bandId=m.gd.bandIds()[0];p.lp=30;}m.startRound(1);
 m.augments.enemies=[{effect:{kind:'leak',amount:1}}];
 const hp=players[0].lp;
 m.lastResults=new Map(players.map((p,i)=>[p.playerId,{leaked:Array.from({length:i?0:3},()=>({counted:true})),perfect:!!i,layerGains:{}}]));
 const field={kind:'normal',players:[players[0].playerId]};m.augments.creditLeaks(field,{[players[0].playerId]:3});assert.equal(players[0].lp,hp-3);m.augments.creditLeaks(field,{[players[0].playerId]:3});assert.equal(players[0].lp,hp-3);
 m.settle(null,null);assert.equal(players[0].lp,hp-6);assert.equal(players[0].stats.leaks,3);
});
test('random operator rewards draw with replacement rather than guaranteeing unique operators',t=>{
 const {m,ps}=fixture(t);const candidates=m.gd.visibleChess.filter(id=>{const c=m.data.chess[id];return c.tier===1&&!c.isGolden&&!c.isHidden&&!c.isDiy&&!c.optionalRecruit&&ps.canRecruit(id)&&!m.bannedChess.includes(id);});
 assert.ok(candidates.length>1);m.augments.rng=()=>0;
 const before=new Set(ps.hand.filter(Boolean).map(p=>p.uid));
 m.augments.grant(ps,{effect:{kind:'chess',tier:1,count:2,candidates}});
 const gained=ps.hand.filter(p=>p?.kind==='chess'&&!before.has(p.uid));
 assert.equal(gained.length,2);assert.equal(gained[0].id,gained[1].id);
});
test('drawn bond bans suppress named supports and starter families even when dual-bond operators remain',t=>{
 const {m,ps}=fixture(t);m.round=4;m.afterRoundStart();
 const bond='yanShip';assert.ok(m.bondInPool(bond));m.disabledBonds=[bond];assert.equal(m.bondLive(bond),false);
 for(const round of [4,7,10])for(const grade of ['silver','gold','prism']){
  m.round=round;m.augments.current.grade=grade;
  assert.ok(!m.augments.catalog('ally',ps).some(a=>a.bondId===bond));
  for(let i=0;i<10;i++)assert.ok(!m.augments.makeSlots('ally',ps).cards.some(a=>a?.bondId===bond));
 }
 assert.deepEqual(m.augments.starterFamilies({families:[{bondId:bond,tiers:[[m.gd.visibleChess[0]]]}]},ps),[]);
 m.augments.current.slots.set(ps.playerId,m.augments.makeSlots('ally',ps));assert.deepEqual(request(m,ps,0,true),{ok:true});assert.ok(!m.augments.current.slots.get(ps.playerId).cards.some(a=>a?.bondId===bond));
});
test('random operator augments and pending rewards never grant a banned operator',t=>{
 const {m,ps}=fixture(t);const candidates=m.gd.visibleChess.filter(id=>{const c=m.data.chess[id];return c.tier===1&&!c.isGolden&&!c.isHidden&&!c.isDiy&&!c.optionalRecruit&&ps.canRecruit(id)&&!m.bannedChess.includes(id);});assert.ok(candidates.length>=2);
 const [banned,allowed]=candidates;m.bannedChess.push(banned);m.augments.rng=()=>0;
 assert.equal(m.augments.operatorAvailable(banned,ps),false);assert.equal(m.augments.operatorAvailable(m.gd.goldenIdOf(banned),ps),false);
 m.augments.grant(ps,{effect:{kind:'chess',tier:1,count:2,candidates:[banned,allowed]}});
 assert.ok(ps.hand.filter(p=>p?.kind==='chess').every(p=>p.id===allowed));
 m.augments.pending.set(ps.playerId,[{kind:'chess',id:banned},{kind:'chess',id:allowed}]);m.augments.drain(ps);
 assert.equal(m.augments.pending.get(ps.playerId).length,0);assert.ok(![...ps.hand,...ps.temp,...ps.board.values()].some(p=>p?.id===banned));
});
test('generic layer augments skip banned bonds even if a stale active state exists',t=>{
 const {m,ps}=fixture(t);m.disabledBonds=['yanShip'];ps.bonds.yanShip={active:true,tier:1,count:3,layers:0};const before=ps.layers.yanShip||0;
 m.augments.grant(ps,{effect:{kind:'layers',core:24,aux:12}});assert.equal(ps.layers.yanShip||0,before);
});

test('listed and weighted random operator pools reject banned operators and banned bond pools',t=>{
 const {m}=fixture(t);const ids=m.gd.visibleChess.filter(id=>!m.bannedChess.includes(id)&&!m.data.chess[id].optionalRecruit);const [banned,allowed]=ids;assert.ok(allowed);m.bannedChess.push(banned);
 m.gd.raw={...m.gd.raw,choices:{...m.gd.choices,pools:{...m.gd.choices.pools,test_list:{kind:'chess',items:[banned,allowed]},test_weight:{kind:'chess',weighted:[[banned,1000],[allowed,1]]},test_bond:{kind:'chess',bond:'yanShip',items:[allowed]}}}};
 for(let i=0;i<20;i++){assert.equal(m.rollPool('test_list').id,allowed);assert.equal(m.rollPool('test_weight').id,allowed);}
 m.disabledBonds=['yanShip'];assert.equal(m.rollPool('test_bond'),null);
 m.gd.choices.pools.test_list.items=[banned];assert.equal(m.rollPool('test_list'),null);
});

test('generic headhunting offers disappear when all operators at the reward tier are banned',t=>{
 const {m,ps}=fixture(t);m.round=10;m.afterRoundStart();m.augments.current.grade='prism';
 const card=createAugmentCatalog(data,10).find(a=>a.effect.kind==='chess'&&!a.bondId);assert.ok(card);
 m.bannedChess.push(...m.gd.visibleChess.filter(id=>m.gd.tierOf(id)===card.effect.tier));
 assert.ok(!m.augments.catalog('ally',ps).some(a=>a.id===card.id));
});

test('recast transformation skips every banned operator at the upgraded tier',t=>{
 const {m,ps}=fixture(t);const eligible=tier=>m.gd.visibleChess.filter(id=>{const c=m.data.chess[id];return c.tier===tier&&!c.isGolden&&!c.isHidden&&!c.isDiy&&!c.optionalRecruit&&c.visible!==false&&!m.bannedChess.includes(id);});
 const source=eligible(1)[0],choices=eligible(2);assert.ok(source&&choices.length>1);const allowed=choices.at(-1);m.bannedChess.push(...choices.slice(0,-1));
 const piece=ps.acquireChess(source,{fromPool:false});assert.ok(piece);ps.hand[ps.hand.indexOf(piece)]=null;ps.board.set('9,3',piece);ps.recompute();m.augments.rng=()=>0;
 m.augments.recast(ps);assert.equal(piece.id,allowed);assert.ok(!m.bannedChess.includes(piece.id));
});

test('new CSV augments expose correct rounds, grade, effects and existing icons',()=>{
 const names=['야수의 심장','우리들의 빛','레벨 업','캐서린의 지원 I','캐서린의 지원 II','캐서린의 지원 III','골리앗 I','골리앗 II','골리앗 III'];
 for(const name of names){const cards=[4,7,10].flatMap(r=>createAugmentCatalog(data,r).filter(a=>a.name===name));assert.ok(cards.length,name);for(const card of cards)assert.ok(card.effect.kind);}
 assert.ok(!createAugmentCatalog(data,4).some(a=>a.name==='야수의 심장'));
 assert.ok(!createAugmentCatalog(data,4).some(a=>a.name==='레벨 업'));
 assert.ok(!createAugmentCatalog(data,10).some(a=>a.name==='우리들의 빛'));
 for(const [name,count] of [['실드 II',3],['실드 III',5]])assert.equal(createAugmentCatalog(data,4).find(a=>a.name===name).effect.count,count);
});
for(const [grade,count] of [['silver',2],['gold',4],['prism',7]])test(`Catherine support ${grade}: variant hammers only, correct quantity, stock exempt`,t=>{
 const {m,ps}=fixture(t);const card=createAugmentCatalog(data,4).find(a=>a.effect.kind==='hammerGrant'&&a.grade===grade);
 assert.equal(card.effect.items.length,4);assert.ok(!card.effect.items.includes('chess_item_1_01_e_a'));
 const grants=[];ps.acquireItem=(id,opts)=>{grants.push({id,opts});return {};};m.augments.grant(ps,card);
 assert.equal(grants.length,count);assert.ok(grants.every(g=>card.effect.items.includes(g.id)&&g.opts.fromPool===false));
});
for(const shared of [false,true])test(`Goliath HP applies once, shared=${shared}`,t=>{
 const {m,ps}=fixture(t,{n:4,rules:shared?['sharedHp']:[]});m.startRound(4);const before=shared?m.teamLp:ps.lp;
 const card=createAugmentCatalog(data,4).find(a=>a.name==='골리앗 I');m.augments.grant(ps,card);
 assert.equal(shared?m.teamLp:ps.lp,before+11);if(shared)assert.equal(m.order.reduce((n,p)=>n+p.lp,0),m.teamLp);
});
test('level up grants three funds, waives only next upgrade, hides at max shop level',t=>{
 const {m,ps}=fixture(t);m.round=7;m.phase=PHASE.PREP;m.augments.current={grade:'prism'};
 const card=m.augments.catalog('ally',ps).find(a=>a.name==='레벨 업'),before=ps.funds;assert.ok(card);m.augments.grant(ps,card);
 assert.equal(ps.funds,before+3);assert.equal(ps.shop.upgradePrice,0);const level=ps.shop.level;ps.levelUp();assert.equal(ps.shop.level,level+1);assert.equal(ps.shop.upgradePrice,m.gd.upgradeBase(ps.shop.level));
 ps.shop.level=m.gd.maxShopLevel;assert.ok(!m.augments.catalog('ally',ps).some(a=>a.name==='레벨 업'));
});
test('beast heart sells board/bench operators, destroys equipment and queues twelve ban-safe elites',t=>{
 const {m,ps}=fixture(t);m.round=10;const ids=Object.keys(data.chess).filter(id=>!data.chess[id].isGolden&&!data.chess[id].optionalRecruit&&data.chess[id].visible!==false);
 const p=ps.acquireChess(ids[0],{fromPool:false});const item=ps.newPiece('item','chess_item_1_01_e_a');p.items.push(item);
 const q=ps.acquireChess(ids[1],{fromPool:false});ps._detach(ps.find(q.uid));ps.board.set('0,0',q);
 const banned=ids[2];m.bannedChess.push(banned);const before=ps.funds;const card=createAugmentCatalog(data,10).find(a=>a.name==='야수의 심장');
 const grants=[];ps.acquireChess=(id,opts)=>{grants.push({id,opts});return null;};m.augments.grant(ps,card);
 assert.ok(!ps.find(p.uid));assert.ok(!ps.find(q.uid));assert.ok(!ps.find(item.uid));assert.ok(ps.funds>=before+m.gd.sellPrice(p.id)+m.gd.sellPrice(q.id));
 const queued=m.augments.pending.get(ps.playerId);assert.equal(queued.length,12);assert.ok(queued.every(g=>data.chess[g.id].isGolden&&m.gd.baseIdOf(g.id)!==banned));assert.ok(grants.every(g=>g.opts.fromPool===false));
});
test('our light repeats the same gain trait as Suzuran and stacks with her strategy',t=>{
 const {m,ps}=fixture(t);const card=createAugmentCatalog(data,4).find(a=>a.name==='우리들의 빛');m.augments.allies.set(ps.playerId,[card]);
 const candidate=Object.entries(data.chess).find(([,c])=>!c.isGolden&&!c.optionalRecruit&&c.garrisonIds?.some(id=>data.garrisons[id]?.eventType==='SERVER_GAIN'));assert.ok(candidate);
 const p=ps.newPiece('chess',candidate[0]);ps.board.set('0,0',p);let calls=0;const orig=m.dispatcher.triggerGarrisons.bind(m.dispatcher);m.dispatcher.triggerGarrisons=(...args)=>{calls++;return orig(...args);};
 ps.bandId='band_lisa';m.startRound(5);assert.equal(calls,2);
});

test('Du Yaoye shop guarantee still finds allowed Yan operators when Yan is banned, without granting banned operators',t=>{
 const {m,ps}=fixture(t);m.round=3;ps.bandId='band_duyaoy';ps.shop.level=6;ps.round.refreshes=1;
 if(!m.disabledBonds.includes('yanShip'))m.disabledBonds.push('yanShip');assert.equal(m.bondLive('yanShip'),false);
 const allowed=Object.keys(data.chess).filter(id=>{const c=data.chess[id];return !c.isGolden&&!c.optionalRecruit&&c.bonds?.includes('yanShip')&&m.pool.has(id)&&!m.bannedChess.includes(id);});assert.ok(allowed.length>=2);
 m.bannedChess.push(allowed[0]);const other=Object.keys(data.chess).find(id=>{const c=data.chess[id];return !c.isGolden&&!c.optionalRecruit&&!c.bonds?.includes('yanShip')&&m.pool.has(id)&&!m.bannedChess.includes(id);});
 for(const refresh of [1,2]){ps.round.refreshes=refresh;ps.shop.slots=Array.from({length:4},()=>({kind:'chess',id:other,basePrice:1,sold:false}));m.dispatch(ps,'onRefresh',{free:false});assert.ok(ps.shop.slots.some(s=>data.chess[s.id].bonds.includes('yanShip')));assert.ok(ps.shop.slots.every(s=>!m.bannedChess.includes(s.id)));}
 ps.round.refreshes=3;ps.shop.slots=Array.from({length:4},()=>({kind:'chess',id:other,basePrice:1,sold:false}));m.dispatch(ps,'onRefresh',{free:false});assert.ok(ps.shop.slots.every(s=>s.id===other));
 m.bannedChess.push(...allowed.slice(1));ps.round.refreshes=1;m.dispatch(ps,'onRefresh',{free:false});assert.ok(ps.shop.slots.every(s=>s.id===other),'no eligible Yan: keep the normal shop instead of showing banned operators');
});

test('new true-damage family is mutually exclusive across all grades',t=>{
 const {m,ps}=fixture(t);m.round=4;
 const chosen=createAugmentCatalog(data,4).find(c=>c.name==='문명의 존속 I');
 assert.ok(chosen);m.augments.allies.set(ps.playerId,[chosen]);
 for(const grade of ['silver','gold','prism']){m.augments.current={grade};assert.ok(m.augments.catalog('ally',ps).every(c=>c.effect.kind!=='trueDamage'));}
});
test('beast heart grants twelve promoted operators',t=>{
 const {m,ps}=fixture(t);const card=createAugmentCatalog(data,10).find(c=>c.name==='야수의 심장');
 assert.equal(card.effect.count,12);const before=ps.round.gainedChess;m.augments.grant(ps,card);assert.equal(ps.round.gainedChess-before,12);
});

test('strict majority shortens only ordinary votes to 10 seconds without extending a shorter deadline',t=>{
 for(const method of [1,2]){
  const {m,sched}=fixture(t,{n:4,ruleValues:{augmentEnemyVote:method}});m.round=4;m.augments.enter();m.augments.enterEnemy();const a=m.augments,s=a.current;
  for(const ps of m.order.slice(0,2))a.vote(ps,{idx:0,cardId:s.boss.cards[0].id});assert.equal(m.deadline-sched.now(),120000);
  a.vote(m.order[2],{idx:0,cardId:s.boss.cards[0].id});assert.equal(m.deadline-sched.now(),method===1?10000:120000);
  sched.advance(5000);a.shortenVoteDeadline();assert.equal(m.deadline-sched.now(),method===1?5000:115000);
 }
});
test('weighted votes use all received votes, include reroll and give zero votes zero probability',t=>{
 const {m}=fixture(t,{n:4,ruleValues:{augmentEnemyVote:2}});m.round=4;m.augments.enter();m.augments.enterEnemy();const a=m.augments,s=a.current;
 for(const [pid,idx]of [['p0',0],['p1',0],['p2',0],['p3',1]])s.votes.set(pid,idx);
 for(const [roll,expected]of [[0,0],[.749,0],[.75,1],[.999,1]]){delete s.voteResultIdx;a.rng=()=>roll;a.resolveVote({defer:true});assert.equal(s.voteResultIdx,expected);}
 delete s.voteResultIdx;s.votes=new Map([['p0',0],['p1',0],['p2',3],['p3',3]]);a.rng=()=>.75;a.resolveVote({defer:true});assert.equal(s.voteResultIdx,3);a.resolveVote();assert.equal(s.rerollsLeft,0);assert.equal(s.votes.size,0);assert.equal(s.settling,false);
});

test('weighted timeout keeps actual votes and does not create weights for abstentions',t=>{
 const {m}=fixture(t,{n:4,ruleValues:{augmentEnemyVote:2}});m.round=4;m.augments.enter();m.augments.enterEnemy();const a=m.augments,s=a.current;
 a.vote(m.order[0],{idx:1,cardId:s.boss.cards[1].id});a.timeout();assert.equal(s.votes.size,1);assert.equal(s.voteResultIdx,1);
});

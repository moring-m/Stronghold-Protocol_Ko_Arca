import{test}from 'node:test';import assert from 'node:assert/strict';import{DATA,makeMatch}from './match/harness.js';
import{applyCustomExtensions,normalizeCustomExtensions,extensionSelectionShape,customExtensionCatalog,recordCustomExtensions}from '../shared/customExtensions.js';
import{GameData}from '../server/match/gamedata.js';import{RANDOM_BAND_ID}from '../shared/randomBand.js';import{LAB_DUMMY_BOSS}from '../shared/laboratoryDummy.js';
import{makeBattle,chessRec}from './helpers/battleHarness.js';import{botPickBand}from '../server/match/bot.js';
const selection=ruleValues=>({bonds:[],stages:[],ruleValues});
test('custom stock supports 1–8 player scaling against four-player copies and migrates legacy unlimited stock',()=>{
 const base=new GameData(DATA,'mode_multi_normal');const id=base.visibleChess.find(id=>!base.chess(id).optionalRecruit&&!base.chess(id).isDiy),item='chess_item_2_06_e_a';
 for(let n=1;n<=8;n++){const s=selection({stockPlayers:n});assert.ok(extensionSelectionShape(s));const gd=new GameData(applyCustomExtensions(DATA,s),'mode_multi_normal');assert.equal(gd.poolCopies(id),Math.ceil(base.poolCopies(id)*n/4));assert.equal(gd.itemPoolCopies(item),Math.ceil(base.itemPoolCopies(item)*n/4));}
 const old=normalizeCustomExtensions({bonds:[],stages:[],rules:['unlimitedStock']},DATA);assert.equal(old.ruleValues.stockPlayers,-1);assert.ok(!old.rules?.includes('unlimitedStock'));
 const gd=new GameData(applyCustomExtensions(DATA,old),'mode_multi_normal');assert.equal(gd.itemPoolCopies(item),null);assert.equal(gd.config.customRules.unlimitedStock,true);
});
test('scarecrow rule replaces normal and hidden bosses and preserves their stationary dummy definitions',t=>{
 const h=makeMatch({mode:'coop8',humans:8,customExtensions:{bonds:[],stages:[],rules:['scarecrow']}});t.after(()=>h.m.dispose());
 assert.equal(h.m.bossId,LAB_DUMMY_BOSS);assert.equal(h.m.hiddenBossId,LAB_DUMMY_BOSS);
 for(const mode of Object.values(h.m.data.config.modes)){assert.deepEqual(mode.bossWeights,{[LAB_DUMMY_BOSS]:1});assert.deepEqual(mode.hiddenBossWeights,{[LAB_DUMMY_BOSS]:1});}
 const boss=h.m.gd.boss(LAB_DUMMY_BOSS),enemy=h.m.data.enemies[boss.enemyKey];assert.ok(enemy.laboratoryDummy);assert.equal(enemy.stats.moveSpeed,0);assert.deepEqual(enemy.skills,[]);
});
test('ally stat and SP custom ratios apply to combat and default 100% preserves base behavior',()=>{
 const rec=chessRec({id:'custom-op',stats:{maxHp:1000,atk:100,def:200,res:10,aspd:100,bat:1,blockCnt:2,spRecovery:1},skill:{kind:'duration',spType:'time',spCost:20,initSp:2,duration:5,trigger:{rule:'MANUAL'}}});
 const raw={...DATA,chess:{...DATA.chess,'custom-op':rec}};
 for(const custom of [false,true]){const values=custom?{allyHp:200,allyAtk:150,allyDef:50,allyRes:200,allyAspd:150,allySpCost:150,allyInitSp:200,allySpRecovery:200}:{};
 const data=applyCustomExtensions(raw,selection(values)),h=makeBattle({data,units:[{chessId:'custom-op',row:10,col:3}],autoFinish:false});h.step();const u=h.unit('custom-op');
 assert.equal(u.s.maxHp,custom?2000:1000);assert.equal(u.s.atk,custom?150:100);assert.equal(u.s.def,custom?100:200);assert.equal(u.s.res,custom?20:10);assert.equal(u.s.aspd,custom?150:100);assert.equal(u.skill.spCost,custom?30:20);assert.equal(u.skill.initSp,custom?4:2);assert.equal(u.s.spRecovery,custom?2:1);
 assert.equal(h.b.errorCount,0);}
 const saved=recordCustomExtensions(selection({allyAtk:150,allySpCost:150}));assert.deepEqual(saved.ruleValues,{allyAtk:150,allySpCost:150});
});
test('all humans can select random, which resolves in order without duplicates or choosing a fixed pick',t=>{
 const h=makeMatch({mode:'coop8',humans:8});t.after(()=>h.m.dispose());const m=h.m;m.phase='INFO_CHECK';m.enterBandDraft();assert.equal(m.gd.bandIds()[0],RANDOM_BAND_ID);const fixed=m.gd.bandIds().find(id=>id!==RANDOM_BAND_ID);
 let i=0;while(m.draftTurn()){const ps=m.players.get(m.draftTurn());assert.ok(m.pickBand(ps,i++===0?fixed:RANDOM_BAND_ID).ok);}
 m.finishBandDraft(false);assert.ok(m.order.every(p=>p.bandId!==RANDOM_BAND_ID));assert.equal(new Set(m.order.map(p=>p.bandId)).size,8);assert.equal(m.order.filter(p=>p.bandId===fixed).length,1);
 for(const p of m.order)assert.equal(p.lp,m.gd.startLp(p.bandId));assert.equal(m.errorCount,0);
});
test('random is AI-ineligible and cannot be disabled, but duplicate-enabled random assignments may repeat',t=>{
 const catalog=customExtensionCatalog({...DATA,bands:{...DATA.bands,[RANDOM_BAND_ID]:{}}});assert.ok(!catalog.disabledBands.some(x=>x.id===RANDOM_BAND_ID));
 const real=Object.keys(DATA.bands)[0],raw={...DATA,bands:{[real]:DATA.bands[real]}};
 const h=makeMatch({data:raw,mode:'coop8',humans:8,customExtensions:{bonds:[],stages:[],rules:['duplicateBands'],disabledBands:[RANDOM_BAND_ID]}});t.after(()=>h.m.dispose());const m=h.m;assert.ok(m.gd.bandAllowed(RANDOM_BAND_ID));
 for(let i=0;i<50;i++)assert.equal(botPickBand(m,m.order[0]),real);
 m.phase='INFO_CHECK';m.enterBandDraft();while(m.draftTurn())assert.ok(m.pickBand(m.players.get(m.draftTurn()),RANDOM_BAND_ID).ok);
 m.finishBandDraft(false);assert.ok(m.order.every(p=>p.bandId===real));assert.equal(m.errorCount,0);
});

test('scarecrow boss and hidden waves contain only the laboratory Jesselton, which can be attacked and never attacks back',async()=>{
 const{buildBossWave}=await import('../server/match/waves.js'),{createRng}=await import('../server/sim/rng.js');
 const{buildBattleSpec,createBattleFromSpec}=await import('../server/sim/spec.js');const data=applyCustomExtensions(DATA,{bonds:[],stages:[],rules:['scarecrow']});const gd=new GameData(data,'mode_multi_normal');
 for(const round of [gd.bossRound,gd.hiddenRound]){
  const wave=buildBossWave(gd,createRng(6),null,round,{bossId:LAB_DUMMY_BOSS,solo:false});assert.equal(wave.spawns.length,1);assert.equal(wave.spawns[0].enemyKey,'enemy_laboratory_jesselton');
  const b=createBattleFromSpec(buildBattleSpec({kind:round===gd.bossRound?'boss':'hidden',stageId:'act1autochess_m01',spawns:wave.spawns,routes:wave.routes,timeLimit:30,players:[{playerId:'p',units:[{chessId:'chess_char_1_01_a',uid:1,row:10,col:9}],bonds:{}}]}),data,{quiet:true});
  b.step();const boss=b.enemies[0];assert.ok(boss.profile.noAttack);assert.equal(boss.def.raw.modelScale,3*DATA.enemies.enemy_1516_jakill.modelScale);assert.deepEqual(boss.hitArea,DATA.enemies.enemy_9013_acstmk.hitArea);const hp=boss.hp,at=[boss.x,boss.y];
  for(let i=0;i<300&&!b.finished;i++)b.step();assert.ok(boss.hp<hp,'allies can damage the dummy');assert.deepEqual([boss.x,boss.y],at);assert.equal(b.errorCount,0);assert.ok(!b.drainEvents().some(e=>e[0]==='atk'&&e[1]===boss.id));
 }
});

test('random strategy is resolved before game-start Pith grants for all eight humans',t=>{
 const data={...DATA,bands:{band_pith:DATA.bands.band_pith}};
 const h=makeMatch({data,mode:'coop8',humans:8,customExtensions:{bonds:[],stages:[],rules:['duplicateBands']}}).start();t.after(()=>h.m.dispose());h.toPrep(1,{band:RANDOM_BAND_ID});
 assert.ok(h.m.order.every(p=>p.bandId==='band_pith'));assert.ok(h.m.order.every(p=>p._chessLocations().length>0));assert.equal(h.m.errorCount,0);
});
test('ally SP rules never modify enemy skills',async()=>{
 const{SkillRuntime}=await import('../server/sim/skills.js'),{enemyRec}=await import('./helpers/battleHarness.js');
 const data=applyCustomExtensions(DATA,selection({allySpCost:200,allyInitSp:300}));const h=makeBattle({data,defs:{enemies:{testenemy:enemyRec({key:'testenemy',hp:100})}},autoFinish:false});const e=h.spawn('testenemy');
 const sk=new SkillRuntime(h.b,e,{spCost:20,initSp:2},{kind:'duration',spCost:20,initSp:2});assert.equal(sk.spCost,20);assert.equal(sk.initSp,2);
});

test('eight real clients complete random strategy, modified allied stats and both scarecrow boss rounds',t=>{
 const h=makeMatch({mode:'coop8',difficulty:'NORMAL',humans:8,clientCombat:true,verify:'all',captureFrames:false,seed:8211,customExtensions:{bonds:[],stages:[],rules:['scarecrow'],ruleValues:{stockPlayers:8,allyHp:200,allyAtk:200,allyAspd:150,allySpCost:80}}});
 t.after(()=>{h.clients.closeAll();h.m.dispose();});h.start();h.toPrep(1,{band:RANDOM_BAND_ID});assert.equal(new Set(h.m.order.map(p=>p.bandId)).size,8);for(const p of h.m.order)p.lp=200;h.autoHumans();
 h.onBroadcast.push(()=>{if(h.m.phase==='PREP'&&h.m.round===h.m.gd.bossRound)for(const p of h.m.order){p.bondCountBonus.yanShip=3;p.layers.yanShip=601;p.recompute();}});
 h.runToEnd();assert.ok(h.ended);assert.equal(h.ended.hiddenReached,true);assert.equal(h.m.errorCount,0);assert.deepEqual(h.logs.error,[]);assert.deepEqual(h.logs.warn,[]);
 const fields=[...h.clients.values()].flatMap(c=>[...c.battles.values()]);for(const kind of ['boss','hidden']){const group=fields.filter(b=>b.spec.kind===kind);assert.ok(group.length>=4);for(const e of group){assert.equal(e.spec.spawns.length,1);assert.equal(e.spec.spawns[0].enemyKey,'enemy_laboratory_jesselton');assert.equal(e.battle.errorCount,0);}}
});

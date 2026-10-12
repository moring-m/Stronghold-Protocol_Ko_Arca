import {RANDOM_BAND_ID} from '../../shared/randomBand.js';
import {withLaboratoryDummy,LAB_DUMMY_BOSS,LAB_DUMMY_ENEMY,LAB_DUMMY_FIELDS,validDummyStats} from '../../shared/laboratoryDummy.js';
import {bossPoolHp} from './finalAssault.js';
// Local-only single-round mode. This class is never constructed by the lobby.
import {laboratoryEquipment} from '../../shared/search.js';
import {GameData} from './gamedata.js';
import { Match } from './Match.js';
import { SharedPool } from './pool.js';
import { PHASE, ERR, BOND_LAYER_CAP } from '../../shared/constants.js';

export class LaboratoryMatch extends Match {
  constructor(opts) {
    super({ ...opts, data:withLaboratoryDummy(opts.data), mode: 'solo', difficulty: opts.difficulty || 'NORMAL', clientCombat: true, verify: 'off' });
    this.gd.config.customRules={...this.gd.config.customRules,deployCap:15};
    if(this.customExtensions.ruleValues)delete this.customExtensions.ruleValues.deployCap;
    const setup = {...opts.laboratory};
    if(this.gd.config.customRules?.scarecrow)setup.bossId=LAB_DUMMY_BOSS;
    if(setup.bandId===RANDOM_BAND_ID)setup.bandId=this.rngDraft.pick(this.gd.bandIds().filter(id=>id!==RANDOM_BAND_ID));
    if (!setup || !this.gd.stage(setup.stageId) || !this.gd.boss(setup.bossId) || !this.gd.band(setup.bandId)
      || !['boss', 'hidden'].includes(setup.kind) || (setup.bossId!==LAB_DUMMY_BOSS && !!this.gd.boss(setup.bossId).hidden !== (setup.kind === 'hidden'))) {
      throw new TypeError('실험실 시작 설정이 올바르지 않습니다.');
    }
    const playerCount=setup.players??1;
    if(!Number.isInteger(playerCount)||playerCount<1||playerCount>4)throw new TypeError('실험실 인원 기준이 올바르지 않습니다.');
    this.laboratory = { ...setup, players:playerCount };
    const referenceModeId=playerCount>1?this.modeId.replace('_single_','_multi_'):this.modeId;
    if(playerCount>1){
      const reference=new GameData(this.data,referenceModeId);
      this.gd.mode={...reference.mode};
      this.gd.enemyScale=round=>reference.enemyScale(round);
      this.gd.bossPoolShare=()=>reference.bossPoolShare(playerCount);
    }
    if(setup.bossId===LAB_DUMMY_BOSS){
      const armor=this.gd.enemy('enemy_9013_acstmk');
      this.dummyDefaults=Object.fromEntries(LAB_DUMMY_FIELDS.map(f=>[f.id,f.id==='maxHp'?bossPoolHp(this.gd,'boss_1',playerCount):Number(armor?.stats?.[f.id])||0]));
      this.laboratory={...this.laboratory,dummyStats:{...this.dummyDefaults}};
      this.setDummyStats(validDummyStats(setup.dummyStats)?setup.dummyStats:this.dummyDefaults);
      this.gd.bossLevelTime=()=>0;
    }
    // Training also permits hidden leaders at Standard difficulty and leaders outside the random pool.
    this.gd.mode = { ...this.gd.mode, hiddenRound: this.gd.hiddenRound || this.gd.bossRound + 1 };
    const targetRound = setup.kind === 'hidden' ? this.gd.hiddenRound : this.gd.bossRound;
    const boss = this.gd.boss(setup.bossId);
    const template = boss.templates?.[referenceModeId]?.template || boss.templates?.mode_single_normal?.template;
    if (!template || !this.gd.wave(template)) throw new TypeError('선택한 보스의 전투 데이터가 없습니다.');
    const originalRoundCfg = this.gd.roundCfg.bind(this.gd);
    this.gd.roundCfg = r => r === targetRound ? { ...(originalRoundCfg(r) || {}), bossTemplates: { [setup.bossId]: template } } : originalRoundCfg(r);
    this.stageId = setup.stageId;
    this.stage = this.gd.stage(setup.stageId);
    this.bossId = setup.kind === 'boss' ? setup.bossId : null;
    this.hiddenBossId = setup.kind === 'hidden' ? setup.bossId : null;
    this.disabledBonds = [];
    this.staticInactiveBonds = [];
    this.bannedChess = [];
    this.gd.modeInactiveBonds.clear();
    this.pool = new SharedPool(this.gd, { banned: [] });
    this.itemPool.canGain = () => true;
    for (const ps of this.order) {
      Object.defineProperty(ps,'deployCap',{get:()=>15});
      ps.bandId = setup.bandId;
      ps.lp = this.gd.startLp(setup.bandId);
      ps.shop.level = this.gd.maxShopLevel;
    }
  }

  setDummyStats(stats){
    if(this.laboratory.bossId!==LAB_DUMMY_BOSS||!validDummyStats(stats))return {error:ERR.BAD_TARGET};
    const value=Object.fromEntries(LAB_DUMMY_FIELDS.map(f=>[f.id,stats[f.id]]));
    this.laboratory={...this.laboratory,dummyStats:value};
    this.gd.bossPoolShare=()=>1;this.gd.bossHpMul=()=>1;
    this.data.bosses={...this.data.bosses,[LAB_DUMMY_BOSS]:{...this.gd.boss(LAB_DUMMY_BOSS),bloodPoint:{...this.gd.boss(LAB_DUMMY_BOSS).bloodPoint,[this.gd.difficulty]:value.maxHp}}};

    return {ok:true};
  }
  _planBossWaves(){
    super._planBossWaves();
    if(this.laboratory?.bossId===LAB_DUMMY_BOSS)for(const group of this.bossWaves){group.wave={...group.wave,spawns:this._sanitizeSpawns(group.wave.spawns),entries:{ground:null,fly:null},actions:[]};}
  }
  _sanitizeSpawns(spawns){
    const list=super._sanitizeSpawns(spawns);
    if(this.laboratory?.bossId!==LAB_DUMMY_BOSS)return list;
    const boss=list.find(s=>s.tag==='boss'||s.enemyKey==='enemy_9013_acstmk')||{time:0,pos:[3,10],tag:'boss'};
    return [{...boss,enemyKey:LAB_DUMMY_ENEMY,count:1,tag:'boss',mods:null}];
  }
  newBattle(opts){return super.newBattle(this.dummyBattleOptions(opts));}
  _ccField(opts){if(opts?.opts)opts={...opts,opts:this.dummyBattleOptions(opts.opts)};return super._ccField(opts);}
  dummyBattleOptions(opts){
    if(this.laboratory?.bossId!==LAB_DUMMY_BOSS)return opts;
    return {...opts,enemyOverrides:{...opts.enemyOverrides,[LAB_DUMMY_ENEMY]:{stats:{...this.laboratory.dummyStats,moveSpeed:0}}},flags:{...opts.flags,enemyScale:{atk:1,hp:1,def:1,res:1}}};
  }

  start() {
    if (this.disposed || this.ended || this.phase !== PHASE.LOBBY) return;
    // Run the real first-round hooks once: starting grants (e.g. Pith) must not disappear when jumping to R14/R15.
    this.round = 1;
    for (const ps of this.order) {
      ps.startRound(1);
      this.dispatch(ps, 'onRoundStart', { round: 1 });
      ps.recompute();
    }
    this.hiddenReached = this.laboratory.kind === 'hidden';
    this.startRound(this.hiddenReached ? this.gd.hiddenRound : this.gd.bossRound);
    this.flush(true);
  }
  afterRoundStart() { this.enterPrep(); }
  // Economic and acquisition triggers do not run in the sandbox; combat/stat hooks remain active.
  dispatch(ps, hook, ev = {}, opts = {}) {
    if (['onGain','onSold','onMerge','onBuy','onSpend','onRefresh','onPrice','onLevelUp','onIncome','onLayers'].includes(hook)) return ev;
    return super.dispatch(ps, hook, ev, opts);
  }

  setLoadout(playerId, entries, ops = undefined) {
    if (this.phase !== PHASE.PREP) return super.setLoadout(playerId, entries, ops);
    const ps = this.players.get(playerId);
    if (!ps || this.disposed || this.ended || ps.ready) return { error: ERR.WRONG_PHASE };
    if (!ps.setLoadout(entries, ops)) return { error: ERR.BAD_TARGET };
    ps.recompute();
    this.markPrivate(ps);
    this.markPublic();
    this.flush(true);
    return { ok: true };
  }

  saveSetup(playerId) {
    const ps=this.players.get(playerId);
    if(!ps||this.phase!==PHASE.PREP||ps.ready)throw new Error('전투 준비 중에만 저장할 수 있습니다.');
    return this._captureSetup(ps);
  }
  _captureSetup(ps) {
    return structuredClone({kind:'stronghold.laboratory',v:2,stageId:this.stageId,board:[...ps.board].filter(([,p])=>p.kind!=='token').map(([key,piece])=>({key,piece})),hand:ps.hand.map(p=>p?.kind==='token'?null:p),temp:ps.temp.map(p=>p?.kind==='token'?null:p)});
  }
  loadSetup(playerId,saved) {
    const ps=this.players.get(playerId);
    if(!ps||this.phase!==PHASE.PREP||ps.ready)return {error:ERR.WRONG_PHASE};
    if(saved?.kind!=='stronghold.laboratory'||![1,2].includes(saved.v)||!Array.isArray(saved.board)||!Array.isArray(saved.hand)||!Array.isArray(saved.temp))return {error:ERR.BAD_TARGET};
    const sameMap=saved.stageId===this.stageId,board=saved.board,hand=saved.hand,temp=saved.temp;
    if(board.some(x=>!x||typeof x!=='object'||!x.piece)||new Set(board.map(x=>x.key)).size!==board.length)return {error:ERR.BAD_TARGET};
    const selectable=p=>p?.kind!=='token'&&(p?.kind!=='chess'||ps.canRecruit(p.id))&&(p?.kind!=='item'||laboratoryEquipment(this.gd.item(p.id)));
    const all=[...board.map(x=>x.piece),...hand,...temp].filter(Boolean).filter(selectable);
    if(all.length>64||saved.hand.length>ps.hand.length||saved.temp.length>ps.temp.length)return {error:ERR.BAD_TARGET};
    const valid=p=>p&&['chess','item','token'].includes(p.kind)&&(p.kind==='chess'?this.gd.chess(p.id):p.kind==='item'?this.gd.item(p.id):this.gd.token(p.id))&&(!p.items||Array.isArray(p.items)&&p.items.length<=this.gd.equipPerChess&&p.items.every(x=>x.kind==='item'&&this.gd.item(x.id)));
    if(!all.every(valid)||new Set(all.map(p=>p.uid)).size!==all.length||board.some(x=>!/^\d+,\d+$/.test(x.key)||x.key.split(',').some((v,i)=>Number(v)>=(i===0?this.stage.rows.length:this.stage.rows[0].length))))return {error:ERR.BAD_TARGET};
    const bench=all.filter(p=>p.kind!=='token');
    if(!sameMap&&bench.length>ps.hand.length+ps.temp.length)return {error:ERR.HAND_FULL};
    const ids=new Map(),copy=p=>{if(!p)return null;const next=ps.newPiece(p.kind,p.id,{dir:p.dir,meta:structuredClone(p.meta||{}),count:p.count});ids.set(p.uid,next.uid);if(p.items)next.items=p.items.filter(x=>this.gd.item(x.id)?.trapId!=='trap_1070_acarm070').map(x=>ps.newPiece('item',x.id));if(p.kind==='token')next.ownerUid=p.ownerUid;return next;};
    const pieces=new Map(all.map(p=>[p,copy(p)]));
    for(const p of pieces.values())if(p.kind==='token')p.ownerUid=ids.get(p.ownerUid);
    ps.board.clear();ps.hand.fill(null);ps.temp.fill(null);ps._tempDue.clear();
    if(sameMap){for(const x of board)if(pieces.has(x.piece))ps.board.set(x.key,pieces.get(x.piece));hand.forEach((p,i)=>ps.hand[i]=pieces.get(p)||null);temp.forEach((p,i)=>ps.temp[i]=pieces.get(p)||null);}
    else bench.forEach((p,i)=>{if(i<ps.hand.length)ps.hand[i]=pieces.get(p);else ps.temp[i-ps.hand.length]=pieces.get(p);});
    ps.recompute();this.markPrivate(ps);this.markPublic();this.flush(true);return {ok:true};
  }

  endPrep() {
    if(this.phase!==PHASE.PREP)return;
    const ps=this.order[0];this.preparationSnapshot={pieces:this._captureSetup(ps),layers:structuredClone(ps.layers)};
    super.endPrep();
  }

  publicView() { return { ...super.publicView(), laboratory: {...this.laboratory,dummyDefaults:this.dummyDefaults} }; }
  _applyOvertime(gt){if(this.laboratory.bossId!==LAB_DUMMY_BOSS)super._applyOvertime(gt); }

  handle(playerId, msg) {
    if (['g.buy','g.refresh','g.freeze','g.levelUp'].includes(msg?.t)) return { error: ERR.WRONG_PHASE };
    if (!msg?.t?.startsWith('g.lab')) return super.handle(playerId, msg);
    const ps = this.players.get(playerId);
    if(msg.t==='g.labDummyStats'&&ps&&!this.disposed&&!this.ended&&[PHASE.FINAL_ASSAULT,PHASE.HIDDEN_CORE].includes(this.phase)){const res=this.setDummyStats(msg.reset?this.dummyDefaults:msg.stats);if(!res.error){this.markPublic();this.flush(true);}return res;}
    if (!ps || this.disposed || this.ended || this.phase !== PHASE.PREP || ps.ready) return { error: ERR.WRONG_PHASE };
    let result;
    if (msg.t === 'g.labStack') {
      if (!this.gd.bond(msg.bondId) || this.gd.bond(msg.bondId).noStack || !Number.isInteger(msg.layers) || msg.layers < 0 || msg.layers > (this.gd.config.customRules?.unlimitedLayers?Number.MAX_SAFE_INTEGER:BOND_LAYER_CAP)) return { error: ERR.BAD_TARGET };
      ps.layers[msg.bondId] = msg.layers;
      ps.recompute();
      result = { ok: true };
    } else if(msg.t==='g.labDummyStats'){
      result=this.setDummyStats(msg.reset?this.dummyDefaults:msg.stats);
      if(result.error)return result;
    } else if (msg.t === 'g.labGain') {
      const rec = msg.kind === 'chess' ? this.gd.chess(msg.id) : msg.kind === 'item' ? this.gd.item(msg.id) : null;
      if (!rec || (msg.kind === 'chess' && (!rec.visible || rec.isHidden || rec.isGolden || !ps.canRecruit(msg.id))) || (msg.kind === 'item' && (!laboratoryEquipment(rec) || rec.isGolden))) return { error: ERR.BAD_TARGET };
      const merge=msg.kind==='chess'?ps.completesChessMerge(msg.id):ps.completesItemMerge(msg.id);
      if(ps.hand.every(Boolean)&&!merge)return {error:ERR.HAND_FULL};
      const piece = msg.kind === 'chess' ? ps.acquireChess(msg.id, { fromPool: false, source: 'buy' }) : ps.acquireItem(msg.id, {source:'buy'});
      result = piece ? ps.completePurchase(piece,{kind:msg.kind,id:msg.id,basePrice:0,price:0},0) : { error: ERR.HAND_FULL };
    } else return { error: ERR.BAD_MSG };
    this.markPublic();
    this.markPrivate(ps);
    this.flush(true);
    return result;
  }
  _finishFinal(hidden, resultOf) {
    // Preserve the normal settlement/bookkeeping, but never unlock another battle.
    this.hiddenBossId = hidden ? this.laboratory.bossId : null;
    super._finishFinal(hidden, resultOf);
  }
  finish(outcome) {
    if (this.laboratory.kind === 'hidden' && outcome.reason === 'victory') {
      outcome = { ...outcome, victory: !!outcome.hiddenCleared, reason: outcome.hiddenCleared ? 'victory' : 'defeat' };
    }
    super.finish(outcome);
  }
}

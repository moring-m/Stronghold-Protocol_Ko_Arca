// Local-only single-round mode. This class is never constructed by the lobby.
import {laboratoryEquipment} from '../../shared/search.js';
import {GameData} from './gamedata.js';
import { Match } from './Match.js';
import { SharedPool } from './pool.js';
import { PHASE, ERR, BOND_LAYER_CAP } from '../../shared/constants.js';

export class LaboratoryMatch extends Match {
  constructor(opts) {
    super({ ...opts, mode: 'solo', difficulty: opts.difficulty || 'NORMAL', clientCombat: true, verify: 'off' });
    const setup = opts.laboratory;
    if (!setup || !this.gd.stage(setup.stageId) || !this.gd.boss(setup.bossId) || !this.gd.band(setup.bandId)
      || !['boss', 'hidden'].includes(setup.kind) || !!this.gd.boss(setup.bossId).hidden !== (setup.kind === 'hidden')) {
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
      ps.bandId = setup.bandId;
      ps.lp = this.gd.startLp(setup.bandId);
      ps.shop.level = this.gd.maxShopLevel;
    }
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

  publicView() { return { ...super.publicView(), laboratory: this.laboratory }; }

  handle(playerId, msg) {
    if (['g.buy','g.refresh','g.freeze','g.levelUp'].includes(msg?.t)) return { error: ERR.WRONG_PHASE };
    if (!msg?.t?.startsWith('g.lab')) return super.handle(playerId, msg);
    const ps = this.players.get(playerId);
    if (!ps || this.disposed || this.ended || this.phase !== PHASE.PREP || ps.ready) return { error: ERR.WRONG_PHASE };
    let result;
    if (msg.t === 'g.labStack') {
      if (!this.gd.bond(msg.bondId) || this.gd.bond(msg.bondId).noStack || !Number.isInteger(msg.layers) || msg.layers < 0 || msg.layers > BOND_LAYER_CAP) return { error: ERR.BAD_TARGET };
      ps.layers[msg.bondId] = msg.layers;
      ps.recompute();
      result = { ok: true };
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

import {withLaboratoryDummy,LAB_DUMMY_ENEMY} from '../../shared/laboratoryDummy.js';
import { net, NetError } from './net.js';
import { store, emptyMatch } from './store.js';
import { data } from './data.js';
import { GAME_FILES } from './ui/gameComponents.js';
import { loadoutStore } from './ui/loadoutSync.js';
import { customExtensionCatalog, normalizeCustomExtensions, applyCustomExtensions } from '../../shared/customExtensions.js';
import { attachAttackTimings } from '../../shared/attackTiming.js';
import { validateC2S } from '../../shared/protocol.js';

let active = null;
export function isLaboratory() { return !!active; }
export function stopLaboratory({reconnect=true}={}) {
  if (!active) return;
  const previous = active.previous;
  active.match.dispose();
  active = null;
  net.localSession = null;
  store.set({ me: previous.me, room: null, match: emptyMatch(), chat: [], ticker: [], emotes: [], clock: previous.clock });
  if(reconnect)net.connect();
}

export async function startLaboratory(setup) {
  if (active || store.get().room?.inMatch) throw new Error('진행 중인 시뮬레이션을 먼저 종료해주세요.');
  // Only static files are fetched. No room, match, or combat requests are sent to a server.
  await Promise.all([...GAME_FILES, 'waves', 'backups'].map(k => data.load(k)));
  let raw = Object.fromEntries([...GAME_FILES, 'waves', 'backups'].map(k => [k, data.get(k)]));
  if (['config','chess','items','bands','stages','bosses','waves'].some(k => !raw[k])) throw new Error('실험실에 필요한 게임 데이터를 불러오지 못했습니다.');
  raw=withLaboratoryDummy(raw);
  const { LaboratoryMatch } = await import('/match/LaboratoryMatch.js');
  const { setSimData } = await import('/sim/simdata.js');
  for (const key of ['chess','enemies','tokens','backups']) if (raw[key]) raw[key]=structuredClone(raw[key]);
  attachAttackTimings(raw, raw.assets);
  if (raw.backups?.units) attachAttackTimings({chess:raw.backups.units},raw.assets);
  const support = await import('/sim/content/support/index.js');
  const previous = { me: store.get().me, clock: store.get().clock };
  const playerId = previous.me.playerId || `lab_${crypto.randomUUID()}`;
  const name = previous.me.name || '박사';
  const lo = loadoutStore.get();
  const catalog = customExtensionCatalog(raw);
  const customExtensions = normalizeCustomExtensions(setup.customExtensions===undefined?{bonds:catalog.bonds.map(x=>x.id),stages:catalog.stages.map(x=>x.id)}:{bonds:setup.customExtensions.bonds||[],stages:setup.customExtensions.stages||[],rules:setup.customExtensions.rules||[],commonBands:setup.customExtensions.commonBands||[],ruleValues:setup.customExtensions.ruleValues},raw);
  const configured=applyCustomExtensions(raw,customExtensions);
  configured.config.customRules={...configured.config.customRules,deployCap:15};
  setSimData(configured);
  support.setGameData(configured);
  const push = msg => { net._emit(msg.t, msg); net._emit('*', msg); };
  const match = new LaboratoryMatch({
    laboratory: setup, difficulty: setup.difficulty, roomCode: 'LAB', seed: crypto.getRandomValues(new Uint32Array(1))[0], data: raw,
    customExtensions, seats: [{ seat: 0, playerId, name, isBot: false, connected: true, loadout: lo.entries, ops: lo.ops }],
    send: (_, msg) => { push(msg); return true; }, broadcast: push,
    onEnd: () => store.set({ room: { ...store.get().room, inMatch: false } }),
  });
  const request = async (t, fields = {}) => {
    if (t === 'room.leave') { stopLaboratory(); return { t: 'ok' }; }
    if (t === 'g.leave') { match.finish({ victory: false, reason: 'abandoned' }); return { t: 'ok' }; }
    if (t === 'room.loadout') {
      const res = match.setLoadout(playerId, fields.entries, fields.ops);
      if (res?.error) throw new NetError(res.error, res.detail, res.detail);
      return { t: 'ok' };
    }
    const msg = { ...fields, t };
    if (!t.startsWith('g.lab') && validateC2S(msg)) throw new NetError('BAD_MSG');
    const res = match.handle(playerId, msg);
    if (res?.error) throw new NetError(res.error, res.detail, res.detail);
    if(t==='g.labDummyStats')await syncLaboratoryDummy(match,fields.reset);
    return { t: 'ok' };
  };
  net.close();
  active = { match, previous };
  net.localSession = { request };
  net.status = 'online';
  net._emit('status', net.snapshot());
  store.set({ me: { ...previous.me, playerId, name }, match: emptyMatch(),
    room: { code: 'LAB', mode: 'solo', laboratory: true, difficulty: setup.difficulty, hostId: playerId, inMatch: true, spectators: [],
      seats: [{ seat: 0, playerId, name, isBot: false, connected: true }], customExtensions },
    clock: { offset: 0, rtt: 0, synced: true }, chat: [], ticker: [], emotes: [] });
  store.patch('ui', { laboratorySetup: null });
  match.start();
}

export function captureLaboratorySetup() {
  if (!active) throw new Error('실험실에서만 저장할 수 있습니다.');
  const playerId = store.get().me.playerId, lo = loadoutStore.get();
  // The editor's debounced sync may still be pending when Save is clicked.
  const result = active.match.setLoadout(playerId, lo.entries, lo.ops);
  if (result.error) throw new Error('오퍼레이터 설정을 저장할 수 없습니다.');
  return active.match.saveSetup(playerId);
}
export function restoreLaboratorySetup(saved) {
  if (!active) throw new Error('실험실에서만 불러올 수 있습니다.');
  const playerId = store.get().me.playerId;
  const lo=loadoutStore.get(),synced=active.match.setLoadout(playerId,lo.entries,lo.ops);
  if(synced.error)throw new Error('현재 오퍼레이터 설정을 적용하지 못했습니다.');
  const result = active.match.loadSetup(playerId, saved);
  if (result.error) throw new Error(result.error === 'HAND_FULL'
    ? '대기석과 임시 대기석의 공간이 부족합니다.' : '현재 설정에서 이 프리셋을 불러올 수 없습니다.');

}

export async function restartLaboratory(){
 if(!active?.match.preparationSnapshot)throw new Error('전투 시작 전 배치가 없습니다.');
 const setup=structuredClone(active.match.laboratory),snapshot=structuredClone(active.match.preparationSnapshot),customExtensions=structuredClone(active.match.customExtensions);
 stopLaboratory({reconnect:false});
 await startLaboratory({...setup,customExtensions});
 const session=active,until=Date.now()+10000;
 while(active===session&&session.match.phase==='ROUND_START'&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,16));
 if(active!==session||session.match.phase!=='PREP')throw new Error('실험실 준비 단계로 돌아오지 못했습니다.');
 const pid=store.get().me.playerId,res=active.match.loadSetup(pid,snapshot.pieces);
 if(res.error)throw new Error('전투 시작 전 배치를 복원하지 못했습니다.');
 const ps=active.match.players.get(pid);ps.layers=structuredClone(snapshot.layers);ps.recompute();active.match.markPrivate(ps);active.match.markPublic();active.match.flush(true);
}

async function syncLaboratoryDummy(match,reset){
 const {battleRunner}=await import('./battle/runner.js'),stats=match.laboratory.dummyStats;
 if(!stats)return;
 const pool=match.bossPool;
 if(pool){const hp=reset?stats.maxHp:Math.min(pool.hp,stats.maxHp);pool.maxHp=stats.maxHp;pool.hp=hp;}
 for(const entry of battleRunner._entries.values()){
  const b=entry.battle;if(!b||b.finished)continue;
  if(b.sharedBoss){const hp=reset?stats.maxHp:Math.min(b.sharedBoss.hp,stats.maxHp);b.sharedBoss.maxHp=stats.maxHp;b.sharedBoss.hp=hp;}
  for(const e of b.enemies)if(e.defId===LAB_DUMMY_ENEMY){Object.assign(e.base,{maxHp:stats.maxHp,atk:stats.atk,def:stats.def,res:stats.res});e.def={...e.def,epResistance:stats.elementRes,epDamageResistance:stats.elementDmgRes};e.markDirty();b._syncBossHp(e);}
 }
 match.markPublic();match.flush(true);
}

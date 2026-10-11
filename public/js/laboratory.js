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
export function stopLaboratory() {
  if (!active) return;
  const previous = active.previous;
  active.match.dispose();
  active = null;
  net.localSession = null;
  store.set({ me: previous.me, room: null, match: emptyMatch(), chat: [], ticker: [], emotes: [], clock: previous.clock });
  net.connect();
}

export async function startLaboratory(setup) {
  if (active || store.get().room?.inMatch) throw new Error('진행 중인 시뮬레이션을 먼저 종료해주세요.');
  // Only static files are fetched. No room, match, or combat requests are sent to a server.
  await Promise.all([...GAME_FILES, 'waves', 'backups'].map(k => data.load(k)));
  const raw = Object.fromEntries([...GAME_FILES, 'waves', 'backups'].map(k => [k, data.get(k)]));
  if (['config','chess','items','bands','stages','bosses','waves'].some(k => !raw[k])) throw new Error('실험실에 필요한 게임 데이터를 불러오지 못했습니다.');
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
  const customExtensions = normalizeCustomExtensions(setup.customExtensions===undefined?{bonds:catalog.bonds.map(x=>x.id),stages:catalog.stages.map(x=>x.id)}:{bonds:setup.customExtensions.bonds||[],stages:setup.customExtensions.stages||[]},raw);
  const configured=applyCustomExtensions(raw,customExtensions);
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
    if (t === 'room.loadout') return { t: 'ok' }; // preferences are already stored locally
    const msg = { ...fields, t };
    if (!t.startsWith('g.lab') && validateC2S(msg)) throw new NetError('BAD_MSG');
    const res = match.handle(playerId, msg);
    if (res?.error) throw new NetError(res.error, res.detail, res.detail);
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

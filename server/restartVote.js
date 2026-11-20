import { ERR } from '../shared/constants.js';
import { restartVotePolicy, requiredRestartVotes } from '../shared/restartVote.js';

export const VOTE_MS = 45_000;
export const ROOM_COOLDOWN_MS = 120_000;
export const PLAYER_COOLDOWN_MS = 180_000;
const states = new WeakMap(), ok = {ok:true};
const fail = (error,detail) => ({error,detail});
function state(room) {
  if (!states.has(room)) states.set(room,{vote:null,pending:false,serial:0,roomUntil:0,players:new Map(),counts:new Map(),matchNo:room.matchCount});
  const s=states.get(room);
  if(s.matchNo!==room.matchCount){s.matchNo=room.matchCount;s.counts.clear();}
  return s;
}
function required(v){return requiredRestartVotes(v.ids.length,v.config.majority);}
export function voteFrame(room,playerId,now) {
  const s=state(room),v=s.vote,config=v?.config||restartVotePolicy(room);
  return {t:'room.restartVote',matchNo:room.matchCount,config,
    vote:v?{id:v.id,deadline:v.deadline,total:v.ids.length,required:required(v),
      yes:[...v.answers.values()].filter(Boolean).length,no:[...v.answers.values()].filter(x=>!x).length,
      eligible:v.ids.includes(playerId),answered:v.answers.has(playerId),myAnswer:v.answers.get(playerId)??null}:null,
    nextRequestAt:Math.max(s.roomUntil,s.players.get(playerId)||0),remaining:Math.max(0,config.maxRequestsPerMatch-(s.counts.get(playerId)||0)),serverNow:now};
}
export function sendVotes(lobby,room){for(const session of lobby.memberSessions(room))lobby.sendToPlayer(room,session.playerId,voteFrame(room,session.playerId,lobby.now()));}
export function cancelVote(lobby,room,outcome='cancelled') {
  const s=state(room);s.pending=false;
  if(!s.vote)return;
  clearTimeout(s.vote.timer);const config=s.vote.config;s.vote=null;
  s.roomUntil=lobby.now()+config.roomCooldownMs;
  lobby.broadcastRoom(room,{t:'room.restartOutcome',outcome});sendVotes(lobby,room);
}
function finishIfDecided(lobby,room) {
  const v=state(room).vote;if(!v)return;
  const yes=[...v.answers.values()].filter(Boolean).length,no=[...v.answers.values()].filter(x=>!x).length;
  if(!v.ids.length){cancelVote(lobby,room);return;}
  if(yes>=required(v)) {
    cancelVote(lobby,room,'passed');
    const ctx = room.matchCtx;
    // Invalidate callbacks before disposing combat; preserve room seats, settings and chat.
    if (ctx) lobby.disposeMatchCtx(ctx);
    room.match = null; room.matchCtx = null; room.matchKey = null; room.replay = null; room.lastSummary = null; room.restartMatchNo = room.matchCount;
    for (let i = 0; i < room.seats.length; i++) {
      const member = room.seats[i];
      if (!member) continue;
      if (member.left) { room.seats[i] = null; continue; }
      if (!member.isBot) { member.ready = false; if (!member.connected) lobby.startGrace(room, member); }
    }
    lobby.broadcastRoom(room, { t: 'room.restartLobby', matchNo: room.matchCount });
    lobby.broadcastState(room);
  } else if(v.ids.length-no<required(v))cancelVote(lobby,room,'failed');
  else sendVotes(lobby,room);
}
/** Living players leaving cancel the vote; departed eliminated players lose their vote and denominator. */
export function restartMemberLeaving(lobby,room,playerId) {
  const s=state(room),v=s.vote;
  if(!v){s.pending=false;return;}
  if(v.eliminated.has(playerId)) {
    v.ids=v.ids.filter(id=>id!==playerId);v.answers.delete(playerId);v.eliminated.delete(playerId);
    finishIfDecided(lobby,room);
  } else if(v.ids.includes(playerId))cancelVote(lobby,room);
}
export function handleRestart(lobby,session,msg) {
  const room=lobby.roomOf(session);if(!room)return fail(ERR.NOT_IN_ROOM);
  const seat=room.seatOf(session.playerId);if(!seat||seat.isBot||seat.left)return fail(ERR.SPECTATOR);
  if(!room.match)return fail(ERR.WRONG_PHASE);
  if(msg.matchNo!==room.matchCount)return fail(ERR.BAD_TARGET,'stale match');
  const s=state(room),now=lobby.now();
  if(msg.t==='room.requestRestart') {
    const config=restartVotePolicy(room);
    if(s.vote||s.pending||now<Math.max(s.roomUntil,s.players.get(session.playerId)||0)||(s.counts.get(session.playerId)||0)>=config.maxRequestsPerMatch)return fail(ERR.RATE,'리방 요청 제한 중입니다.');
    const match=room.match,pending={};
    const accept=result=>{
      if(s.pending!==pending||room.match!==match||room.disposed){return fail(ERR.WRONG_PHASE);}
      s.pending=false;if(result?.error)return result;
      const roster=result?.players||room.activeHumans().map(p=>({playerId:p.playerId,alive:match.players?.get(p.playerId)?.alive!==false}));
      const ids=roster.filter(p=>room.seatOf(p.playerId)&&!room.seatOf(p.playerId).left&&(config.includeEliminated||p.alive)).map(p=>p.playerId);
      if(!ids.includes(session.playerId)){return fail(ERR.ELIMINATED);}
      const at=lobby.now();
      s.players.set(session.playerId,at+config.playerCooldownMs);s.counts.set(session.playerId,(s.counts.get(session.playerId)||0)+1);
      const v={id:++s.serial,deadline:at+config.voteMs,ids,eliminated:new Set(roster.filter(p=>!p.alive).map(p=>p.playerId)),config,answers:new Map([[session.playerId,true]])};
      s.vote=v;v.timer=setTimeout(()=>cancelVote(lobby,room,'failed'),config.voteMs);v.timer.unref?.();
      finishIfDecided(lobby,room);return ok;
    };
    s.pending=pending;
    if(match.restartVoteRoster){const result=match.restartVoteRoster(config.includeEliminated,session.playerId);return result?.then?result.then(accept,()=>{if(s.pending===pending)s.pending=false;return fail(ERR.INTERNAL);}):accept(result);}
    if(['LOBBY','INFO_CHECK','ENDED','RESULT'].includes(match.phase)){s.pending=false;return fail(ERR.WRONG_PHASE);}
    return accept({});
  }
  const v=s.vote;
  if(!v||msg.voteId!==v.id||now>=v.deadline||!v.ids.includes(session.playerId))return fail(ERR.BAD_TARGET);
  if(v.answers.has(session.playerId))return fail(ERR.ALREADY);
  v.answers.set(session.playerId,msg.agree);finishIfDecided(lobby,room);return ok;
}

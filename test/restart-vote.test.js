import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handleRestart, voteFrame, cancelVote, restartMemberLeaving } from '../server/restartVote.js';
import { validateC2S } from '../shared/protocol.js';

function fixture() {
  let now = 1000, disposed = 0;
  const sessions = ['a','b','c','d'].map(playerId => ({ playerId, connected: true }));
  const frames = [];
  const room = { matchCount: 1, match: { phase: 'PREP', players: new Map() }, matchCtx: {}, seats: sessions.map(x=>({...x,ready:true})),
    activeHumans() { return this.seats.filter(x=>!x.isBot&&!x.left); }, seatOf(id) { return this.seats.find(x=>x.playerId===id); } };
  const lobby = { now:()=>now, roomOf:()=>room, memberSessions:()=>sessions,
    sendToPlayer:(r,id,msg)=>frames.push({id,msg}), broadcastRoom:(r,msg)=>frames.push({msg}),
    disposeMatchCtx:()=>disposed++, broadcastState:()=>{}, startGrace:()=>{} };
  const request=(id='a')=>handleRestart(lobby,{playerId:id},{t:'room.requestRestart',matchNo:room.matchCount});
  const answer=(id,agree=true,voteId=1)=>handleRestart(lobby,{playerId:id},{t:'room.answerRestart',matchNo:room.matchCount,voteId,agree});
  return {room,lobby,frames,request,answer,tick:ms=>now+=ms,disposed:()=>disposed};
}

test('custom room policy persists strict validation bounds and default 45 seconds', async()=>{
  const {extensionSelectionShape,normalizeRuleValues,recordCustomExtensions}=await import('../shared/customExtensions.js');
  assert.equal(normalizeRuleValues().restartVoteSeconds,45);
  for(const value of [15,45,90])assert.equal(extensionSelectionShape({ruleValues:{restartVoteSeconds:value}}),true);
  for(const value of [14,91,45.5,'45'])assert.equal(extensionSelectionShape({ruleValues:{restartVoteSeconds:value}}),false);
  assert.deepEqual(recordCustomExtensions({ruleValues:{restartVoteSeconds:60,restartAgreement:1}}).ruleValues,{restartAgreement:1,restartVoteSeconds:60});
});
test('majority uses all eligible humans, does not fail on one no, and passes at 3/4',()=>{
  const f=fixture();f.room.gameplayMode='custom';f.room.customExtensions={ruleValues:{restartAgreement:1,restartVoteSeconds:15}};
  f.request();assert.equal(voteFrame(f.room,'b',1000).vote.required,3);
  assert.equal(voteFrame(f.room,'b',1000).vote.deadline,16000);
  f.answer('b',false);assert.ok(voteFrame(f.room,'c',1000).vote);
  f.answer('c');f.answer('d');assert.equal(f.room.match,null);
});
test('majority fails once insufficient remaining votes, and 8 humans require five',()=>{
  const f=fixture();f.room.gameplayMode='custom';f.room.customExtensions={ruleValues:{restartAgreement:1}};
  for(const id of ['e','f','g','h'])f.room.seats.push({playerId:id});
  f.request();assert.equal(voteFrame(f.room,'b',1000).vote.required,5);
  for(const id of ['b','c','d','e'])f.answer(id,false);
  assert.equal(voteFrame(f.room,'a',1000).vote,null);assert.ok(f.room.match);
});
test('eliminated inclusion, requester exclusion, and departed vote removal',()=>{
  const f=fixture();f.room.gameplayMode='custom';f.room.customExtensions={ruleValues:{restartIncludeEliminated:0}};
  f.room.match.players.set('d',{alive:false});assert.equal(f.request('d').error,'ELIMINATED');
  f.request();assert.equal(voteFrame(f.room,'d',1000).vote.eligible,false);
  assert.equal(voteFrame(f.room,'b',1000).vote.total,3);cancelVote(f.lobby,f.room);
  f.tick(180000);f.room.customExtensions.ruleValues={restartAgreement:1};f.request();f.answer('d');
  f.room.seats.find(s=>s.playerId==='d').left=true;restartMemberLeaving(f.lobby,f.room,'d');
  const v=voteFrame(f.room,'b',181000).vote;assert.equal(v.total,3);assert.equal(v.yes,1);assert.equal(v.required,2);
  f.answer('b',true,2);assert.equal(f.room.match,null);
});
test('a departed eliminated requester can never pass a zero-person vote',()=>{
  const f=fixture();f.room.seats=f.room.seats.slice(0,2);f.room.match.players.set('a',{alive:false});f.request();
  f.room.seats[0].left=true;restartMemberLeaving(f.lobby,f.room,'a');
  assert.equal(voteFrame(f.room,'b',1000).vote.yes,0);f.answer('b');assert.equal(f.room.match,null);
});
test('async match host snapshots voters before publishing and cannot create concurrent votes',async()=>{
  const f=fixture();let complete;f.room.match.restartVoteRoster=()=>new Promise(resolve=>complete=resolve);
  const request=f.request();assert.equal(f.request('b').error,'RATE');assert.equal(voteFrame(f.room,'b',1000).vote,null);
  complete({ok:true,players:[{playerId:'a',alive:true},{playerId:'b',alive:true}]});assert.equal((await request).ok,true);
  assert.equal(voteFrame(f.room,'b',1000).vote.total,2);cancelVote(f.lobby,f.room);
});

test('a cancelled roster request cannot publish a later request or clear its pending state', async () => {
  const f = fixture(), replies = [];
  f.room.match.restartVoteRoster = () => new Promise(resolve => replies.push(resolve));
  const old = f.request();
  cancelVote(f.lobby, f.room);
  const current = f.request('b');
  replies[0]({ ok: true, players: [{ playerId: 'a', alive: true }, { playerId: 'b', alive: true }] });
  assert.equal((await old).error, 'WRONG_PHASE');
  assert.equal(voteFrame(f.room, 'b', 1000).vote, null);
  assert.equal(f.request('c').error, 'RATE');
  replies[1]({ ok: true, players: [{ playerId: 'a', alive: true }, { playerId: 'b', alive: true }] });
  assert.equal((await current).ok, true);
  assert.equal(voteFrame(f.room, 'b', 1000).vote.myAnswer, true);
  cancelVote(f.lobby, f.room);
});
test('anonymous unanimous vote preserves room seats and returns everyone unready',()=>{
  const f=fixture();assert.equal(f.request().ok,true);
  const frame=voteFrame(f.room,'b',1000);
  assert.equal(frame.vote.answered,false);assert.equal(frame.vote.yes,1);
  assert.ok(!JSON.stringify(frame).includes('playerId'));assert.ok(!('ids' in frame.vote));
  assert.equal(f.answer('a').error,'ALREADY');
  f.answer('b');f.answer('c');assert.ok(f.room.match);
  f.answer('d');assert.equal(f.room.match,null);assert.equal(f.disposed(),1);
  assert.equal(f.room.seats.length,4);assert.ok(f.room.seats.every(s=>s.ready===false));
});
test('rejection, room cooldown, personal cooldown and quota are server enforced',()=>{
  const f=fixture();f.request();f.answer('b',false);assert.ok(f.room.match);
  assert.equal(f.request('b').error,'RATE');f.tick(120000);
  assert.equal(f.request().error,'RATE');assert.equal(f.request('b').ok,true);
  cancelVote(f.lobby,f.room);f.tick(180000);assert.equal(f.request().ok,true);
  cancelVote(f.lobby,f.room);f.tick(180000);assert.equal(f.request().error,'RATE');
});
test('stale votes, expired votes, spectators and briefing requests fail',()=>{
  const f=fixture();assert.equal(f.request('spectator').error,'SPECTATOR');
  f.room.match.phase='INFO_CHECK';assert.equal(f.request().error,'WRONG_PHASE');f.room.match.phase='COMBAT';
  f.request();assert.equal(f.answer('b',true,9).error,'BAD_TARGET');f.tick(45000);
  assert.equal(f.answer('b').error,'BAD_TARGET');cancelVote(f.lobby,f.room);
  assert.equal(validateC2S({t:'room.answerRestart',matchNo:1,voteId:1,agree:'yes'}),'bad field agree');
});

test('timeout closes the vote without disposing the match',t=>{
  t.mock.timers.enable({apis:['setTimeout']});
  const f=fixture();f.request();f.tick(45000);t.mock.timers.tick(45000);
  assert.equal(voteFrame(f.room,'a',46000).vote,null);
  assert.ok(f.room.match);assert.equal(f.disposed(),0);
  assert.ok(f.frames.some(x=>x.msg.t==='room.restartOutcome'&&x.msg.outcome==='failed'));
});

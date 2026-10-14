import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Net,CONNECT_TIMEOUT_MS} from '../public/js/net.js';
function harness(t){
 const sockets=[],jobs=new Map();let seq=0;
 const timers={setTimeout(fn,ms){const id=++seq;jobs.set(id,{fn,ms});return id;},clearTimeout(id){jobs.delete(id);},setInterval(){return ++seq;},clearInterval(){}};
 class Socket{constructor(){this.readyState=0;this.sent=[];sockets.push(this);}send(raw){this.sent.push(JSON.parse(raw));}close(code){this.readyState=3;this.onclose?.({code});}open(){this.readyState=1;this.onopen?.();}receive(msg){this.onmessage?.({data:JSON.stringify(msg)});}}
 const net=new Net({WebSocket:Socket,timers,random:()=>.5,getToken:()=>null});t.after(()=>net.close());
 const fire=ms=>{const job=[...jobs].find(([,j])=>j.ms===ms);assert.ok(job,`timer ${ms}`);jobs.delete(job[0]);job[1].fn();};return{net,sockets,jobs,fire};
}
test('a stalled WebSocket handshake is replaced and the resumed session can send chat',async t=>{
 const {net,sockets,fire,jobs}=harness(t);net.setName('Player');assert.equal(sockets.length,1);
 fire(CONNECT_TIMEOUT_MS);assert.equal(sockets[0].readyState,3);assert.equal(net.status,'reconnecting');
 fire(500);assert.equal(sockets.length,2);sockets[1].open();assert.equal(net.status,'handshaking');
 sockets[1].receive({t:'welcome',playerId:'p1',name:'Player',token:'token'});assert.equal(net.status,'online');
 assert.ok(![...jobs.values()].some(j=>j.ms===CONNECT_TIMEOUT_MS));
 const request=net.request('g.chat',{text:'recovered'});const sent=sockets[1].sent.at(-1);assert.equal(sent.t,'g.chat');sockets[1].receive({t:'ok',rid:sent.rid});await request;
});
test('closing a stalled connection cancels the watchdog and does not reconnect',t=>{
 const {net,jobs}=harness(t);net.connect();net.close();assert.equal(net.status,'closed');assert.equal(jobs.size,0);
});

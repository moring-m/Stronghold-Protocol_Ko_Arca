import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Network,SessionRegistry} from '../server/net.js';

test('initial and repeated hello deliver the content identity required for browser battle authority',()=>{
 const cs='a'.repeat(64),frames=[];
 const network=new Network({registry:new SessionRegistry(),handler:{welcomeInfo:()=>({content:{vanilla:cs},diyKitted:['char_test'],t:'invalid',token:'invalid'}),onHello(){}}});
 try {
  const conn={session:null,ip:'127.0.0.1',key:null,ws:{readyState:1,bufferedAmount:0,send:raw=>frames.push(JSON.parse(raw))}};
  for(let i=0;i<2;i++){
   network.onHelloMsg(conn,{t:'hello',name:'Test',rid:i+1},Date.now());
   const message=frames.at(-1);
   assert.equal(message.t,'welcome');assert.equal(message.rid,i+1);
   assert.deepEqual(message.content,{vanilla:cs});assert.deepEqual(message.diyKitted,['char_test']);
   assert.notEqual(message.token,'invalid');
  }
 }finally{clearInterval(network.heartbeatTimer);clearInterval(network.sweepTimer);}
});

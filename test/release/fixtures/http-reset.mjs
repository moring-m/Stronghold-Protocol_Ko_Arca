import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startGateway} from '../../../server/release/gateway.js';
const release='111111111111',token='http-reset-control',dir=await mkdtemp(join(tmpdir(),'http-reset-'));
let pending,arrived,closed;
const worker=http.createServer((req,res)=>{
 if(req.url.startsWith('/__release/')){res.setHeader('content-type','application/json');res.end(JSON.stringify({release,roomPrefix:'A',draining:true,rooms:0,matches:0,codes:[]}));return;}
 if(req.url.startsWith('/slow')){pending=res;arrived();return;}
 res.end('healthy');
});
await new Promise(r=>worker.listen(0,'127.0.0.1',r));
const gateway=await startGateway({port:0,stateFile:join(dir,'state.json'),token});
const base=`http://127.0.0.1:${gateway.port}`;
gateway.server.on('request',(req,res)=>{if(req.url.startsWith('/slow'))res.on('close',()=>closed?.());});
try{
 for(const[action,input]of[['register',{id:release,port:worker.address().port,prefix:'A'}],['activate',{id:release}]]){
  assert.equal((await fetch(base+'/__roll/admin/'+action,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input)})).status,200);
 }
 for(const method of ['GET','HEAD']){
  const ready=new Promise(r=>{arrived=r;}),gone=new Promise(r=>{closed=r;});
  const client=http.request(base+'/slow?release='+release,{method});client.on('error',()=>{});client.end();
  await ready;client.destroy();await gone;
  pending.setHeader('content-type','application/octet-stream');pending.end('delayed binary');
  // Allow the late worker response callback to run before checking survival.
  await new Promise(r=>setTimeout(r,30));
  assert.equal(await(await fetch(base+'/healthy?release='+release)).text(),'healthy');
 }
 console.log('Gateway survived cancelled HTTP requests');
}finally{await gateway.close();worker.closeAllConnections();await new Promise(r=>worker.close(r));await rm(dir,{recursive:true,force:true});}

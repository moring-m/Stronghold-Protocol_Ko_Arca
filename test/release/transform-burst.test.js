import {test} from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {startGateway} from '../../server/release/gateway.js';
test('simultaneous module loads share one worker request and one transformed result',async t=>{
 const release='111111111111',token='burst-control',dir=await mkdtemp(join(tmpdir(),'gateway-burst-'));let loads=0;
 const source='// '+ 'x'.repeat(512*1024)+"\nexport {value} from './value.js';";
 const worker=http.createServer((req,res)=>{
   if(req.url.startsWith('/__release/')){res.setHeader('content-type','application/json');res.end(JSON.stringify({release,roomPrefix:'A',draining:true,rooms:0,matches:0,codes:[]}));return;}
   if(req.url.startsWith('/shared/burst.js')){loads++;setTimeout(()=>{res.setHeader('content-type','text/javascript');res.end(source);},30);return;}
   res.writeHead(404);res.end();
 });
 await new Promise(resolve=>worker.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>worker.close(resolve)));t.after(()=>rm(dir,{recursive:true,force:true}));
 const gateway=await startGateway({port:0,stateFile:join(dir,'state.json'),token,log:{error(){}}});t.after(()=>gateway.close());const base=`http://127.0.0.1:${gateway.port}`;
 for(const[action,input]of[['register',{id:release,port:worker.address().port,prefix:'A'}],['activate',{id:release}]]){const r=await fetch(base+'/__roll/admin/'+action,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(input)});assert.equal(r.status,200);}
 const url=base+'/shared/burst.js?release='+release;
 const results=await Promise.all(Array.from({length:24},async()=>{const r=await fetch(url);assert.equal(r.status,200);return r.text();}));
 assert.equal(loads,1);assert.ok(results.every(result=>result===results[0]));assert.ok(results[0].includes('./value.js?release='+release));
 assert.equal(await(await fetch(url)).text(),results[0]);assert.equal(loads,1,'completed result remains cached');
});

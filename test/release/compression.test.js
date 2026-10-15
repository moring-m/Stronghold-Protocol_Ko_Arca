import{test}from'node:test';import assert from'node:assert/strict';import http from'node:http';import{gzipSync}from'node:zlib';import{mkdtemp,rm}from'node:fs/promises';import{tmpdir}from'node:os';import{join}from'node:path';import{startGateway}from'../../server/release/gateway.js';
test('router preserves compressed JSON and 304 validators while pinned code is immutable and unpinned code is not',async t=>{
 const release='111111111111',token='compression-control',dir=await mkdtemp(join(tmpdir(),'compression-router-')),source=JSON.stringify({text:'repeat-data'.repeat(10000)}),compressed=gzipSync(source);let accepted;
 const worker=http.createServer((req,res)=>{
  if(req.url.startsWith('/__release/')){res.setHeader('content-type','application/json');res.end(JSON.stringify({release,roomPrefix:'A',draining:true,rooms:0,matches:0,codes:[]}));return;}
  if(req.url.startsWith('/data/test.json')){accepted=req.headers['accept-encoding'];res.setHeader('etag','"data-version"');if(req.headers['if-none-match']==='"data-version"'){res.writeHead(304);res.end();return;}res.writeHead(200,{'content-type':'application/json','content-encoding':'gzip','content-length':compressed.length});res.end(compressed);return;}
  res.writeHead(200,{'content-type':'text/javascript'});res.end('export {value} from "./value.js";');
 });await new Promise(r=>worker.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>worker.close(r)));t.after(()=>rm(dir,{recursive:true,force:true}));const gateway=await startGateway({port:0,stateFile:join(dir,'state.json'),token,log:{error(){}}});t.after(()=>gateway.close());const base=`http://127.0.0.1:${gateway.port}`;
 for(const[action,body]of[['register',{id:release,port:worker.address().port,prefix:'A'}],['activate',{id:release}]])assert.equal((await fetch(base+'/__roll/admin/'+action,{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify(body)})).status,200);
 const json=await fetch(base+'/data/test.json?release='+release,{headers:{'accept-encoding':'gzip'}});assert.equal(accepted,'gzip');assert.equal(json.headers.get('content-encoding'),'gzip');assert.equal(Number(json.headers.get('content-length')),compressed.length);assert.equal(await json.text(),source);
 assert.equal((await fetch(base+'/data/test.json?release='+release,{headers:{'if-none-match':'"data-version"'}})).status,304);
 const pinned=await fetch(base+'/js/main.js?release='+release);assert.match(pinned.headers.get('cache-control'),/immutable/);assert.ok((await pinned.text()).includes('release='+release));
 assert.equal((await fetch(base+'/js/main.js')).headers.get('cache-control'),'no-store');assert.match((await fetch(base+'/js/main.js?release='+release)).headers.get('cache-control'),/immutable/);
});

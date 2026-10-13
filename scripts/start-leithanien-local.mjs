import {normalizeAtlas} from '../public/vendor/resource-atlas.mjs';
import WebSocket from '../node_modules/ws/wrapper.mjs';
import {randomUUID,createHash} from 'node:crypto';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {startServer} from '../server/index.js';
const root=new URL('..',import.meta.url).pathname.replace(/\/$/,'');const resources=JSON.parse(await readFile(root+'/content/production/resources.json'));
const extraAssets=JSON.parse(await readFile(root+'/.cache/leithanien-data/assets.json'));const extraPaths=new Set();
function collect(value){if(typeof value==='string'&&value.startsWith('/assets/custom/leithanien/'))extraPaths.add(value);else if(value&&typeof value==='object')Object.values(value).forEach(collect);}
collect(extraAssets);for(const path of extraPaths){const body=await readFile(root+'/public'+path);resources.files.push({path,local:true,sources:[],bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')});}
resources.version='leithanien-local-'+createHash('sha256').update(JSON.stringify(resources.files)).digest('hex').slice(0,12);resources.totalBytes=resources.files.reduce((sum,f)=>sum+(f.bytes||0),0);
const issues=[];let requests=0;

const files=new Map(resources.files.map(f=>[f.path,f])), pending=new Map();
async function asset(path){
 if(pending.has(path))return pending.get(path);
 const task=(async()=>{const file=files.get(path);if(!file)return null;const dest=root+'/.cache/preview-024a-assets'+path;
  for(const cached of [root+'/public'+path,dest,root+'/.cache/recruit-preview-resources'+path,root+'/.cache/ursus-preview-resources'+path])try{return await readFile(cached);}catch{}
  let body;for(const url of file.sources||[]){try{const response=await fetch(url,{signal:AbortSignal.timeout(30000)});if(response.ok){body=Buffer.from(await response.arrayBuffer());if(body.length)break;}}catch{}}
  if(!body)throw Error('Missing preview resource '+path);
  if(file.atlas){const sizes=new Map();for(const texture of file.atlas.textures){const png=await asset(texture);sizes.set(texture.split('/').at(-1),{width:png.readUInt32BE(16),height:png.readUInt32BE(20)});}body=Buffer.from(normalizeAtlas(body.toString(),{pma:file.atlas.pma,renamePage:n=>n.replace(/[^A-Za-z0-9._-]/g,'_'),pageSize:n=>sizes.get(n.replace(/[^A-Za-z0-9._-]/g,'_'))}).text);}
  await mkdir(dest.slice(0,dest.lastIndexOf('/')),{recursive:true});await writeFile(dest,body);return body;
 })();pending.set(path,task);try{return await task;}finally{pending.delete(path);}
}
const sessions=new Map();
const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
const previewPort=Number(process.env.STRONGHOLD_PREVIEW_PORT||3015);
async function handlePreview(req,res){
 const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/dev/ursus-transport'){
   if(req.method!=='POST'){json(res,{error:'POST required'},405);return true}
   let size=0,body='';for await(const chunk of req){size+=chunk.length;if(size>8*1024*1024){json(res,{error:'Too large'},413);return true}body+=chunk}
   let msg;try{msg=JSON.parse(body)}catch{json(res,{error:'Invalid JSON'},400);return true}
   if(msg.action==='open'){
    if(sessions.size>=32){json(res,{error:'Preview full'},503);return true}
    const id=randomUUID(),ws=new WebSocket(`ws://127.0.0.1:${previewPort}/ws`),s={ws,seen:Date.now(),messages:[],seq:0,sent:0,bytes:0,closed:null};sessions.set(id,s);
    ws.on('message',data=>{const text=data.toString();s.messages.push({seq:++s.seq,data:text});s.bytes+=Buffer.byteLength(text);if(s.bytes>8388608)ws.close(1009,'Preview queue full')});ws.on('close',(code,reason)=>{s.closed={code,reason:reason.toString()}});ws.on('error',()=>{});
    try{await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});json(res,{id})}catch{sessions.delete(id);json(res,{error:'Connection failed'},503)}return true;
   }
   const s=sessions.get(msg.id);if(!s){json(res,{error:'Expired'},410);return true}s.seen=Date.now();
   if(msg.action==='close'){s.ws.close();sessions.delete(msg.id);json(res,{ok:true});return true}
   if(!Number.isInteger(msg.ack)||!Array.isArray(msg.send)||msg.send.length>64){json(res,{error:'Invalid poll'},400);return true}
   s.messages=s.messages.filter(m=>m.seq>msg.ack);s.bytes=s.messages.reduce((n,m)=>n+Buffer.byteLength(m.data),0);
   for(const m of msg.send){if(!Number.isInteger(m.seq)||typeof m.data!=='string'||Buffer.byteLength(m.data)>2*1024*1024){json(res,{error:'Invalid frame'},400);return true}if(m.seq>s.sent&&s.ws.readyState===WebSocket.OPEN){s.ws.send(m.data);s.sent=m.seq}}
   json(res,{messages:s.messages,sent:s.sent,closed:s.closed});return true;
  }
 return false;
}
const {loadData}=await import(root+'/server/data.js');const {setGameData}=await import(root+'/server/sim/content/support/index.js');setGameData(loadData(root+'/.cache/leithanien-data'));
const server=await startServer({host:'127.0.0.1',port:Number(process.env.STRONGHOLD_PREVIEW_PORT||3015),quiet:true,dataDir:root+'/.cache/leithanien-data',handleRequest:async(req,res)=>{
 const u=new URL(req.url,'http://localhost');if(await handlePreview(req,res))return true;if(u.pathname==='/dev/ursus-config.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({lazyResources:true,httpTransport:!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||'')}));return true;}
 if(u.pathname==='/fonts/fonts.css'){res.setHeader('Content-Type','text/css');res.end(resources.fontCss);return true;}
 if(files.has(u.pathname)&&req.method==='GET'){try{const body=await asset(u.pathname);res.setHeader('Content-Type',u.pathname.endsWith('.png')?'image/png':u.pathname.endsWith('.atlas')?'text/plain':u.pathname.endsWith('.mp3')?'audio/mpeg':'application/octet-stream');res.setHeader('Cache-Control','public,max-age=31536000,immutable');res.end(body);}catch{res.writeHead(502).end('Resource unavailable; retry');}return true;}
 if(u.pathname==='/vendor/browser-resources.json'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(resources));return true;}
 if(u.pathname==='/resource-worker.js'){res.setHeader('Content-Type','text/javascript');res.end(`const verifiedFetch=self.fetch.bind(self);self.fetch=(input,options)=>verifiedFetch(typeof input==='string'&&input.startsWith('https://')?'/__qa-remote?url='+encodeURIComponent(input):input,options);\n`+await readFile(root+'/public/resource-worker.js','utf8'));return true;}
 if(u.pathname==='/__qa-remote'){const target=new URL(u.searchParams.get('url'));if(target.protocol!=='https:'||!['raw.githubusercontent.com','cdn.jsdelivr.net'].includes(target.hostname)){res.writeHead(400).end();return true;}requests++;try{const r=await fetch(target,{signal:AbortSignal.timeout(30000)});if(!r.ok)issues.push({url:target.href,status:r.status});res.writeHead(r.status,Object.fromEntries([...r.headers].filter(([k])=>!['content-length','content-encoding','transfer-encoding','content-security-policy'].includes(k))));res.end(Buffer.from(await r.arrayBuffer()));}catch(e){issues.push({url:target.href,error:e.message});res.writeHead(502).end();}return true;}
 return false;
}});
console.log('Stronghold preview port: '+server.port);

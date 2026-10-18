// Loopback-only development transport for HTTP-only preview tunnels. The real game protocol still runs through /ws.
import WebSocket from 'ws';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,mkdir,access,statfs} from 'node:fs/promises';
import {join,dirname} from 'node:path';
import {normalizeAtlas} from '../tools/assets/atlas.mjs';
export async function previewHandler(root,port,{warmResources=true}={}){
 let closed=false;
 const sessions=new Map(),pending=new Map();const resources=JSON.parse(await readFile(join(root,'public/vendor/browser-resources.json'),'utf8'));const voices=JSON.parse(await readFile(join(root,'.cache/ursus-voice-resources.json'),'utf8').catch(()=>'{"files":[]}'));resources.files.push(...voices.files);const skins=JSON.parse(await readFile(join(root,'.cache/skin-resources.json'),'utf8').catch(()=>'{"files":[]}'));resources.files.push(...skins.files);const skillSounds=JSON.parse(await readFile(join(root,'.cache/skill-sound-resources.json'),'utf8').catch(()=>'{"files":[]}'));resources.files.push(...skillSounds.files);const bands=JSON.parse(await readFile(join(root,'.cache/ursus-band-resources.json'),'utf8').catch(()=>' {"files":[]}'));resources.files.push(...bands.files);const localArt=JSON.parse(await readFile(join(root,'.cache/ursus-local-assets.json'),'utf8').catch(()=>'{"groups":{}}'));for(const group of Object.values(localArt.groups || {}))for(const entry of Object.values(group))if(entry?.path)resources.files.push({path:entry.path,local:true,sources:[]});const recruits=JSON.parse(await readFile(join(root,'.cache/upstream-recruit-resources.json'),'utf8').catch(()=>'{"files":[]}'));const files=new Map([...recruits.files,...resources.files].map(f=>[f.path,f]));
 const timer=setInterval(()=>{for(const [id,s]of sessions)if(Date.now()-s.seen>90000){s.ws.close();sessions.delete(id)}},10000);timer.unref();
 const json=(res,value,status=200)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value))};
 async function asset(path){
  if(pending.has(path))return pending.get(path);
  const task=(async()=>{const file=files.get(path);if(!file)return null;const dest=join(root,'.cache/recruit-preview-resources',path.slice(1));try{return await readFile(join(root,'.cache/ursus-preview-resources',path.slice(1)))}catch(e){if(e.code!=='ENOENT')throw e}try{return await readFile(dest)}catch(e){if(e.code!=='ENOENT')throw e}
   if(file.local)return readFile(join(root,'public',path.slice(1)));
   let body;for(const url of file.sources){try{const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)continue;body=Buffer.from(await r.arrayBuffer());if(body.length)break}catch{}}
   if(!body)throw Error(`Missing preview resource ${path}`);
   if(file.atlas){const sizes=new Map();for(const tex of file.atlas.textures){const png=await asset(tex);sizes.set(tex.split('/').at(-1),{width:png.readUInt32BE(16),height:png.readUInt32BE(20)})}body=Buffer.from(normalizeAtlas(body.toString(),{pma:file.atlas.pma,renamePage:n=>n.replace(/[^A-Za-z0-9._-]/g,'_'),pageSize:n=>sizes.get(n.replace(/[^A-Za-z0-9._-]/g,'_'))}).text)}
   const disk=await statfs(root);if(disk.bavail*disk.bsize>body.length+16*1024*1024){await mkdir(dirname(dest),{recursive:true});await writeFile(dest,body).catch(e=>{if(e.code!=='ENOSPC')throw e});}return body;
  })();pending.set(path,task);try{return await task}finally{pending.delete(path)}
 }
 const handle=async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname;
  if(path==='/dev/patch-resources.json'){json(res,{paths:[...files.keys()]});return true}
  if(path==='/dev/ursus-config.json'){json(res,{httpTransport: !/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host || ''),lazyResources:true});return true}
  if(path==='/dev/ursus-transport'){
   if(req.method!=='POST'){json(res,{error:'POST required'},405);return true}
   let size=0,body='';for await(const chunk of req){size+=chunk.length;if(size>131072){json(res,{error:'Too large'},413);return true}body+=chunk}
   let msg;try{msg=JSON.parse(body)}catch{json(res,{error:'Invalid JSON'},400);return true}
   if(msg.action==='open'){
    if(sessions.size>=32){json(res,{error:'Preview full'},503);return true}
    const id=randomUUID(),ws=new WebSocket(`ws://127.0.0.1:${port}/ws`),s={ws,seen:Date.now(),messages:[],seq:0,sent:0,bytes:0,closed:null};sessions.set(id,s);
    ws.on('message',data=>{const text=data.toString();s.messages.push({seq:++s.seq,data:text});s.bytes+=Buffer.byteLength(text);if(s.bytes>8388608)ws.close(1009,'Preview queue full')});ws.on('close',(code,reason)=>{s.closed={code,reason:reason.toString()}});ws.on('error',()=>{});
    try{await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject)});json(res,{id})}catch{sessions.delete(id);json(res,{error:'Connection failed'},503)}return true;
   }
   const s=sessions.get(msg.id);if(!s){json(res,{error:'Expired'},410);return true}s.seen=Date.now();
   if(msg.action==='close'){s.ws.close();sessions.delete(msg.id);json(res,{ok:true});return true}
   if(!Number.isInteger(msg.ack)||!Array.isArray(msg.send)||msg.send.length>64){json(res,{error:'Invalid poll'},400);return true}
   s.messages=s.messages.filter(m=>m.seq>msg.ack);s.bytes=s.messages.reduce((n,m)=>n+Buffer.byteLength(m.data),0);
   for(const m of msg.send){if(!Number.isInteger(m.seq)||typeof m.data!=='string'||Buffer.byteLength(m.data)>65536){json(res,{error:'Invalid frame'},400);return true}if(m.seq>s.sent&&s.ws.readyState===WebSocket.OPEN){s.ws.send(m.data);s.sent=m.seq}}
   json(res,{messages:s.messages,sent:s.sent,closed:s.closed});return true;
  }
  if(/^\/(assets|fonts|media)\//.test(path)&&req.method==='GET'){
   try{await access(join(root,'public',path.slice(1)));return false}catch{}
   if(path==='/fonts/fonts.css'){res.setHeader('Content-Type','text/css');res.end(resources.fontCss);return true}
   let key=path;if(path.startsWith('/media/'))key=resources.files.find(f=>f.path.startsWith('/assets/audio/')&&f.path.slice('/assets/audio/'.length).replace(/\.[^.]+$/,'')===path.slice(7))?.path;
   if(!files.has(key))return false;try{const body=await asset(key);res.setHeader('Cache-Control','public, max-age=31536000, immutable');res.setHeader('Content-Type',key.endsWith('.png')?'image/png':key.endsWith('.atlas')?'text/plain':key.endsWith('.css')?'text/css':/\.(ogg|wav|mp3)$/i.test(key)?(key.endsWith('.ogg')?'audio/ogg':key.endsWith('.wav')?'audio/wav':'audio/mpeg'):'application/octet-stream');res.end(body)}catch{res.statusCode=502;res.end('Resource unavailable; retry')}return true;
  }
  return false;
 };
 const background=[...files.keys()].sort((a,b)=>Number(b.includes('/illustrations/'))-Number(a.includes('/illustrations/')));
 async function warm(){while(!closed && background.length){const path=background.shift();try{await access(join(root,'public',path));continue}catch{}try{await access(join(root,'.cache/ursus-preview-resources',path.slice(1)));continue}catch{}try{await asset(path)}catch{ /* Foreground requests retry missing upstream assets. */ }}}
 if(warmResources)Promise.all([warm(),warm()]).then(()=>{if(!closed)console.log('Background resource synchronization complete');});
 return{handle,close(){closed=true;clearInterval(timer);for(const s of sessions.values())s.ws.close();sessions.clear()}};
}

// Add extracted effects without replacing an existing official key or payload.
import {readFile,writeFile,mkdir,copyFile,access} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sections=['units','projectiles','skills','skins','prefabs','costumes'];
export function mergeMissingFx(base,extra){
 const out={...base};
 for(const section of sections)out[section]={...(extra[section]||{}),...(base[section]||{})};
 return out;
}
function safe(root,path){const dest=resolve(root,path),rel=relative(root,dest);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Unsafe FX path');return dest;}
function strings(value,out=new Set()){
 if(typeof value==='string')out.add(value.toLowerCase());
 else if(value&&typeof value==='object')for(const v of Object.values(value))strings(v,out);
 return out;
}
export async function prepareSupplement(baseRoot,incomingRoot,outRoot,baseManifest=resolve(baseRoot,'data/local-fx.json')){
 const base=await read(resolve(baseRoot,'public/assets/local/fx/index.json'));
 const incoming=await read(resolve(incomingRoot,'public/assets/local/fx/index.json'));
 const bm=await read(baseManifest);
 const im=await read(resolve(incomingRoot,'data/local-fx.json'));
 const bt=await read(resolve(baseRoot,'public/assets/local/fx/textures.json'));
 const it=await read(resolve(incomingRoot,'public/assets/local/fx/textures.json'));
 const extra={format:'fx-supplement',version:1,units:{},projectiles:{},skills:{},skins:{},prefabs:{},textures:{},groups:{'fx/prefabs':{},'fx/tex':{},'fx/mesh':{}},files:[]};
 for(const[id,unit]of Object.entries(incoming.units))if(!base.units[id]){
  extra.units[id]=unit;if(incoming.skins[id]&&!base.skins[id])extra.skins[id]=incoming.skins[id];
  for(const key of Object.keys(unit.skills||{}))if(incoming.skills[key]&&!base.skills[key])extra.skills[key]=incoming.skills[key];
 }
 const references=strings(extra.units);strings(extra.skills,references);
 const pending=[...references].filter(key=>incoming.projectiles[key]);
 const visited=new Set();
 while(pending.length){const key=pending.pop();if(visited.has(key))continue;visited.add(key);const entry=incoming.projectiles[key];if(!base.projectiles[key])extra.projectiles[key]=entry;for(const ref of strings(entry)){references.add(ref);if(incoming.projectiles[ref])pending.push(ref);}}
 const effects=[...references].filter(key=>incoming.prefabs[key]);
 const seen=new Set(),textures=new Set(),meshes=new Set();
 while(effects.length){const key=effects.pop();if(seen.has(key)||base.prefabs[key])continue;seen.add(key);
  const entry=incoming.prefabs[key];if(!entry)throw Error('Missing effect '+key);
  const desc=await read(safe(resolve(incomingRoot,'public/assets/local/fx'),entry.file));
  extra.prefabs[key]=entry;extra.groups['fx/prefabs'][key]=im.groups['fx/prefabs'][key];
  for(const ref of desc.refs||[])if(incoming.prefabs[ref])effects.push(ref);
  for(const t of desc.textures||[])textures.add(t);
  for(const m of desc.meshes||[])if(!m.startsWith('builtin:'))meshes.add(m);
 }
 for(const key of textures)if(!bt.textures[key]){
  if(!it.textures[key]||!im.groups['fx/tex'][key])throw Error('Missing texture '+key);
  extra.textures[key]=it.textures[key];extra.groups['fx/tex'][key]=im.groups['fx/tex'][key];
 }
 for(const key of meshes)if(!bm.groups['fx/mesh'][key]){
  if(!im.groups['fx/mesh'][key])throw Error('Missing mesh '+key);extra.groups['fx/mesh'][key]=im.groups['fx/mesh'][key];
 }
 const paths=new Set();for(const rows of Object.values(extra.groups))for(const entry of Object.values(rows))for(const path of [entry.path,entry.half])if(path)paths.add(path);
 for(const path of [...paths].sort()){
  if(!path.startsWith('/assets/local/fx/'))throw Error('Invalid FX resource');
  const rel=path.slice('/assets/local/fx/'.length),bytes=await readFile(safe(resolve(incomingRoot,'public/assets/local/fx'),rel));
  const output=safe(resolve(outRoot,'files'),rel);await mkdir(dirname(output),{recursive:true});await writeFile(output,bytes);
  extra.files.push({path,bytes:bytes.length,sha256:hash(bytes)});
 }
 await mkdir(outRoot,{recursive:true});await writeFile(resolve(outRoot,'supplement.json'),JSON.stringify(extra));
 return {units:Object.keys(extra.units),prefabs:Object.keys(extra.prefabs).length,textures:Object.keys(extra.textures).length,meshes:Object.keys(extra.groups['fx/mesh']).length,files:extra.files.length,bytes:extra.files.reduce((n,f)=>n+f.bytes,0)};
}
export async function installSupplement(directory=ROOT,supplementRoot=resolve(ROOT,'content/custom/fx')){
 let extra;try{extra=await read(resolve(supplementRoot,'supplement.json'));}catch(e){if(e.code==='ENOENT')return null;throw e;}
 const fxRoot=resolve(directory,'public/assets/local/fx');
 const base=await read(resolve(fxRoot,'index.json')),tex=await read(resolve(fxRoot,'textures.json'));
 const merged=mergeMissingFx(base,extra);tex.textures={...extra.textures,...tex.textures};
 const added=[];
 for(const file of extra.files){
  const rel=file.path.slice('/assets/local/fx/'.length),bytes=await readFile(safe(resolve(supplementRoot,'files'),rel));
  if(hash(bytes)!==file.sha256)throw Error('Supplement hash mismatch: '+file.path);
  const dest=safe(fxRoot,rel);let prior;try{prior=await readFile(dest);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(prior&&hash(prior)!==file.sha256)throw Error('Refusing to replace existing FX payload: '+rel);
  if(!prior){await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes);}added.push({...file,local:true,sources:[file.path]});
 }
 await writeFile(resolve(fxRoot,'index.json'),JSON.stringify(merged));await writeFile(resolve(fxRoot,'textures.json'),JSON.stringify(tex));
 const manifestPath=resolve(directory,'data/local-fx.json'),manifest=await read(manifestPath);
 for(const[group,rows]of Object.entries(extra.groups))manifest.groups[group]={...rows,...manifest.groups[group]};
 manifest.groups.fx.index={...manifest.groups.fx.index,prefabs:Object.keys(merged.prefabs).length};
 manifest.groups.fx.textures={...manifest.groups.fx.textures,count:Object.keys(tex.textures).length};
 manifest.count=Object.values(manifest.groups).reduce((n,rows)=>n+Object.keys(rows).length,0);
 await writeFile(manifestPath,JSON.stringify(manifest));
 for(const rel of ['index.json','textures.json']){const bytes=await readFile(resolve(fxRoot,rel));added.push({path:'/assets/local/fx/'+rel,local:true,sources:['/assets/local/fx/'+rel],bytes:bytes.length,sha256:hash(bytes)});}
 const resourcePath=resolve(directory,'public/vendor/browser-resources.json');const resources=await read(resourcePath),files=new Map(resources.files.map(f=>[f.path,f]));
 for(const f of added)files.set(f.path,f);resources.files=[...files.values()];
 resources.version=hash(JSON.stringify(resources.files)).slice(0,20);resources.estimatedBytes=resources.files.reduce((n,f)=>n+(f.bytes??256*1024),0);resources.estimatedStorageBytes=Math.ceil(resources.estimatedBytes*2.2);delete resources.totalBytes;
 await writeFile(resourcePath,JSON.stringify(resources));
 return {units:Object.keys(extra.units),resources:added.length};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const mode=process.argv[2];
 if(mode==='prepare')console.log(JSON.stringify(await prepareSupplement(...process.argv.slice(3)),null,2));
 else if(mode==='install')console.log(JSON.stringify(await installSupplement(process.argv[3]||ROOT),null,2));
 else throw Error('Usage: fx-supplement.mjs prepare BASE_ROOT INCOMING_ROOT OUT_ROOT | install [ROOT]');
}

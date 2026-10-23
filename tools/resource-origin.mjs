// Prepare server-hosted payloads for a future immutable GitHub/CDN origin.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const local=f=>f.local || (f.sources||[]).some(s=>s.startsWith('/'));
function safe(base,path){const out=resolve(base,path.replace(/^\//,'')),rel=relative(base,out);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Unsafe resource path: '+path);return out;}
export function applyOrigin(catalog,config){
 if(!config.baseUrls?.length)return catalog;
 const bases=config.baseUrls.map(value=>{const u=new URL(value);if(u.protocol!=='https:'||!['raw.githubusercontent.com','cdn.jsdelivr.net'].includes(u.hostname)||u.search||u.hash)throw Error('Use an immutable HTTPS GitHub raw/jsDelivr base URL');return u.href.replace(/\/$/,'');});
 const files=catalog.files.map(f=>local(f)?{...f,sources:[...bases.map(b=>b+'/'+f.path.split('/').filter(Boolean).map(encodeURIComponent).join('/')),...(config.fallbackToServer?[f.path]:[])]}:f);
 return {...catalog,files,version:sha(JSON.stringify(files)).slice(0,20)};
}
export async function exportResources(catalogPath,out,roots){
 const catalog=await read(catalogPath), inventory=[],missing=[];
 for(const f of catalog.files.filter(local)){
  let bytes,source;
  for(const base of roots){try{source=safe(base,f.path);bytes=await readFile(source);break;}catch(e){if(e.code!=='ENOENT')throw e;}}
  if(!bytes){missing.push(f.path);continue;}
  const digest=sha(bytes);
  if(f.sha256&&f.sha256!==digest)throw Error('Resource hash mismatch: '+f.path);
  const dest=safe(resolve(out,'public'),f.path);await mkdir(dirname(dest),{recursive:true});await copyFile(source,dest);
  inventory.push({path:f.path,bytes:bytes.length,sha256:digest});
 }
 await mkdir(out,{recursive:true});
 const report={files:inventory.length,bytes:inventory.reduce((n,f)=>n+f.bytes,0),missing,inventory};
 await writeFile(resolve(out,'inventory.json'),JSON.stringify(report,null,2));
 await writeFile(resolve(out,'browser-resources.json'),JSON.stringify(catalog));
 if(missing.length)throw Error(`${missing.length} server resources missing; inspect ${out}/inventory.json`);
 return {files:report.files,bytes:report.bytes,missing:0};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const [mode,...args]=process.argv.slice(2);
 if(mode==='export')console.log(await exportResources(args[0],args[1],args.slice(2)));
 else if(mode==='apply'){
  const config=await read(args[1]||resolve(root,'content/custom/resource-origin.json'));
  const path=args[0]||resolve(root,'public/vendor/browser-resources.json');
  const catalog=await read(path);await writeFile(path,JSON.stringify(applyOrigin(catalog,config)));
 }else throw Error('Usage: resource-origin.mjs export CATALOG OUT PUBLIC_ROOT... | apply [CATALOG] [CONFIG]');
}

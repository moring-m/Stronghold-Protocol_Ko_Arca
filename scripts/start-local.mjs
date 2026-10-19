// Local preview uses the same prepared catalogue as the production image.
// Keep generated base data intact and fail clearly if custom content is missing.
import {fileURLToPath} from 'node:url';
import {readFile,readdir,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {transform,pinPath} from '../server/release/transform.js';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {loadData,setData} from '../server/data.js';
import {setSimData} from '../server/sim/simdata.js';
import {setGameData} from '../server/sim/content/support/index.js';
import {customExtensionCatalog} from '../shared/customExtensions.js';
import {startServer} from '../server/index.js';
import {previewHandler} from './ursus-preview-http.mjs';
const dataDir=fileURLToPath(new URL('../content/production/data/',import.meta.url));
const data=loadData(dataDir);
const preparedResources=new URL('../content/production/resources.json',import.meta.url);
const cachedOfficialRoot=new URL('../.cache/local-production/',import.meta.url);
const cachedIndex=new URL('public/vendor/browser-resources.json',cachedOfficialRoot);
const hasCachedOfficial=await access(cachedIndex).then(()=>true,()=>false);
const resourceFile=process.env.STRONGHOLD_LOCAL_RESOURCES?new URL('file://'+process.env.STRONGHOLD_LOCAL_RESOURCES):hasCachedOfficial?cachedIndex:preparedResources;
const resourceBody=await readFile(resourceFile);
const resources=JSON.parse(resourceBody);
const prepared=JSON.parse(await readFile(preparedResources));
const preparedPaths=new Set(prepared.files.filter(f=>f.local).map(f=>f.path));
const officialRoot=process.env.STRONGHOLD_LOCAL_OFFICIAL_ROOT?new URL('file://'+process.env.STRONGHOLD_LOCAL_OFFICIAL_ROOT.replace(/\/$/,'')+'/'):hasCachedOfficial?cachedOfficialRoot:null;
const localResources=new Map(resources.files.filter(f=>f.local).map(f=>[f.path,preparedPaths.has(f.path)?new URL('../content/production'+f.path,import.meta.url):new URL('public'+f.path,officialRoot||rootUrl())]));
function rootUrl(){return new URL('../',import.meta.url);}
if(!data.bonds?.leithanienShip||!customExtensionCatalog(data).bonds.some(b=>b.id==='leithanien'))throw new Error('Local preview catalogue is missing Leithanien.');
setData(data);setSimData(data);setGameData(data);
const root=new URL('../',import.meta.url),codeHash=createHash('sha256');
for(const dir of ['public/js/','public/css/','public/dev/','shared/','server/sim/']){
 const base=new URL(dir,root);
 for(const name of (await readdir(base,{recursive:true})).sort())if(/\.(?:js|mjs|css)$/.test(name)){codeHash.update(dir+name);codeHash.update(await readFile(new URL(name,base)));}
}
codeHash.update(await readFile(new URL('public/index.html',root)));
const codeRelease=codeHash.digest('hex').slice(0,40),codeResponses=new Map();
const port=Number(process.env.PORT||3000);
const preview=await previewHandler(fileURLToPath(new URL('../',import.meta.url)),port,{warmResources:false});
const server=await startServer({dataDir,host:process.env.HOST||'127.0.0.1',port,handleRequest:async(req,res)=>{
 const path=new URL(req.url,'http://localhost').pathname;
 if(path==='/dev/ursus-config.json'){res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.end(JSON.stringify({httpTransport:!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(req.headers.host||''),lazyResources:false}));return true;}
 if(path==='/dev/ursus-transport')return preview.handle(req,res);
 if(!['GET','HEAD'].includes(req.method))return false;
 if(path==='/'||(/^\/(?:js|css|dev|vendor|shared|sim)\//.test(path)&&/\.(?:js|mjs|css)$/.test(path))){
  const normalized=new URL(req.url,'http://localhost').pathname;
  const dir=normalized.startsWith('/shared/')?root:normalized.startsWith('/sim/')?new URL('server/',root):new URL('public/',root);
  let response=codeResponses.get(normalized);
  if(!response){
   try{
    const type=path==='/'?'text/html':path.endsWith('.css')?'text/css':'text/javascript';
    const body=await readFile(new URL(path==='/'?'index.html':normalized.slice(1),dir),'utf8');
    const text=type==='text/html'?body.replace(/\b(src|href)=(['"])(\/[^'"]*)\2/g,(_,key,q,url)=>`${key}=${q}${pinPath(url,codeRelease)}${q}`):await transform(body,type,codeRelease);
    response={type,body:Buffer.from(text)};codeResponses.set(normalized,response);
   }catch(error){if(error.code==='ENOENT')return false;throw error;}
  }
  res.setHeader('Content-Type',response.type+'; charset=utf-8');
  res.setHeader('Cache-Control',new URL(req.url,'http://localhost').searchParams.get('release')===codeRelease?'public,max-age=31536000,immutable':'no-store');
  res.end(req.method==='HEAD'?undefined:response.body);return true;
 }

 if(path==='/vendor/browser-resources.json'||path==='/fonts/fonts.css'){
  res.setHeader('Content-Type',path.endsWith('.json')?'application/json':'text/css');res.setHeader('Cache-Control','no-cache');
  res.end(req.method==='HEAD'?undefined:path.endsWith('.json')?resourceBody:resources.fontCss);return true;
 }
 let resourcePath;try{resourcePath=decodeURIComponent(path);}catch{return false;}
 const file=localResources.get(resourcePath);if(!file)return false;
 const ext=path.split('.').at(-1);const mime={png:'image/png',webp:'image/webp',jpg:'image/jpeg',mp3:'audio/mpeg',ogg:'audio/ogg',json:'application/json',atlas:'text/plain',woff2:'font/woff2',ttf:'font/ttf',otf:'font/otf'};
 res.setHeader('Content-Type',mime[ext]||'application/octet-stream');res.setHeader('Cache-Control','public,max-age=31536000,immutable');
 if(req.method==='HEAD')res.end();else await pipeline(createReadStream(file),res);return true;
}});
console.log(`Local preview: production catalogue loaded (라이타니엔·우르수스 포함), ${resources.files.length} resource files.`);
if(!officialRoot)console.warn('Local preview lacks the official visual import performed by Docker; prepare .cache/local-production before comparing production resource loading.');
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{preview.close();await server.close();process.exit(0)});

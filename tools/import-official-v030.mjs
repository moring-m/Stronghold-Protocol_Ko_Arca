// Install only the official visual resources of the pinned upstream release.
// No operator data, voices, executable scripts or local custom maps are overwritten.
import {readFile,writeFile,mkdir,open,unlink,stat} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export const ARCHIVE_SHA256='5bf3cf3797902e8441aca211706630254c7ebb9636fa0baf301e6c179efcd5b7';
const url='https://github.com/sganggs/Stronghold-Protocol/releases/download/v0.3.0/Stronghold-Protocol-v0.3.0.zip';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function importOfficialArchive(archive,{directory=root}={}){
 const check=createHash('sha256');for await(const b of createReadStream(archive))check.update(b);
 if(check.digest('hex')!==ARCHIVE_SHA256)throw Error('Upstream archive SHA-256 mismatch');
 const zip=await open(archive,'r');const files=[];let manifests={};
 try{
  const stat=await zip.stat(),tail=Buffer.alloc(Math.min(65557,stat.size));await zip.read(tail,0,tail.length,stat.size-tail.length);
  let end=-1;for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50){end=i;break;}if(end<0)throw Error('ZIP footer missing');
  const total=tail.readUInt16LE(end+10),size=tail.readUInt32LE(end+12),offset=tail.readUInt32LE(end+16),central=Buffer.alloc(size);await zip.read(central,0,size,offset);
  for(let n=0,p=0;n<total;n++){
   if(central.readUInt32LE(p)!==0x02014b50)throw Error('ZIP directory malformed');
   const method=central.readUInt16LE(p+10),packed=central.readUInt32LE(p+20),length=central.readUInt32LE(p+24),nl=central.readUInt16LE(p+28),el=central.readUInt16LE(p+30),cl=central.readUInt16LE(p+32),at=central.readUInt32LE(p+42),name=central.subarray(p+46,p+46+nl).toString();p+=46+nl+el+cl;
   const rel=name.replace(/^Stronghold-Protocol\//,'');
   if(rel.endsWith('/')||!(/^public\/assets\/local\//.test(rel)||/^data\/local-(assets|fx)\.json$/.test(rel)))continue;
   if(rel.split('/').includes('..')||rel.includes('\\')||length>100*1024*1024)throw Error('Invalid official asset path/size');
   const header=Buffer.alloc(30);await zip.read(header,0,30,at);if(header.readUInt32LE(0)!==0x04034b50)throw Error('ZIP entry malformed');
   const body=Buffer.alloc(packed);await zip.read(body,0,packed,at+30+header.readUInt16LE(26)+header.readUInt16LE(28));
   const bytes=method===8?inflateRawSync(body,{maxOutputLength:length}):method===0?body:null;if(!bytes||bytes.length!==length)throw Error('ZIP entry size/method mismatch');
   if(rel.startsWith('data/')){manifests[rel]=JSON.parse(bytes);continue;}
   const target=resolve(directory,rel);await mkdir(dirname(target),{recursive:true});await writeFile(target,bytes);
   files.push({path:'/'+rel.slice('public/'.length),sources:['/'+rel.slice('public/'.length)],bytes:length,sha256:hash(bytes),local:true});
  }
 }finally{await zip.close();}
 for(const [rel,incoming]of Object.entries(manifests)){
  const dataDirs=['data','content/production/data','.cache/leithanien-data'];
  for(const dataDir of dataDirs){
  if(!await stat(resolve(directory,dataDir)).catch(()=>null))continue;
  const target=resolve(directory,dataDir,rel.slice('data/'.length));let existing={};try{existing=JSON.parse(await readFile(target,'utf8'));}catch{}
  const groups={...existing.groups};for(const[k,v]of Object.entries(incoming.groups||{}))groups[k]={...groups[k],...v};
  await writeFile(target,JSON.stringify({...existing,...incoming,groups}));
  }
 }
 const target=resolve(directory,'public/vendor/browser-resources.json');let index;try{index=JSON.parse(await readFile(target,'utf8'));}catch{index=JSON.parse(await readFile(resolve(directory,'content/production/resources.json'),'utf8'));}
 const byPath=new Map(index.files.map(f=>[f.path,f]));for(const f of files)byPath.set(f.path,f);
 index.files=[...byPath.values()].sort((a,b)=>a.path.localeCompare(b.path));index.estimatedBytes=index.files.reduce((n,f)=>n+(f.bytes||0),0);index.estimatedStorageBytes=Math.ceil(index.estimatedBytes*2.2);index.version=hash(Buffer.from(JSON.stringify(index.files))).slice(0,20);
 await mkdir(dirname(target),{recursive:true});await writeFile(target,JSON.stringify(index));
 console.log(`Official v0.3.0 visuals verified: ${files.length} files, ${Math.round(files.reduce((n,f)=>n+f.bytes,0)/1048576)} MiB; resource index ${index.version}`);
 return files;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let archive=process.argv[2],download=false;if(archive==='--download'){archive=resolve(root,'.cache/official-v030.zip');await mkdir(dirname(archive),{recursive:true});const response=await fetch(url);if(!response.ok)throw Error(`Upstream download HTTP ${response.status}`);await pipeline(Readable.fromWeb(response.body),createWriteStream(archive));download=true;}
 if(!archive)throw Error('Usage: node tools/import-official-v030.mjs ARCHIVE.zip|--download');
 try{await importOfficialArchive(archive);}finally{if(download)await unlink(archive);}
}

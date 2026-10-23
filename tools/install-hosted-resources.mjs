// Hydrate pinned server-only payloads and install additive costume metadata at build time.
import {readFile,writeFile,mkdir,copyFile,symlink} from 'node:fs/promises';
import {resolve,dirname,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {installSupplement} from './fx-supplement.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=async p=>JSON.parse(await readFile(p,'utf8'));
function safe(base,path){const dest=resolve(base,path.replace(/^\//,'')),rel=relative(base,dest);if(rel.startsWith('..')||isAbsolute(rel))throw Error('Unsafe hosted resource path');return dest;}
export async function installHostedResources(directory=root,configPath=resolve(directory,'content/custom/resource-origin.json'),archiveRoot=null){
 const config=await read(configPath);
 if(!config.repository||!config.commit)return null;
 if(!/^[\w.-]+\/[\w.-]+$/.test(config.repository)||!/^[a-f0-9]{40}$/.test(config.commit))throw Error('Hosted resources require a repository and full immutable commit SHA');
 const stage=archiveRoot||resolve(directory,'.cache/hosted-resources');
 if(!archiveRoot){
  await mkdir(stage,{recursive:true});
  const response=await fetch(`https://codeload.github.com/${config.repository}/tar.gz/${config.commit}`,{signal:AbortSignal.timeout(300000)});
  if(!response.ok)throw Error('Resource archive HTTP '+response.status);
  const archive=resolve(stage,'resources.tar.gz');await writeFile(archive,new Uint8Array(await response.arrayBuffer()));
  const extract=spawnSync('tar',['-xzf',archive,'--strip-components=1','-C',stage],{encoding:'utf8'});
  if(extract.status!==0)throw Error('Resource archive extraction failed: '+extract.stderr);
 }
 const inventory=await read(resolve(stage,'inventory.json'));
 // Validate the complete immutable set before changing the build tree.
 for(const f of inventory.inventory){const bytes=await readFile(safe(resolve(stage,'public'),f.path));if(bytes.length!==f.bytes||hash(bytes)!==f.sha256)throw Error('Hosted resource checksum mismatch: '+f.path);}
 // The two generated FX indexes are merged by installSupplement, never overwritten wholesale.
 for(const f of inventory.inventory){
  if(['/assets/local/fx/index.json','/assets/local/fx/textures.json'].includes(f.path))continue;
  const dest=safe(resolve(directory,'public'),f.path);
  let previous;try{previous=await readFile(dest);}catch(e){if(e.code!=='ENOENT')throw e;}
  if(previous){if(hash(previous)!==f.sha256)throw Error('Existing resource differs from pinned pack: '+f.path);continue;}
  await mkdir(dirname(dest),{recursive:true});await copyFile(safe(resolve(stage,'public'),f.path),dest);
 }
 const pack=resolve(directory,'.cache/hosted-costume-install');await mkdir(pack,{recursive:true});
 await copyFile(resolve(stage,'metadata/costume-supplement.json'),resolve(pack,'supplement.json'));
 try{await symlink(resolve(stage,'public/assets/local/fx'),resolve(pack,'files'),'dir');}catch(e){if(e.code!=='EEXIST')throw e;}
 const result=await installSupplement(directory,pack);
 return {files:inventory.files,bytes:inventory.bytes,costumeResources:result.resources};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(await installHostedResources(process.argv[2]||root,process.argv[3],process.argv[4]));

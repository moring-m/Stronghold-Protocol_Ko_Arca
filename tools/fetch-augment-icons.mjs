// Preserve older icon paths: existing match records retain the original icon URL.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createAugmentCatalog,augmentIcon} from '../shared/augments.js';
const root=process.cwd(),verifyOnly=process.argv.includes('--verify-only');
const data=Object.fromEntries(await Promise.all(['chess','items','bonds'].map(async k=>[k,JSON.parse(await readFile(root+'/content/production/data/'+k+'.json'))])));
const report=JSON.parse(await readFile(root+'/content/custom/augments/icons.json'));
const byPath=new Map(report.map(e=>[e.path,e]));
const required=new Set([4,7,10].flatMap(r=>createAugmentCatalog(data,r).filter(a=>!a.iconBond).map(augmentIcon)));
for(const path of required)if(!byPath.has(path))throw Error('Unknown augment icon: '+path);
if(!verifyOnly)await mkdir(root+'/public/assets/custom/augments',{recursive:true});
for(const entry of report){
 if(!/^\/assets\/custom\/augments\/[A-Za-z0-9_-]+\.png$/.test(entry.path))throw Error('Invalid icon path: '+entry.path);
 let body;
 if(verifyOnly)body=await readFile(root+'/content/production'+entry.path);
 else{const response=await fetch(entry.source);if(!response.ok)throw Error(entry.path+': '+response.status);body=Buffer.from(await response.arrayBuffer());}
 if(body.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Not PNG: '+entry.path);
 const blob=createHash('sha1').update('blob '+body.length+'\0').update(body).digest('hex');
 const sha256=createHash('sha256').update(body).digest('hex');
 if(blob!==entry.gitBlob||sha256!==entry.sha256||body.length!==entry.bytes)throw Error('Source checksum mismatch: '+entry.path);
 if(!verifyOnly)await writeFile(root+'/public'+entry.path,body);
}
if(!verifyOnly){
 await mkdir(root+'/content/production/assets/custom/augments',{recursive:true});
 for(const entry of report)await copyFile(root+'/public'+entry.path,root+'/content/production'+entry.path);
 const resourcePath=root+'/content/production/resources.json',resources=JSON.parse(await readFile(resourcePath));
 const files=new Map(resources.files.map(f=>[f.path,f]));
 for(const f of report)files.set(f.path,{path:f.path,local:true,sources:[f.path],sha256:f.sha256,bytes:f.bytes});
 resources.files=[...files.values()].sort((a,b)=>a.path.localeCompare(b.path));
 resources.version=createHash('sha256').update(JSON.stringify(resources.files)).digest('hex').slice(0,20);
 resources.estimatedBytes=resources.files.reduce((n,f)=>n+(f.bytes??256*1024),0);
 resources.estimatedStorageBytes=Math.ceil(resources.estimatedBytes*2.2);
 if('totalBytes'in resources)resources.totalBytes=resources.files.reduce((n,f)=>n+(f.bytes||0),0);
 await writeFile(resourcePath,JSON.stringify(resources));
}
console.log('Verified original-game augment icons:',report.length,'(active:',required.size+', legacy paths retained)');

// Export the complete, already-tested local catalogue and working tree without touching the live server.
import {readFile,writeFile,mkdir,copyFile,readdir,stat,cp} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const catalogOnly=process.argv.includes('--catalog-only');
const out=resolve((process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : null)||join(root,'.cache/production-release'));
if(out===root)throw Error('Export directory must be separate from the source checkout.');
if(!catalogOnly) await mkdir(out,{recursive:true});
const read=async p=>JSON.parse(await readFile(join(root,p),'utf8'));
const overlay=join(root,'.cache/ursus-data');
const manifest=await read('.cache/ursus-data/assets.json');
const base=await read('public/vendor/browser-resources.json');
const files=new Map(base.files.map(f=>[f.path,f]));
for(const path of ['.cache/ursus-voice-resources.json','.cache/skin-resources.json','.cache/skill-sound-resources.json','.cache/ursus-band-resources.json','.cache/upstream-recruit-resources.json']){
 for(const f of (await read(path)).files)files.set(f.path,f);
}
// Chinese dub is intentionally disabled; do not retain orphaned download entries.
for(const path of files.keys())if(/^\/assets\/audio\/voice\/(cn|voice_cn)\//.test(path))files.delete(path);
const paths=new Set();
function walk(value){if(typeof value==='string'&&value.startsWith('/assets/'))paths.add(value);else if(value&&typeof value==='object')Object.values(value).forEach(walk);}
walk(manifest);const local=await read('.cache/ursus-data/local-assets.json');walk(local);
// Additional custom operators and locally extracted board/VFX art are served by the application.
// They need an index entry even though they are not in the original upstream resource plan.
for(const path of paths)if(!files.has(path)){
 const info=await stat(join(root,'public',path.slice(1))).catch(()=>null);
 if(!info?.isFile())throw Error(`Missing production resource: ${path}`);
 files.set(path,{path,local:true,sources:[]});
}
for(const f of files.values())if(f.local){
 const bytes=await readFile(join(root,'public',f.path.slice(1)));
 f.sources=[f.path];f.sha256=createHash('sha256').update(bytes).digest('hex');f.bytes=bytes.length;
}
// Supply normalization metadata for custom Spine models too.
function models(value){if(!value||typeof value!=='object')return;
 if(value.atlas&&Array.isArray(value.textures)&&files.has(value.atlas)){
  const f=files.get(value.atlas);if(!f.local)f.atlas={textures:value.textures,pma:value.pma};
 }
 Object.values(value).forEach(models);
}models(manifest);
const list=[...files.values()].sort((a,b)=>a.path.localeCompare(b.path));
const version=createHash('sha256').update(JSON.stringify(list)).digest('hex').slice(0,20);
const index={...base,version,files:list,estimatedBytes:(base.estimatedBytes||0)+list.filter(f=>f.local).reduce((n,f)=>n+f.bytes,0)};
if(!catalogOnly){
const names=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{cwd:root}).toString().split('\0').filter(Boolean);
for(const name of names){
 if(!/^(server\/|shared\/|public\/|tools\/|docs\/research\/|deploy\/ec2\/|content\/|package(?:-lock)?\.json$|Dockerfile$|\.dockerignore$|LICENSE$|NOTICE\.md$)/.test(name))continue;
 const info=await stat(join(root,name)).catch(()=>null);if(!info?.isFile())continue;
 await mkdir(dirname(join(out,name)),{recursive:true});await copyFile(join(root,name),join(out,name));
}
await cp(overlay,join(out,'data'),{recursive:true});
// Preserve supplied emotes and all local custom/extracted art; downloaded baseline art stays in browser caches.
for(const dir of ['emotes','custom','local'])await cp(join(root,'public/assets',dir),join(out,'public/assets',dir),{recursive:true});
await writeFile(join(out,'production-resources.json'),JSON.stringify(index));
let docker=await readFile(join(root,'Dockerfile'),'utf8');
docker=docker.replace('COPY data ./data','COPY data ./data\nCOPY production-resources.json ./production-resources.json');
docker=docker.replace('node tools/build-browser-resources.mjs','cp production-resources.json public/vendor/browser-resources.json && cp tools/assets/atlas.mjs public/vendor/resource-atlas.mjs');
await writeFile(join(out,'Dockerfile'),docker);
let ignore=await readFile(join(root,'.dockerignore'),'utf8');ignore+='\n!public/assets/custom\n!public/assets/local\n';await writeFile(join(out,'.dockerignore'),ignore);
}
const report={builtAt:new Date().toISOString(),sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root}).toString().trim(),workingTree:true,resourceVersion:version,resources:list.length,localResources:list.filter(f=>f.local).length,requiredAssetPaths:paths.size,customBand:manifest.bands.band_custom_ursus_kaschey};
if(!catalogOnly) await writeFile(join(out,'production-report.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({out,...report},null,2));

if(catalogOnly || process.argv.includes('--publish-data')){
 const catalog=join(root,'content/production');await mkdir(catalog,{recursive:true});
 await cp(overlay,join(catalog,'data'),{recursive:true});
 await writeFile(join(catalog,'resources.json'),JSON.stringify(index));
 await writeFile(join(catalog,'report.json'),JSON.stringify(report,null,2));
 for(const f of list.filter(f=>f.local)){
  const path=f.path.slice('/assets/'.length),dest=join(catalog,'assets',path);
  await mkdir(dirname(dest),{recursive:true});await copyFile(join(root,'public',f.path.slice(1)),dest);
 }
 console.log('Prepared Git/Docker production catalogue: content/production');
}

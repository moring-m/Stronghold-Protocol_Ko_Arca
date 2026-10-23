// Convert explicit client costume replacement tables into an additive FX pack.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const [baseRoot,skinRoot,followRoot,output]=process.argv.slice(2);
if(!output)throw Error('Usage: prepare-costume-fx.mjs BASE_ROOT SKIN_ROOT FOLLOWUP_ROOT OUTPUT');
const base=await read(resolve(baseRoot,'public/assets/local/fx/index.json'));
const baselineTextures=await read(resolve(baseRoot,'public/assets/local/fx/textures.json'));
const baseManifest=await read(resolve(baseRoot,'data/local-fx.json'));
const raw=await read(resolve(skinRoot,'skin-effects.json'));
const follow=await read(resolve(followRoot,'skin-projectiles.json'));
const catalogs=new Map(raw.catalog.map(s=>[s.skinId,s]));
const layers=await Promise.all([skinRoot,followRoot].map(async root=>({root,index:await read(resolve(root,'public/assets/local/fx/index.json')),textures:await read(resolve(root,'public/assets/local/fx/textures.json')),manifest:await read(resolve(root,'data/local-fx.json'))})));
const incoming=Object.assign({},...layers.map(l=>l.index.prefabs));
const allProjectiles={...follow.projectiles,...base.projectiles};
const extra={format:'fx-supplement',version:1,units:{},skills:{},projectiles:{},skins:{},prefabs:{},textures:{},costumes:{},groups:{'fx/prefabs':{},'fx/tex':{},'fx/mesh':{}},files:[]};
const wanted=new Set(),shotWanted=new Set(),warnings=[];
const replace=(k,map)=>map[k]||k;
for(const row of raw.skins){
 if(!row.skinIds.length||!row.container.includes('/battle/prefabs/skins/character/'))continue;
 for(const id of row.skinIds){
  const meta=catalogs.get(id);if(!meta||!base.units[meta.charId])continue;
  const alias='skin_'+meta.battleSkin.skinOrPrefabId.replace(/[^A-Za-z0-9_]/g,'_');
  const effects={},projectiles={};
  for(const component of row.components){
   for(const pair of component.fields?._replaceEffectPairs||[]){
    const from=pair.fromEffect?.toLowerCase(),to=pair.toEffect?.toLowerCase();
    if(from&&to&&(base.prefabs[to]||incoming[to])){effects[from]=to;wanted.add(to);}else warnings.push({skin:id,pair});
   }
   if(component.fields?._useFakeProjectile)for(const cfg of component.fields._fakeProjectileConfigs||[]){
    const origin=cfg.originProjectileKey?.toLowerCase(),graphic=cfg.graphicProjectileKey?.toLowerCase();
    if(origin&&graphic&&allProjectiles[graphic]){
     projectiles[origin]={graphic,mount:cfg._fakeMuzzlePoint};shotWanted.add(graphic);
     for(const k of allProjectiles[graphic].effects||[])wanted.add(replace(k,effects));
    }else warnings.push({skin:id,projectile:cfg});
   }
  }
  extra.skins[alias]={source:row.container,graphic:row.graphic||base.units[meta.charId].graphic,points:row.points};
  const spec={charId:meta.charId,skinId:id,mount:alias,effects,projectiles};
  extra.costumes[alias]=spec;extra.costumes[id]=spec;
 }
}
const shots=[...shotWanted],seenShots=new Set();
while(shots.length){const key=shots.pop();if(seenShots.has(key))continue;seenShots.add(key);const entry=allProjectiles[key];if(!entry)throw Error('Missing projectile '+key);if(!base.projectiles[key])extra.projectiles[key]=entry;for(const p of entry.projectiles||[])shots.push(p);}
const seen=new Set(),textures=new Set(),meshes=new Set(),pending=[...wanted];
while(pending.length){const key=pending.pop();if(seen.has(key)||base.prefabs[key])continue;seen.add(key);const layer=[...layers].reverse().find(l=>l.index.prefabs[key]);if(!layer)throw Error('Missing FX '+key);const summary=layer.index.prefabs[key];const desc=await read(resolve(layer.root,'public/assets/local/fx',summary.file));extra.prefabs[key]=summary;extra.groups['fx/prefabs'][key]=layer.manifest.groups['fx/prefabs'][key];for(const ref of desc.refs||[])if(incoming[ref]||base.prefabs[ref])pending.push(ref);for(const k of desc.textures||[])textures.add(k);for(const k of desc.meshes||[])if(!k.startsWith('builtin:'))meshes.add(k);}
for(const key of textures)if(!baselineTextures.textures[key]){const layer=[...layers].reverse().find(l=>l.textures.textures[key]);if(!layer)throw Error('Missing texture '+key);extra.textures[key]=layer.textures.textures[key];extra.groups['fx/tex'][key]=layer.manifest.groups['fx/tex'][key];}
for(const key of meshes)if(!baseManifest.groups['fx/mesh'][key]){const layer=[...layers].reverse().find(l=>l.manifest.groups['fx/mesh'][key]);if(!layer)throw Error('Missing mesh '+key);extra.groups['fx/mesh'][key]=layer.manifest.groups['fx/mesh'][key];}
const paths=new Set();for(const rows of Object.values(extra.groups))for(const e of Object.values(rows))for(const path of[e.path,e.half])if(path)paths.add(path);
for(const path of [...paths].sort()){
 if(!path.startsWith('/assets/local/fx/')||path.includes('..'))throw Error('Unsafe resource path');
 let bytes;for(const layer of [...layers].reverse()){try{bytes=await readFile(resolve(layer.root,'public',path.slice(1)));break;}catch(e){if(e.code!=='ENOENT')throw e;}}
 if(!bytes)throw Error('Missing payload '+path);
 const dest=resolve(output,'files',path.slice('/assets/local/fx/'.length));await mkdir(dirname(dest),{recursive:true});await writeFile(dest,bytes);extra.files.push({path,bytes:bytes.length,sha256:hash(bytes)});
}
await mkdir(output,{recursive:true});await writeFile(resolve(output,'supplement.json'),JSON.stringify(extra));
const report={matchedSkins:raw.summary.matchedSkins,costumes:Object.keys(extra.costumes).length/2,effectReplacements:Object.values(extra.costumes).filter((_,i)=>i%2===0).reduce((n,s)=>n+Object.keys(s.effects).length,0),prefabs:Object.keys(extra.prefabs).length,projectiles:Object.keys(extra.projectiles).length,textures:Object.keys(extra.textures).length,meshes:Object.keys(extra.groups['fx/mesh']).length,files:extra.files.length,bytes:extra.files.reduce((n,f)=>n+f.bytes,0),warnings};
await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));

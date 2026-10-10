// Local costume catalog: metadata up front, images/models lazily cached by the preview server.
import {readFile,writeFile,mkdir,statfs} from 'node:fs/promises';
import {join} from 'node:path';
import {RAW} from './assets/sources.mjs';
import {parseSkel} from './assets/skel.mjs';
import {atlasInfo} from './assets/atlas.mjs';
import {resolveRoles} from './assets/anim-roles.mjs';
import {spineAttackTiming} from '../shared/attackTiming.js';
export async function buildSkins(root,dir,{charIds=null,incremental=false}={}){
 const read=async p=>JSON.parse(await readFile(p,'utf8'));
 const zh=await read(join(root,'.cache/skins/zh.json')),ko=await read(join(root,'.cache/skins/ko.json'));
 const names=(await read(join(root,'content/i18n/skin-names-ko.json')).catch(()=>({}))).entries || {};
 const chess=await read(join(dir,'chess.json')),assets=await read(join(dir,'assets.json'));const chars=new Set(charIds||Object.values(chess).map(c=>c.charId));
 const candidates=Object.values(zh.charSkins).filter(s=>chars.has(s.charId)&&s.displaySkin?.skinName);
 const files=(await read(join(root,'.cache/skin-resources.json')).catch(()=>({files:[]}))).files,catalog=new Map(),errors=[];let done=0,missing=0;
 for(const c of Object.values(chess))if(c.skins?.length)catalog.set(c.charId,c.skins);
 await mkdir(join(root,'.cache/skin-metadata'),{recursive:true});
 async function cached(url){const path=join(root,'.cache/skin-metadata',Buffer.from(url).toString('base64url'));try{return await readFile(path)}catch{}const r=await fetch(url,{signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(`${r.status}`);const b=Buffer.from(await r.arrayBuffer());const disk=await statfs(root);if(disk.bavail*disk.bsize>b.length+16*1024*1024)await writeFile(path,b);return b;}
 async function model(s,id,side,folder=side){
  const file=s.battleSkin.skinOrPrefabId.replace(/#/g,'_'),base=`${RAW.fexli}spine/${s.charId}/${file}/${folder}/`;
  const [bytes,atlas]=await Promise.all([cached(base+file+'.skel'),cached(base+file+'.atlas')]);
  const info=atlasInfo(atlas.toString()),sk=parseSkel(bytes,new Set(info.regions));const prefix=`/assets/custom/skins/${id}/${side}`;
  const textures=info.pages.map(p=>`${prefix}/${p.replace(/[^A-Za-z0-9._-]/g,'_')}`);
  files.push({path:prefix+'/'+file+'.skel',sources:[base+file+'.skel']},{path:prefix+'/'+file+'.atlas',sources:[base+file+'.atlas'],atlas:{textures,pma:false}});
  for(const [i,p]of info.pages.entries())files.push({path:textures[i],sources:[base+p]});
  return {skel:prefix+'/'+file+'.skel',atlas:prefix+'/'+file+'.atlas',textures,pma:false,animations:sk.durations,durations:sk.durations,hits:sk.hits,bounds:sk.bounds,anims:resolveRoles(sk.animations,{skillIndices:[0,1,2],durations:sk.durations})};
 }
 async function worker(){while(candidates.length){const s=candidates.shift(),id='skin_'+s.battleSkin.skinOrPrefabId.replace(/[^A-Za-z0-9_]/g,'_');if(incremental&&catalog.get(s.charId)?.some(e=>e.id===id))continue;try{
   let front;try{front=await model(s,id,'Front')}catch{front=await model(s,id,'Front','Spine')}let back=assets.chars[id]?.spine?.back||null;try{back=await model(s,id,'Back')}catch{}
   const avatar=`/assets/custom/skins/${id}/avatar.png`,portrait=`/assets/custom/skins/${id}/portrait.png`;
   files.push({path:avatar,sources:[RAW.yuanyan+'avatar/'+encodeURIComponent(s.avatarId)+'.png']},{path:portrait,sources:[RAW.yuanyan+'portrait/'+encodeURIComponent(s.portraitId)+'.png']});
   assets.chars[id]={avatar,portrait,spine:{front,back}};
   const entry={id,name:ko.charSkins[s.skinId]?.displaySkin?.skinName||names[s.displaySkin.skinName]||s.displaySkin.skinName,assets:{spine:id,avatar:id,portrait:id},attackTiming:{front:spineAttackTiming(front),back:spineAttackTiming(back)}};
   if(!catalog.has(s.charId))catalog.set(s.charId,[]);const entries=catalog.get(s.charId),at=entries.findIndex(e=>e.id===id);if(at<0)entries.push(entry);else entries[at]=entry;
  }catch(error){missing++;errors.push({charId:s.charId,skinId:s.skinId,message:error.message});}done++;if(done%20===0)console.log(`Skins ${done}, unavailable ${missing}`);}}
 await Promise.all(Array.from({length:8},worker));
 for(const c of Object.values(chess))if(!charIds||chars.has(c.charId))c.skins=catalog.get(c.charId)||[];
 await writeFile(join(root,'.cache/skin-errors.json'),JSON.stringify(errors,null,2));
 await writeFile(join(dir,'chess.json'),JSON.stringify(chess));await writeFile(join(dir,'assets.json'),JSON.stringify(assets));await writeFile(join(root,'.cache/skin-resources.json'),JSON.stringify({files:[...new Map(files.map(f=>[f.path,f])).values()]}));console.log(`Skins ready: ${done-missing}, unavailable ${missing}`);
}
if(process.argv[1]?.endsWith('build-skins.mjs'))await buildSkins(process.cwd(),join(process.cwd(),'.cache/ursus-data'));

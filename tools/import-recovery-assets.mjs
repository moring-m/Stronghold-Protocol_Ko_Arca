// Ingest the verified CN recovery archives; preserve all existing base assets and FX keys.
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {parseSkel} from './assets/skel.mjs';
import {atlasInfo} from './assets/atlas.mjs';
import {resolveRoles} from './assets/anim-roles.mjs';
import {costumeMountBindings} from './assets/costumeMounts.mjs';
import {indexAudio} from './assets/audio.mjs';
import {unitCombatSounds} from './assets/unit-combat-sounds.mjs';
const root=process.cwd(),read=async p=>JSON.parse(await readFile(resolve(root,p),'utf8')),write=async(p,x)=>{await mkdir(dirname(resolve(root,p)),{recursive:true});await writeFile(resolve(root,p),JSON.stringify(x));};
const incoming='.cache/cn-skin-recovery-20261024/extracted/cn-skin-recovery-20261024-004840-090300';
const models=await read('../Stronghold-Protocol_Ko_Arca_assets/metadata/recovery-models-20261024.json');
const graph=await read(incoming+'/unit-skill-projectiles.json'),skins=await read(incoming+'/costumes/skin-effects.json'),catalog=new Map(skins.catalog.map(s=>[s.skinId,s]));
const base=await read('public/assets/local/fx/index.json'),tex=await read('public/assets/local/fx/textures.json'),local=await read('content/production/data/local-fx.json');
const recoveryGroups={},files=new Map(),patch={chars:{},skills:{},modules:{},skinChoices:{},audio:{voice:{jp:{},kr:{}},sfx:{units:{},skinAliases:{}}}};
async function payload(url,from){const dest=resolve(root,'public'+url);await mkdir(dirname(dest),{recursive:true});if(from&&resolve(from)!==dest)await copyFile(from,dest);const bytes=await readFile(dest);files.set(url,{path:url,local:true,sources:[url],bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
for(const file of models.files)await payload(file.path,resolve(root,'../Stronghold-Protocol_Ko_Arca_assets/public'+file.path));
for(const r of models.models){
 const sides=r.skeletons.filter(s=>/FaceSwitcher\/(Front|Back)$/.test(s.node));if(!sides.length)continue;
 for(const id of r.skinIds){const meta=catalog.get(id),cid=meta.charId,isBase=!id.includes('@'),mount=isBase?cid:'skin_'+meta.battleSkin.skinOrPrefabId.replace(/[^A-Za-z0-9_]/g,'_');
  const spine={};for(const side of sides){const a=atlasInfo(await readFile(resolve(root,'public'+side.atlas),'utf8')),sk=parseSkel(await readFile(resolve(root,'public'+side.skeleton)),new Set(a.regions));if(sk.missingRegions.length)throw Error('Missing Spine regions '+id+': '+sk.missingRegions.join(','));
   spine[side.node.endsWith('/Front')?'front':'back']={skel:side.skeleton,atlas:side.atlas,textures:side.files.filter(x=>x.endsWith('.png')),pma:true,animations:sk.durations,hits:sk.hits,bounds:sk.bounds,anims:resolveRoles(sk.animations,{skillIndices:[0,1,2],durations:sk.durations})};}
  patch.chars[mount]={...(patch.chars[mount]||{}),spine};
  if(!isBase){const names={'char_499_kaitou@epoque#37':'비스듬한 햇살','char_4109_baslin@witch#5':'밤하늘의 별빛','char_4047_pianst@wild#8':'황야의 선율','char_4217_makoto@p3r#1':'영광의 증명'};
   (patch.skinChoices[cid]||=[]).push({id:mount,name:names[id]||meta.displaySkin.skinName,assets:{spine:mount,avatar:mount,portrait:mount}});}
 }
}
// Sprite names are not unique (avatar and portrait); dimensions select the correct version.
const sprite=await read(incoming+'/sprites/sprites.json');
for(const cid of Object.keys(patch.skinChoices).concat('char_4217_makoto')){
 const metas=[...catalog.values()].filter(s=>s.charId===cid);
 for(const s of metas){const isBase=!s.skinId.includes('@'),mount=isBase?(s.skinId.endsWith('#2')?cid+'_2':cid):'skin_'+s.battleSkin.skinOrPrefabId.replace(/[^A-Za-z0-9_]/g,'_');
  const take=(name,portrait)=>sprite.sprites.filter(x=>x.name===name).sort((a,b)=>portrait?b.width*b.height-a.width*a.height:a.width*a.height-b.width*b.height)[0];
  const av=take(s.avatarId,false),po=take(s.portraitId,true);if(!av||!po)continue;
  const entry=patch.chars[mount]||={};for(const [key,v]of [['avatar',av],['portrait',po]]){const url='/assets/local/recovery/sprites/'+v.file;await payload(url,resolve(root,incoming,'sprites',v.file));entry[key]=url;}
 }
}
for(const s of sprite.sprites.filter(s=>/^(skill_icon_skchr_makoto_|uniequip_002_makoto)/.test(s.name))){const url='/assets/local/recovery/sprites/'+s.file;await payload(url,resolve(root,incoming,'sprites',s.file));if(s.name.startsWith('skill_icon_'))patch.skills[s.name.slice(11)]=url;else patch.modules[s.name]=url;}
for(const layer of ['unit-fx','costumes']){
 const lr=resolve(root,incoming,layer),idx=await read(lr+'/public/assets/local/fx/index.json'),tt=await read(lr+'/public/assets/local/fx/textures.json'),manifest=await read(lr+'/data/local-fx.json');
 for(const [key,v]of Object.entries(idx.prefabs))if(!base.prefabs[key])base.prefabs[key]=v;
 for(const [key,v]of Object.entries(tt.textures))tex.textures[key]??=v;
 for(const [group,entries]of Object.entries(manifest.groups)){if(group==='fx')continue;local.groups[group]??={};for(const[key,v]of Object.entries(entries)){(recoveryGroups[group]??={})[key]=v;local.groups[group][key]??=v;for(const url of [v.path,v.half])if(url)await payload(url,resolve(lr,'public'+url));}}
}
for(const section of ['units','skills','projectiles'])for(const[key,v]of Object.entries(graph[section]))base[section][key]??=v;
const follow=await read(incoming+'/costume-wiring/skin-projectiles.json');for(const[key,v]of Object.entries(follow.projectiles||{}))base.projectiles[key]??=v;
for(const row of skins.skins){if(!row.container.includes('/battle/prefabs/skins/character/'))continue;
 for(const id of row.skinIds){const meta=catalog.get(id);if(!meta||!id.includes('@'))continue;const mount='skin_'+meta.battleSkin.skinOrPrefabId.replace(/[^A-Za-z0-9_]/g,'_'),effects={},projectiles={};
  for(const c of row.components||[]){for(const p of c.fields?._replaceEffectPairs||[])if(p.fromEffect&&p.toEffect)effects[p.fromEffect.toLowerCase()]=p.toEffect.toLowerCase();if(c.fields?._useFakeProjectile)for(const p of c.fields._fakeProjectileConfigs||[])projectiles[p.originProjectileKey.toLowerCase()]={graphic:p.graphicProjectileKey.toLowerCase(),mount:p._fakeMuzzlePoint};}
  base.skins[mount]={source:row.container,graphic:row.graphic||base.units[meta.charId]?.graphic,points:row.points,mountBindings:costumeMountBindings(row)};base.costumes[mount]=base.costumes[id]={charId:meta.charId,skinId:id,mount,effects,projectiles};
 }
}
local.groups.fx.index.prefabs=Object.keys(base.prefabs).length;local.groups.fx.textures.count=Object.keys(tex.textures).length;
await write('public/assets/local/fx/index.json',base);await write('public/assets/local/fx/textures.json',tex);
await payload('/assets/local/fx/index.json');await payload('/assets/local/fx/textures.json');await write('content/production/data/local-fx.json',local);await write('content/custom/recovery/fx-groups.json',recoveryGroups);
// Encode only referenced missing SFX, using verified extracted clips.
const raw=await read('.cache/skin-audit/audio_data.json'),audio=indexAudio(raw),audioReport=await read(incoming+'/sfx/audio-report.json');const clips=new Map(audioReport.files.map(f=>[f.name.toLowerCase(),f]));
const chess=await read('content/production/data/chess.json'),current=await read('content/production/data/assets.json');
async function sound(value){if(typeof value==='string'&&value.startsWith('/assets/audio/sfx/')){
 const leaf=basename(value,'.mp3').toLowerCase(),clip=clips.get(leaf);if(!clip)return value;
 const url='/assets/local/audio/sfx/'+leaf+'.mp3';const dest=resolve(root,'public'+url);await mkdir(dirname(dest),{recursive:true});execFileSync('ffmpeg',['-v','error','-y','-i',resolve(root,incoming,'sfx',clip.file.replaceAll('\\','/')),'-codec:a','libmp3lame','-b:a','160k',dest]);await payload(url);return url;
 }if(Array.isArray(value))return Promise.all(value.map(sound));if(value&&typeof value==='object'){const out={};for(const[k,v]of Object.entries(value))out[k]=await sound(v);return out;}return value;}
for(const cid of ['char_4217_makoto','char_499_kaitou','char_4109_baslin','char_4047_pianst']){
 const records=Object.values(chess).filter(c=>c.charId===cid),skills=records[0]?.skills||[];const {unit}=unitCombatSounds(audio,cid,skills,{});patch.audio.sfx.units[cid]={...current.audio.sfx.units[cid],...await sound(unit)};
}
const makoto=patch.audio.sfx.units.char_4217_makoto;
const clip=async name=>sound('/assets/audio/sfx/'+name+'.mp3');
makoto.forms={
 makoto_s1:{attack:await clip('p_atk_pskptldrfr_d'),hit:await clip('p_imp_pskptldr_d')},
 makoto_s1_heal:{attack:await clip('p_atk_pskptldrh_d'),hit:await clip('p_imp_pskptldrh_d')},
 makoto_s2:{attack:await clip('p_atk_pskptldr_h'),hit:await clip('p_imp_pskptldr_h')},
 makoto_s3a:{attack:await clip('p_atk_pskptldr_s1'),attackVariants:await Promise.all(['p_atk_pskptldr_s1','p_atk_pskptldr_s2','p_atk_pskptldr_s3'].map(clip))},
};
makoto.fx={
 persona:await clip('p_skill_pskptldr'),
 makotoAttackRange:await clip('p_skill_pskptldrflda'),
 makotoHealRange:await clip('p_skill_pskptldrfldh'),
 makotoAllOutFlash:await clip('p_atk_pskptldrndfl'),
 makotoAllOutStart:await clip('p_atk_pskptldrnd'),
 makotoAllOut:await clip('p_imp_pskptldrnd'),
 makotoExecute:await clip('p_imp_pskptldrskl_h'),
 makotoHeal:await clip('p_imp_pskptldrh_s'),
 makotoPhysicalHit:await clip('p_imp_pskptldrp_s'),
 makotoArtsHit:await clip('p_imp_pskptldrm_s'),
};
const voices=await read('../Stronghold-Protocol_Ko_Arca_assets/metadata/recovery-voices-20261024.json');
for(const f of voices.files)await payload(f.path,resolve(root,'../Stronghold-Protocol_Ko_Arca_assets/public'+f.path));
for(const [cid,slots]of Object.entries(voices.slotAssets))for(const lang of ['jp','kr'])patch.audio.voice[lang][cid]=Object.fromEntries(Object.entries(slots).map(([slot,lines])=>[slot,lines.map(asset=>'/assets/audio/voice/'+(lang==='kr'&&cid!=='char_4217_makoto'?'voice_kr':'voice')+'/'+asset.toLowerCase()+'.mp3')]));
patch.files=[...files.values()];await write('content/custom/recovery/assets.json',patch);
console.log('Recovered skins',Object.keys(patch.skinChoices),'resources',patch.files.length);

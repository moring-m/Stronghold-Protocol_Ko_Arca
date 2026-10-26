import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
export function mergeSkinSfx(base,patch){
 const out={...base,...patch};
 for(const key of ['skills','attacks','hits','skillCombat','mix','attackMix','hitMix'])if(base?.[key]||patch?.[key])out[key]={...base?.[key],...patch?.[key]};
 // A skin's explicit strike/impact wins over an inherited base skill bank.
 for(const [table,role]of [['attacks','attack'],['hits','hit']])for(const index of Object.keys(patch?.[table]||{})){
  if(!out.skillCombat?.[index] || patch?.skillCombat?.[index]?.[role])continue;
  const combat={...out.skillCombat[index]};delete combat[role];
  out.skillCombat[index]=combat;
 }
 return out;
}
export async function buildSkinSfx(root,dir){
 let data;try{data=JSON.parse(await readFile(resolve(root,'content/custom/audio/skin-sfx.json'),'utf8'));}catch(e){if(e.code==='ENOENT')return [];throw e;}
 const file=resolve(dir,'assets.json'),assets=JSON.parse(await readFile(file,'utf8'));const sfx=assets.audio.sfx;
 for(const [id,patch]of Object.entries(data.units)){const {baseCharId,...fields}=patch;sfx.units[id]=mergeSkinSfx(sfx.units[baseCharId]||{},fields);}
 sfx.skinAliases=data.aliases;
 await writeFile(file,JSON.stringify(assets));return data.files;
}

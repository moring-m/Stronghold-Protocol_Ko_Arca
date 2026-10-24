import {readFile,writeFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {indexAudio} from './assets/audio.mjs';import {sakikoSounds} from './assets/sakiko-sounds.mjs';import {RAW} from './assets/sources.mjs';
export async function buildSakikoSounds(root,dir){
 const audio=indexAudio(JSON.parse(await readFile(resolve(root,'.cache/gamedata/excel/audio_data.json')))),{unit,paths}=sakikoSounds(audio);
 if(!unit.notes.projectile_chr_oblvns.launch||!unit.skills[2])throw Error('Official Sakiko audio banks are missing');
 const path=resolve(dir,'assets.json'),assets=JSON.parse(await readFile(path));assets.audio.sfx.units.char_4182_oblvns={...assets.audio.sfx.units.char_4182_oblvns,...unit};await writeFile(path,JSON.stringify(assets));
 return paths.map(path=>({path:'/assets/audio/sfx/'+path,sources:[RAW.aa2voice+path]}));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const root=process.cwd(),dir=resolve(process.argv[2]||'content/production/data'),files=await buildSakikoSounds(root,dir);
 const path=resolve(process.argv[3]||'content/production/resources.json'),catalog=JSON.parse(await readFile(path));const all=new Map(catalog.files.map(f=>[f.path,f]));for(const f of files)if(!all.has(f.path))all.set(f.path,f);catalog.files=[...all.values()].sort((a,b)=>a.path.localeCompare(b.path));catalog.version=createHash('sha256').update(JSON.stringify(catalog.files)).digest('hex').slice(0,20);await writeFile(path,JSON.stringify(catalog));console.log(`Sakiko SFX: ${files.length} official files`);
}

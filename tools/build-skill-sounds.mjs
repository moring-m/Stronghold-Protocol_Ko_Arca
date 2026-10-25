// Resolve every equipped skill against the official bank, including custom/recruit operators.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {indexAudio,skillStartPaths} from './assets/audio.mjs';
import {skillCombatSounds} from './assets/skill-combat-sounds.mjs';
import {unitCombatSounds} from './assets/unit-combat-sounds.mjs';
import {RAW} from './assets/sources.mjs';
export async function buildSkillSounds(root,dir){
 const read=async p=>JSON.parse(await readFile(p,'utf8'));
 const audio=indexAudio(await read(join(root,'.cache/gamedata/excel/audio_data.json')));
 const chess=await read(join(dir,'chess.json')),assets=await read(join(dir,'assets.json'));
 assets.audio.bgm.prep=assets.audio.bgm.lobby; // official mode theme during rest; never retain a battle loop
 const units=assets.audio.sfx.units,files=[],audit=[];
 const leak=audio.bank('battle.ON_ENEMY_REACHED_EXIT')[0];
 if(leak){assets.audio.sfx.battle.leak=`/assets/audio/sfx/${leak}`;files.push({path:assets.audio.sfx.battle.leak,sources:[RAW.aa2voice+leak]});}
 for(const [id,records]of Map.groupBy(Object.values(chess),c=>c.charId)){
  if(!id)continue;
  const skills=new Map(records.flatMap(c=>c.skills||[c.skill]).filter(Boolean).map(s=>[s.index,s]));
  const mapping={},combat={};
  for(const [i,s]of skills){
   const paths=skillStartPaths(audio,s.skillId,s);
   const sound=paths[0];mapping[i]=null;
   if(sound){const path=`/assets/audio/sfx/${sound}`;mapping[i]=path;files.push({path,sources:[RAW.aa2voice+sound]});}
   const resolved=skillCombatSounds(audio,id,i);
   if(Object.keys(resolved).length){combat[i]={};for(const [role,v]of Object.entries(resolved)){
    const path=`/assets/audio/sfx/${v.path}`;combat[i][role]=path;
    if(v.mix)(combat[i].mix ||= {})[role]=v.mix;
    files.push({path,sources:[RAW.aa2voice+v.path]});
   }}
   audit.push({charId:id,skillId:s.skillId,index:i,sound:sound||null,combat:resolved,abilityBanks:Object.fromEntries(audio.unitBanks.get(id)||[])});
  }
  const resolved=unitCombatSounds(audio,id,[...skills.values()],units[id]);
  units[id]={...resolved.unit,skills:mapping,skillCombat:combat};
  for(const path of resolved.paths)files.push({path:`/assets/audio/sfx/${path}`,sources:[RAW.aa2voice+path]});
 }
 await writeFile(join(dir,'assets.json'),JSON.stringify(assets));
 await writeFile(join(root,'.cache/skill-sound-resources.json'),JSON.stringify({files:[...new Map(files.map(f=>[f.path,f])).values()]}));
 await writeFile(join(root,'docs/SKILL-SOUND-AUDIT.json'),JSON.stringify(audit,null,2)+'\n');
 console.log(`Skill sound banks: ${audit.filter(s=>s.sound).length}/${audit.length}; absent banks remain silent.`);
}
if(process.argv[1]?.endsWith('build-skill-sounds.mjs'))await buildSkillSounds(process.cwd(),join(process.cwd(),'.cache/ursus-data'));

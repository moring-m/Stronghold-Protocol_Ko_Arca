import{readFile,writeFile}from'node:fs/promises';import{resolve}from'node:path';import{fileURLToPath}from'node:url';import{createHash}from'node:crypto';
import{indexAudio,skillStartPaths}from'./assets/audio.mjs';import{unitCombatSounds}from'./assets/unit-combat-sounds.mjs';import{RAW}from'./assets/sources.mjs';
export async function buildMissingSfx(root,dir){
 const read=async p=>JSON.parse(await readFile(p)),a=await read(resolve(dir,'assets.json')),chess=await read(resolve(dir,'chess.json')),audio=indexAudio(await read(resolve(root,'.cache/gamedata/excel/audio_data.json'))),files=new Map(),audit=[];
 const add=(path)=>files.set(path,{path,sources:[RAW.aa2voice+path.replace('/assets/audio/sfx/','')]});
 for(const[id,cs]of Map.groupBy(Object.values(chess),c=>c.charId)){
  if(!id||id==='char_4182_oblvns')continue;
  const skills=[...new Map(cs.flatMap(c=>c.skills||[c.skill]).filter(Boolean).map(s=>[s.index,s])).values()],old=a.audio.sfx.units[id],{unit}=unitCombatSounds(audio,id,skills,old),changes={};
  for(const role of ['attack','hit','born','die'])if(!old?.[role]&&unit[role]){changes[role]=unit[role];add(unit[role]);}
  for(const s of skills){if(typeof old?.skills?.[s.index]==='string'&&old.skills[s.index])continue;const path=skillStartPaths(audio,s.skillId,s)[0];if(!path||/(?:_loop|_lp)\d*\.mp3$/i.test(path))continue;(changes.skills||={})[s.index]='/assets/audio/sfx/'+path;add(changes.skills[s.index]);}
  if(!Object.keys(changes).length)continue;
  const dest=a.audio.sfx.units[id]||={};for(const role of ['attack','hit','born','die'])if(changes[role]){dest[role]=changes[role];if(unit.mix?.[role])(dest.mix||={})[role]=unit.mix[role];}
  if(changes.skills)dest.skills={...dest.skills,...changes.skills};audit.push({charId:id,name:cs[0].name,changes});
 }
 const ice=audio.bank('battle.ON_PROJECTILE_REACH.projectile_chr_sntlla_s2')[0];
 if(ice&&!a.audio.sfx.units.char_341_sntlla?.fx?.iceSpike){const unit=a.audio.sfx.units.char_341_sntlla||={};(unit.fx||={}).iceSpike='/assets/audio/sfx/'+ice;add(unit.fx.iceSpike);audit.push({charId:'char_341_sntlla',name:'산탈라',changes:{fx:{iceSpike:unit.fx.iceSpike}}});}
 await writeFile(resolve(dir,'assets.json'),JSON.stringify(a));return{files:[...files.values()],audit};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const result=await buildMissingSfx(process.cwd(),resolve(process.argv[2]||'content/production/data')),path='content/production/resources.json',catalog=JSON.parse(await readFile(path)),files=new Map(catalog.files.map(f=>[f.path,f]));for(const f of result.files)if(!files.has(f.path))files.set(f.path,f);catalog.files=[...files.values()].sort((a,b)=>a.path.localeCompare(b.path));catalog.version=createHash('sha256').update(JSON.stringify(catalog.files)).digest('hex').slice(0,20);await writeFile(path,JSON.stringify(catalog));await writeFile('/tmp/missing-sfx-audit.json',JSON.stringify(result.audit,null,2));console.log(`Missing SFX repaired: ${result.audit.length} operators, ${result.files.length} unique files`);
}

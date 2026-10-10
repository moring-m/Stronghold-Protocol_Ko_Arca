// Official voice slots and language availability; preview streams files through its persistent cache.
import {readFile,writeFile} from 'node:fs/promises';
import {indexVoice,VOICE_BATTLE_SLOTS,VOICE_DIRS} from './assets/audio.mjs';
import {RAW} from './assets/sources.mjs';
import {voiceLanguageFor} from './assets/voiceAvailability.mjs';
const tablePath='.cache/gamedata/excel/charword_table.json';
const table=JSON.parse(await readFile(tablePath,'utf8').then(async b=>{if(!process.argv.includes('--refresh'))return b;throw Error('Refresh requested')}).catch(async()=>{const r=await fetch('https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/charword_table.json');if(!r.ok)throw Error('Voice table unavailable');const b=await r.text();await writeFile(tablePath,b);return b}));
const availabilityPath='.cache/voice-kr-files.json';
let availability=await readFile(availabilityPath,'utf8').then(JSON.parse).catch(()=>null);
if(!availability||process.argv.includes('--refresh')||!availability.checkedAt||Date.now()-availability.checkedAt>86400000){
 try{
  const get=async path=>{const r=await fetch('https://api.github.com/repos/ArknightsAssets/ArknightsAssets2/'+path,{headers:{'User-Agent':'Stronghold-Protocol-voice-audit'},signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error(`Voice inventory HTTP ${r.status}`);return r.json();};
  const root=await get('contents/assets/dyn/audio/sound_beta_2?ref=voice'),dir=root.find(x=>x.name==='voice_kr');
  if(!dir?.sha)throw Error('KR folder absent');
  const tree=await get('git/trees/'+dir.sha+'?recursive=1');if(tree.truncated)throw Error('KR inventory truncated');
  availability={tree:dir.sha,checkedAt:Date.now(),files:tree.tree.filter(x=>x.type==='blob').map(x=>x.path.toLowerCase())};
  await writeFile(availabilityPath,JSON.stringify(availability));
 }catch(err){console.warn('KR inventory refresh failed; using cached availability or metadata:',err.message);}
}
const krFiles=availability?new Set(availability.files):null;
const records=JSON.parse(await readFile('.cache/ursus-data/chess.json','utf8'));
const manifest=JSON.parse(await readFile('.cache/ursus-data/assets.json','utf8'));
const index=indexVoice(table,'CN',VOICE_BATTLE_SLOTS),ids=new Set(Object.values(records).filter(c=>c.globalReleased!==false).map(c=>c.charId).filter(Boolean));
const files=[],voice={kr:{},jp:{}},audit=[];
for(const lang of ['kr','jp'])for(const id of ids){
 const slots=index.get(id);if(!slots)continue;
 const available=table.voiceLangDict?.[id]?.dict;
 const resolved=[];
 voice[lang][id]=Object.fromEntries(Object.entries(slots).map(([slot,lines])=>[slot,lines.map(asset=>{
  const actual=voiceLanguageFor(lang,asset,{krFiles,metadataKR:!!available?.KR});resolved.push({slot,asset,actual});
  const sub=`${VOICE_DIRS[actual]}/${asset.toLowerCase()}.mp3`,path=`/assets/audio/voice/${sub}`;
  files.push({path,sources:[RAW.aa2voice+sub]});return path;
 })]));
 if(lang==='kr')audit.push({charId:id,metadataKR:!!available?.KR,krLines:resolved.filter(x=>x.actual==='kr').length,jpFallback:resolved.filter(x=>x.actual==='jp')});
}
manifest.audio.voice=voice;
manifest.audio.voiceAvailability=Object.fromEntries(audit.map(x=>[x.charId,{krLines:x.krLines,jpFallback:x.jpFallback.length}]));
manifest.audio.voiceConditions=Object.fromEntries([...ids].map(id=>[id,Object.fromEntries(Object.values(records).filter(c=>c.charId===id).flatMap(c=>(c.skills||[c.skill]).filter(Boolean).map(sk=>[sk.index,{passive:sk.skillType!=='MANUAL',spCost:sk.spCost}])))]));
await writeFile('.cache/ursus-data/assets.json',JSON.stringify(manifest));
await writeFile('.cache/ursus-voice-resources.json',JSON.stringify({files:[...new Map(files.map(f=>[f.path,f])).values()]}));
await writeFile('docs/VOICE-LANGUAGE-AVAILABILITY-AUDIT.json',JSON.stringify({krTree:availability?.tree||null,operators:audit},null,2)+'\n');
console.log(`Official KR/JP voices indexed for ${Object.keys(voice.jp).length} operators; files cached on first playback.`);

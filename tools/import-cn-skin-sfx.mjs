// Import only the four verified official costume banks, retaining their source provenance.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {indexAudio} from './assets/audio.mjs';
import {unitCombatSounds} from './assets/unit-combat-sounds.mjs';
import {buildSkinSfx} from './build-skin-sfx.mjs';
const root=process.cwd(),incoming=resolve(process.argv[2]),read=async p=>JSON.parse(await readFile(p,'utf8'));
const report=await read(resolve(incoming,'sfx/audio-report.json')),raw=await read(resolve(root,'.cache/gamedata/excel/audio_data.json'));
const assets=await read(resolve(root,'content/production/data/assets.json')),chess=await read(resolve(root,'content/production/data/chess.json'));
const idx=await read(resolve(root,'.cache/local-production/public/assets/local/fx/index.json'));
const catalog=await read(resolve(root,'content/production/resources.json')),existing=new Set(catalog.files.map(f=>f.path));
const known=await read(resolve(root,'docs/ui-fx-audit-2026-10-23/skin-sfx-banks.json'));
const result={version:1,units:{},aliases:{},files:[],source:basename(incoming)},used=new Map(),converted=new Map();
const lookup=new Map(report.files.map(f=>[f.name.toLowerCase(),f]));
async function resolveSound(path){
 if(existing.has(path))return path;
 const leaf=basename(path,'.mp3').toLowerCase(),clip=lookup.get(leaf);if(!clip)throw Error('Missing extracted skin clip '+leaf);
 if(converted.has(leaf))return converted.get(leaf);
 const source=resolve(incoming,'sfx',clip.file.replaceAll('\\','/')),bytes=await readFile(source);
 if(createHash('sha256').update(bytes).digest('hex')!==clip.sha256)throw Error('Audio hash mismatch '+leaf);
 const url='/assets/local/audio/sfx/'+leaf.replace(/[^a-z0-9_.-]/g,'_')+'.mp3',out=resolve(root,'public'+url);await mkdir(resolve(out,'..'),{recursive:true});
 execFileSync('ffmpeg',['-v','error','-y','-i',source,'-codec:a','libmp3lame','-b:a','160k',out]);
 const encoded=await readFile(out);used.set(url,{path:url,local:true,sources:[url],bytes:encoded.length,sha256:createHash('sha256').update(encoded).digest('hex')});converted.set(leaf,url);return url;
}
async function remap(value){if(typeof value==='string'&&value.startsWith('/assets/audio/sfx/'))return resolveSound(value);if(Array.isArray(value))return Promise.all(value.map(remap));if(value&&typeof value==='object'){const out={};for(const[k,v]of Object.entries(value))out[k]=await remap(v);return out;}return value;}
for(const row of known){
 const suffix=row.skinId.split('@')[1],cid=row.charId;
 const code=cid.replace(/^char_\d+_/,'');
 const banks=raw.soundFXBanks.filter(b=>b.name.startsWith('battle.')&&b.name.includes(suffix)&&b.name.includes(code)&&!b.name.includes('@')).map(b=>({...b,name:b.name.split('_'+suffix).join('').split('.'+suffix).join('')}));
 const audio=indexAudio({soundFXBanks:banks}),cs=Object.values(chess).filter(c=>c.charId===cid);
 if(!cs.length)continue;
 const skills=[...new Map(cs.flatMap(c=>c.skills||[c.skill]).filter(Boolean).map(s=>[s.index,s])).values()];
 const {unit}=unitCombatSounds(audio,cid,skills,{});
 const take=(dest,key,bank)=>{const path=audio.bank(bank)[0];if(path&&!/(?:_loop|_lp)(?:_|\d|\.)/i.test(path))dest[key]='/assets/audio/sfx/'+path;};
 if(cid==='char_1032_excu2'){delete unit.hit;for(let i=0;i<3;i++)take(unit.attacks||={},i,`battle.ON_ABILITY_ON.${cid}.attack.${i+1}`);}
 if(cid==='char_180_amgoat'){
  take(unit,'hit','battle.ON_PROJECTILE_REACH.projectile_amgoat');
  take(unit.attacks||={},1,'battle.ON_ABILITY_START.skchr_amgoat_2');
  for(let i=1;i<3;i++)take(unit.hits||={},i,`battle.ON_PROJECTILE_REACH.projectile_amgoat_s${i+1}`);
 }
 if(cid==='char_377_gdglow')for(let i=0;i<3;i++){take(unit.hits||={},i,`battle.ON_PROJECTILE_HIT.projectile_chr_gdglow_s${i+1}`);if(!unit.hits[i])take(unit.hits,i,`battle.ON_PROJECTILE_HIT.projectile_chr_gdglow_funnel_s${i+1}`);}
 for(const[k,v]of Object.entries(unit.skills||{}))if(typeof v==='string'&&/(?:_loop|_lp)(?:_|\d|\.)/i.test(v))delete unit.skills[k];

 // A bank absent from this costume inherits its base equivalent, rather than forcing silence.
 for(const[k,v]of Object.entries(unit.skills||{}))if(v===null)delete unit.skills[k];
 for(const [slot,roles] of Object.entries(unit.skillCombat||{})){for(const role of ['attack','hit'])if(typeof roles[role]==='string'&&/(?:_loop|_lp)(?:_|\d|\.)/i.test(roles[role]))delete roles[role];if(!roles.attack&&!roles.hit)delete unit.skillCombat[slot];}
 const patch=await remap(unit);result.units[row.skinId]={baseCharId:cid,...patch};result.aliases[row.skinId]=row.skinId;
 for(const c of Object.values(idx.costumes||{}))if(c.skinId===row.skinId)for(const key of [c.mount,c.skinId,c.prefab])if(key)result.aliases[key]=row.skinId;
 console.log(row.skinId,Object.keys(patch));
}
result.files=[...used.values()];await writeFile(resolve(root,'content/custom/audio/skin-sfx.json'),JSON.stringify(result,null,2)+'\n');
await buildSkinSfx(root,resolve(root,'content/production/data'));
const files=new Map(catalog.files.filter(f=>!f.path.startsWith('/assets/local/audio/sfx/')||used.has(f.path)).map(f=>[f.path,f]));for(const f of result.files)files.set(f.path,f);catalog.files=[...files.values()];catalog.version=createHash('sha256').update(JSON.stringify(catalog.files)).digest('hex').slice(0,20);catalog.estimatedBytes=catalog.files.reduce((n,f)=>n+(f.bytes||256*1024),0);await writeFile(resolve(root,'content/production/resources.json'),JSON.stringify(catalog));
console.log('Costumes',Object.keys(result.units).length,'new audio files',result.files.length);

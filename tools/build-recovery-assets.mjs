import{readFile,writeFile}from'node:fs/promises';
import{attachAttackTimings,spineAttackTiming}from'../shared/attackTiming.js';
import{mergeSkinSfx}from'./build-skin-sfx.mjs';
export async function buildRecoveryAssets(root,dir){
 let patch;try{patch=JSON.parse(await readFile(`${root}/content/custom/recovery/assets.json`,'utf8'));}catch(e){if(e.code==='ENOENT')return[];throw e;}
 const assets=JSON.parse(await readFile(`${dir}/assets.json`,'utf8')),chess=JSON.parse(await readFile(`${dir}/chess.json`,'utf8'));
 for(const[id,entry]of Object.entries(patch.chars))assets.chars[id]={...assets.chars[id],...entry};
 for(const field of ['skills','skillsById','modules'])assets[field]={...assets[field],...(field==='skillsById'?patch.skills:patch[field])};
 for(const cid of Object.keys(patch.skinChoices))for(const rec of Object.values(chess))if(rec.charId===cid){const choices=new Map((rec.skins||[]).map(s=>[s.id,s]));for(const s of patch.skinChoices[cid])choices.set(s.id,s);rec.skins=[...choices.values()];}
 assets.audio.voice??={jp:{},kr:{}};assets.audio.voiceAvailability??={};
 for(const lang of ['jp','kr'])Object.assign(assets.audio.voice[lang],patch.audio.voice[lang]);
 for(const cid of Object.keys(patch.audio.voice.kr)){const lines=Object.values(patch.audio.voice.kr[cid]).flat();assets.audio.voiceAvailability[cid]={krLines:lines.filter(p=>p.includes('/voice_kr/')).length,jpFallback:lines.filter(p=>!p.includes('/voice_kr/')).length};}
 for(const[id,unit]of Object.entries(patch.audio.sfx.units))assets.audio.sfx.units[id]=mergeSkinSfx(assets.audio.sfx.units[id]||{},unit);
 attachAttackTimings({chess},assets);
 for(const r of Object.values(chess))for(const s of r.skins||[]){const sp=assets.chars[s.id]?.spine;if(sp)s.attackTiming={front:spineAttackTiming(sp.front),back:spineAttackTiming(sp.back),...(r.charId==='char_4217_makoto'?{forms:r.attackTiming?.forms}:{})};}
 const groups=JSON.parse(await readFile(`${root}/content/custom/recovery/fx-groups.json`,'utf8'));const local=JSON.parse(await readFile(`${dir}/local-fx.json`,'utf8'));for(const [key,entries]of Object.entries(groups))Object.assign(local.groups[key]??={},entries);await writeFile(`${dir}/local-fx.json`,JSON.stringify(local));
 for(const[k,v]of Object.entries({chess,assets}))await writeFile(`${dir}/${k}.json`,JSON.stringify(v));return patch.files;
}

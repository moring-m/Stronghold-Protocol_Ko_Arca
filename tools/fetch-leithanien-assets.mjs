import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {OPERATORS} from './build-leithanien.mjs';
import {Downloader} from './assets/downloader.mjs';
import {processModels} from './assets/spine.mjs';
import {RAW} from './assets/sources.mjs';
const root=process.cwd(),dir=join(root,'.cache/leithanien-data'),assets=JSON.parse(await readFile(join(dir,'assets.json'))),chess=JSON.parse(await readFile(join(dir,'chess.json')));
const dl=new Downloader({root:join(root,'public/assets'),ledgerPath:join(root,'.cache/leithanien-assets-ledger.json'),concurrency:6,retries:2,timeoutMs:30000});await dl.loadLedger();
const jobs=[],models=new Map(),job=(rel,url)=>({rel,urls:[url],kind:rel.endsWith('.png')?'png':'binary'});
for(const [key,id]of OPERATORS){
 const c=assets.chars[id]||{spine:{}};
 if(!assets.chars[id]){
  for(const [k,folder,file]of [['avatar','avatar',`${id}.png`],['avatarE2','avatar',`${id}_2.png`],['portrait','portrait',`${id}_1.png`],['portraitE2','portrait',`${id}_2.png`]]){const rel=`custom/leithanien/${folder}/${file}`;c[k]='/assets/'+rel;jobs.push(job(rel,RAW.yuanyan+`${folder}/${file}`));}
  for(const side of ['front','back']){const baseUrl=RAW.fexli+`spine/${id}/${id}/${side==='front'?'Front':'Back'}/`,dir=`custom/leithanien/spine/${id}/${side}/`;models.set(id+':'+side,{key:id+':'+side,kind:'op',dir,pma:false,skillIndices:[0,1,2],baseUrl,skel:job(dir+id+'.skel',baseUrl+id+'.skel'),atlas:{...job(dir+id+'.atlas',baseUrl+id+'.atlas'),mutable:true},pngs:[job(dir+id+'.png',baseUrl+id+'.png')]});}
 }
 assets.chars[id]=c;
 for(const sk of chess[`chess_custom_leithanien_${key}_a`].skills||[])if(sk.iconId&&!assets.skills?.[sk.iconId]){const rel=`custom/leithanien/skill/${sk.iconId}.png`;jobs.push(job(rel,RAW.yuanyan+`skill/skill_icon_${sk.iconId}.png`));assets.skills[sk.iconId]='/assets/'+rel;assets.skillsById[sk.skillId]=sk.iconId;}
}
const misc=[['icon-full.png','arts/camplogo/logo_leithanien.png'],['item/bell.png','arts/ui/rogueliketopic/itempic/rogue_3_relic_res_9.png'],['item/score.png','arts/ui/rogueliketopic/itempic/rogue_1_relic_r07.png']];
for(const [rel,source]of misc)jobs.push(job('custom/leithanien/'+rel,RAW.aa2+source));
assets.bonds.leithanienShip='/assets/custom/leithanien/icon-full.png';assets.items.leithanien_bell='/assets/custom/leithanien/item/bell.png';assets.items.leithanien_score='/assets/custom/leithanien/item/score.png';
// Use the original Witch King's enemy portrait, rather than a placeholder faction icon.
const witch=RAW.yuanyan+'enemy/enemy_1548_ltniak.png';
jobs.push(job('custom/leithanien/witchking.png',witch));assets.bands.band_custom_leithanien_witchking='/assets/custom/leithanien/witchking-npc-strategy.png';
const result=await dl.run(jobs,'Leithanien artwork');
const missing=[...result].filter(([,v])=>['miss','error'].includes(v.status));
if(missing.length)console.log('Missing artwork:',missing.map(([k])=>k));
const res=await processModels(models,{root:join(root,'public/assets'),dl,cachePath:join(root,'.cache/leithanien-spine.json')});
for(const [key,value]of res.entries){const [id,side]=key.split(':');assets.chars[id].spine[side]=value;}
for(const [key,id]of OPERATORS){const r=chess[`chess_custom_leithanien_${key}_b`];r.assets.avatar=id+'_2';r.assets.portrait=id+'_2';}
await writeFile(join(dir,'assets.json'),JSON.stringify(assets));await writeFile(join(dir,'chess.json'),JSON.stringify(chess));
const local=JSON.parse(await readFile(join(dir,'local-assets.json'),'utf8').catch(()=>'{"groups":{}}'));local.groups??={};local.groups.leithanien??={};
for(const [key,v]of result)if(!['miss','error'].includes(v.status))local.groups.leithanien[key]={path:'/assets/'+key,kind:key.endsWith('.png')?'png':'binary'};
local.groups.leithanien['custom/leithanien/witchking-npc-strategy.png']={path:'/assets/custom/leithanien/witchking-npc-strategy.png',kind:'png'};
await writeFile(join(dir,'local-assets.json'),JSON.stringify(local));
await mkdir(join(root,'.cache'),{recursive:true});await writeFile(join(root,'.cache/leithanien-extra-assets.json'),JSON.stringify(assets));
if(res.problems.length||missing.length)throw Error([...res.problems,...missing.map(([k])=>k)].join('\n'));

import {readFile,writeFile} from 'node:fs/promises';
export async function buildRecruitResources(root){
 const a=JSON.parse(await readFile(`${root}/content/upstream-recruits/assets.json`)),b=JSON.parse(await readFile(`${root}/content/upstream-recruits/backups.json`));
 const moduleFiles=JSON.parse(await readFile(`${root}/content/module-icon-files.json`));
 const skillFiles=Object.fromEntries(Object.entries(a.skills||{}).map(([id,path])=>[path,`skill_icon_${encodeURIComponent(id)}.png`]));
 const ids=new Set([...b.diy.ownedPool,...Object.values(b.diy.prototypes).flat()]),files=new Map(),raw='https://raw.githubusercontent.com/';
 function walk(x){if(!x||typeof x!=='object')return;for(const v of Object.values(x)){if(typeof v==='string'&&v.startsWith('/assets/')){let sources=[];const op=v.match(/^\/assets\/spine\/op\/([^/]+)\/(front|back)\/(.+)$/);if(op){const [,id,side,name]=op;for(const dir of [side==='front'?'Front':'Back','Spine'])sources.push(`${raw}fexli/ArknightsResource/main/spine/${id}/${id}/${dir}/${name}`);}else if(v.startsWith('/assets/char/'))sources=[`${raw}yuanyan3060/ArknightsGameResource/main/${v.replace('/assets/char/','')}`];else if(v.startsWith('/assets/token/avatar/'))sources=[`${raw}yuanyan3060/ArknightsGameResource/main/avatar/${v.split('/').at(-1)}`];else if(v.startsWith('/assets/audio/sfx/'))sources=[`${raw}ArknightsAssets/ArknightsAssets2/voice/assets/dyn/audio/sound_beta_2/${v.replace('/assets/audio/sfx/','')}`];else if(v.startsWith('/assets/audio/voice/'))sources=[`${raw}ArknightsAssets/ArknightsAssets2/voice/assets/dyn/audio/sound_beta_2/${v.replace('/assets/audio/voice/','')}`];else if(v.startsWith('/assets/prof/sub/'))sources=[`${raw}ArknightsAssets/ArknightsAssets2/cn/assets/dyn/arts/ui/subprofessionicon/sub_${v.split('/').at(-1).replace('.png','')}_icon.png`];else if(v.startsWith('/assets/module/'))sources=[`${raw}fexli/ArknightsResource/main/equipt/${moduleFiles[v.split('/').at(-1).toLowerCase()] || v.split('/').at(-1)}`];else if(v.startsWith('/assets/skill/'))sources=[`${raw}yuanyan3060/ArknightsGameResource/main/skill/${skillFiles[v] || `skill_icon_${v.split('/').at(-1)}`}`];if(sources.length)files.set(v,{path:v,sources});}else walk(v);}if(x.atlas&&files.has(x.atlas))files.get(x.atlas).atlas={textures:x.textures,pma:x.pma};}
 for(const id of ids)walk(a.chars[id]);walk(a.modules);walk(a.skills);walk(a.skillsById);walk(a.tokens);walk(a.audio?.sfx);walk(a.audio?.voice);walk(a.audio?.voiceJp);walk(a.prof);
 await writeFile(`${root}/.cache/upstream-recruit-resources.json`,JSON.stringify({files:[...files.values()]}));
 const localPath=`${root}/.cache/ursus-data/local-assets.json`;
 const local=JSON.parse(await readFile(localPath,'utf8').catch(e=>{if(e.code==='ENOENT')return '{"groups":{}}';throw e}));
 local.groups??={};local.groups.module??={};
 for(const [type,path] of Object.entries(a.modules||{}))local.groups.module[type]={path,kind:'png'};
 await writeFile(localPath,JSON.stringify(local));
}
if(process.argv[1]?.endsWith('build-recruit-resources.mjs'))await buildRecruitResources(process.cwd());

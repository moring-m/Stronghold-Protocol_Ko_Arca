// Prepare verified recovered payloads in the already-authorized resource repository.
import{readFile,writeFile,copyFile,mkdir}from'node:fs/promises';import{resolve,dirname}from'node:path';import{createHash}from'node:crypto';
export async function prepareRecoveryResources(root,repo){
 const read=async p=>JSON.parse(await readFile(p,'utf8')),write=async(p,x)=>writeFile(p,JSON.stringify(x));
 const patch=await read(resolve(root,'content/custom/recovery/assets.json')),inventory=await read(resolve(repo,'inventory.json')),rows=new Map(inventory.inventory.map(f=>[f.path,f]));
 const base=await read(resolve(repo,'public/assets/local/fx/index.json')),now=await read(resolve(root,'public/assets/local/fx/index.json')),textures=await read(resolve(root,'public/assets/local/fx/textures.json')),oldTextures=await read(resolve(repo,'public/assets/local/fx/textures.json'));
 const supplement=await read(resolve(repo,'metadata/costume-supplement.json'));
 for(const section of['units','skills','projectiles','skins','prefabs','costumes'])for(const[key,v]of Object.entries(now[section]||{}))if(!base[section]?.[key])(supplement[section]??={})[key]=v;
 for(const[key,v]of Object.entries(textures.textures))if(!oldTextures.textures[key])supplement.textures[key]=v;
 const groups=await read(resolve(root,'content/custom/recovery/fx-groups.json'));for(const[key,v]of Object.entries(groups))Object.assign(supplement.groups[key]??={},v);
 const fxFiles=new Map(supplement.files.map(f=>[f.path,f]));
 for(const file of patch.files){
  const bytes=await readFile(resolve(root,'public'+file.path)),sha256=createHash('sha256').update(bytes).digest('hex');if(sha256!==file.sha256||bytes.length!==file.bytes)throw Error('Recovery checksum mismatch '+file.path);
  const dest=resolve(repo,'public'+file.path);await mkdir(dirname(dest),{recursive:true});await copyFile(resolve(root,'public'+file.path),dest);
  const entry={path:file.path,bytes:file.bytes,sha256};rows.set(file.path,entry);if(file.path.startsWith('/assets/local/fx/')&&!['index.json','textures.json'].includes(file.path.split('/').at(-1)))fxFiles.set(file.path,entry);
 }
 supplement.files=[...fxFiles.values()];await write(resolve(repo,'metadata/costume-supplement.json'),supplement);
 await write(resolve(repo,'metadata/local-fx.json'),await read(resolve(root,'content/production/data/local-fx.json')));
 inventory.inventory=[...rows.values()];inventory.files=rows.size;inventory.bytes=inventory.inventory.reduce((n,f)=>n+f.bytes,0);await writeFile(resolve(repo,'inventory.json'),JSON.stringify(inventory,null,2)+'\n');
 await write(resolve(repo,'metadata/recovery-connected-20261024.json'),{skins:patch.skinChoices,files:patch.files.map(({path,bytes,sha256})=>({path,bytes,sha256})),voices:Object.keys(patch.audio.voice.jp),sfx:Object.keys(patch.audio.sfx.units)});
 console.log(JSON.stringify({files:patch.files.length,bytes:patch.files.reduce((n,f)=>n+f.bytes,0),inventory:rows.size}));
}
if(process.argv[1]?.endsWith('publish-recovery-resources.mjs'))await prepareRecoveryResources(process.cwd(),resolve('../Stronghold-Protocol_Ko_Arca_assets'));

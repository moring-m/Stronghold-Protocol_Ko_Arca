// Download choices affect background asset storage only, never simulation data.
export const RESOURCE_SELECTION_KEY='sp.resources.downloadSelection';
export const OFFICIAL_FX_READY_KEY='sp.resources.officialFxReady';
export function normalizeResourceSelection(value){return {voice:value?.voice==='jp'?'jp':'kr',effects:value?.effects==='simple'?'simple':'official',...(['officialFx','voice-kr','voice-jp'].includes(value?.scope)?{scope:value.scope}:{})};}
export function readResourceSelection(storage=globalThis.localStorage){try{return normalizeResourceSelection(JSON.parse(storage?.getItem(RESOURCE_SELECTION_KEY)||'null'));}catch{return normalizeResourceSelection(null);}}
export function resourceFileSelected(file,selection){
 const s=normalizeResourceSelection(selection),path=typeof file==='string'?file:file.path;
 if(s.scope?.startsWith('voice-'))return path.startsWith('/assets/audio/voice/'+s.scope.slice(6)+'/');
 if(s.scope==='officialFx')return path.startsWith('/assets/local/fx/');
 if(path.startsWith('/assets/local/fx/'))return s.effects==='official';
 const voice=/^\/assets\/audio\/voice\/(kr|jp)\//.exec(path);
 return !voice||voice[1]===s.voice;
}
export function selectedResources(index,selection){
 const s=normalizeResourceSelection(selection),files=[...new Map(index.files.filter(f=>resourceFileSelected(f,s)).map(f=>[f.path,f])).values()];
 const estimatedBytes=files.reduce((n,f)=>n+(f.bytes||0),0);
 return {...index,files,sourceVersion:index.sourceVersion||index.version,version:(index.sourceVersion||index.version)+'-'+s.voice+'-'+s.effects+(s.scope?'-'+s.scope:''),estimatedBytes,estimatedStorageBytes:Math.ceil(estimatedBytes*1.15)};
}
export function officialFxDownloaded(storage=globalThis.localStorage){try{return storage?.getItem(OFFICIAL_FX_READY_KEY)==='1';}catch{return false;}}
export async function missingResourceBytes(resources,storage=globalThis.caches){
 if(!storage?.match)return resources.estimatedBytes||0;
 let cursor=0,bytes=0;
 const lookup=async()=>{while(cursor<resources.files.length){const file=resources.files[cursor++],saved=await storage.match(file.path);if(!saved)bytes+=file.bytes||0;else saved.body?.cancel?.().catch(()=>{});}};
 await Promise.all(Array.from({length:6},lookup));return bytes;
}

export function voiceDownloaded(language,storage=globalThis.localStorage){try{return storage?.getItem('sp.resources.voiceReady.'+language)==='1';}catch{return false;}}

// Supplement the prepared catalogue from the voice source used by AN-EN-Tags.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {validate} from './assets/formats.mjs';
import {supplementKoreanVoices} from './assets/koreanVoiceSupplement.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const repo='PuppiizSunniiz/Arknight-voices';
const api=async path=>{
 const response=await fetch(`https://api.github.com/repos/${repo}/${path}`,{headers:{'User-Agent':'Stronghold-Protocol-voice-import',...(process.env.GH_TOKEN?{Authorization:`Bearer ${process.env.GH_TOKEN}`}:{})},signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error(`Voice inventory HTTP ${response.status}`);return response.json();
};
const read=async path=>JSON.parse(await readFile(resolve(root,path),'utf8'));
const manifest=await read('content/production/data/assets.json');
const resources=await read('content/production/resources.json');
const revision=(await api('commits/main')).sha;
const directories=await api(`contents/voice_kr?ref=${revision}`);
const previous=await read('content/custom/audio/korean-voices.json').catch(()=>({lines:{}}));
const supplement={repository:repo,revision,sourcePage:'https://puppiizsunniiz.github.io/AN-EN-Tags/akhrchars.html',lines:{...previous.lines}};
const unavailable=[];
for(const [charId,slots] of Object.entries(manifest.audio.voice.kr)){
 const missing=Object.values(slots).flat().filter(path=>!path.includes('/voice_kr/'));
 if(!missing.length)continue;
 const dir=directories.find(dir=>dir.name.toLowerCase()===charId.toLowerCase());
 if(!dir){unavailable.push({charId,reason:'Korean voice folder absent'});continue;}
 const tree=await api(`git/trees/${dir.sha}`);
 if(tree.truncated)throw Error('Truncated voice inventory');
 for(const path of missing){
  const filename=path.split('/').at(-1),file=tree.tree.find(file=>file.type==='blob'&&file.path.toLowerCase()===filename);
  if(!file){unavailable.push({charId,filename,reason:'Korean line absent'});continue;}
  const source=`https://raw.githubusercontent.com/${repo}/${revision}/voice_kr/${encodeURIComponent(dir.name)}/${encodeURIComponent(file.path)}`;
  const response=await fetch(source,{signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`Voice payload HTTP ${response.status}: ${charId}/${filename}`);
  const bytes=Buffer.from(await response.arrayBuffer());
  const blob=createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
  if(blob!==file.sha||!validate('mp3',bytes))throw Error(`Invalid voice payload: ${charId}/${filename}`);
  const dest=`/assets/audio/voice/voice_kr/${charId}/${filename}`;
  const local=resolve(root,'public'+dest);await mkdir(dirname(local),{recursive:true});await writeFile(local,bytes);
  supplement.lines[`${charId}/${filename}`]={path:dest,sources:[source],bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};
 }
 console.log('Korean voice files verified:',charId);
}
const before=new Map(resources.files.map(file=>[file.path,file]));
const changes=supplementKoreanVoices(manifest,resources,supplement);
const added=resources.files.filter(file=>!before.has(file.path));
const bytes=added.reduce((n,file)=>n+file.bytes,0);
resources.estimatedBytes+=bytes;
if(Number.isFinite(resources.totalBytes))resources.totalBytes+=bytes;
resources.estimatedStorageBytes=Math.ceil(resources.estimatedBytes*2.2);
resources.version=createHash('sha256').update(JSON.stringify(resources.files)).digest('hex').slice(0,20);
await mkdir(resolve(root,'content/custom/audio'),{recursive:true});
await writeFile(resolve(root,'content/custom/audio/korean-voices.json'),JSON.stringify(supplement,null,2)+'\n');
await writeFile(resolve(root,'content/production/data/assets.json'),JSON.stringify(manifest));
await writeFile(resolve(root,'content/production/resources.json'),JSON.stringify(resources));
const existingReport=await read('docs/KOREAN-VOICE-SUPPLEMENT.json').catch(()=>({operators:[]}));
const operators=[...new Map([...existingReport.operators,...changes].map(row=>[row.charId,row])).values()];
const productionReport=await read('content/production/report.json');
productionReport.resourceVersion=resources.version;productionReport.resources=resources.files.length;
productionReport.koreanVoiceSupplement={repository:repo,revision,operators:operators.length,files:Object.keys(supplement.lines).length};
await writeFile(resolve(root,'content/production/report.json'),JSON.stringify(productionReport,null,2)+'\n');
const voiceAudit=await read('docs/VOICE-LANGUAGE-AVAILABILITY-AUDIT.json');
for(const entry of voiceAudit.operators){
 const added=manifest.audio.voiceAvailability[entry.charId];
 if(added&&operators.some(row=>row.charId===entry.charId)){entry.krLines=added.krLines;entry.jpFallback=[];}
}
voiceAudit.supplementalSource={repository:repo,revision};
await writeFile(resolve(root,'docs/VOICE-LANGUAGE-AVAILABILITY-AUDIT.json'),JSON.stringify(voiceAudit,null,2)+'\n');
await writeFile(resolve(root,'docs/KOREAN-VOICE-SUPPLEMENT.json'),JSON.stringify({repository:repo,revision,operators,unavailable,files:Object.keys(supplement.lines).length,bytes:Object.values(supplement.lines).reduce((n,f)=>n+f.bytes,0)},null,2)+'\n');
console.log(JSON.stringify({operators:changes.length,files:added.length,bytes,unavailable},null,2));

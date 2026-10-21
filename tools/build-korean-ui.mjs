// Build display-only Korean resources. Never rewrite game data or executable effects.
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,dirname} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
export function compileKoreanUi(upstream,overlays){
 const messages=new Map(),patterns=[];
 const addPattern=(src,out)=>{const parts=src.split(/\{(\d+)\}/);if(parts.length<3){messages.set(src,out);return;}
  const escape=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  patterns.push({re:'^'+parts.map((p,k)=>k%2?'([\\s\\S]*?)':escape(p)).join('')+'$',out,order:parts.filter((_,k)=>k%2).map(Number),n:parts.filter((_,k)=>!(k%2)).join('').length});};
 for(const [zh,ko]of Object.entries(upstream))if(!zh.startsWith('_')&&typeof ko==='string'){messages.set(zh,ko);if(/\{\d+\}/.test(zh))addPattern(zh,ko);}
 for(const [name,obj]of overlays)for(const [zh,ko]of Object.entries(obj)){
  if(typeof ko!=='string'||(!ko&&name!=='ui')||zh.startsWith('//'))continue;
  if(name==='patterns'||/\{\d+\}/.test(zh)&&!messages.has(zh))addPattern(zh,ko);
  if(name!=='patterns')messages.set(zh,ko);
 }
 return {version:1,messages:Object.fromEntries(messages),patterns:patterns.sort((a,b)=>b.n-a.n)};
}
export function buildKoreanUi(){
 const read=p=>JSON.parse(readFileSync(resolve(root,p),'utf8'));
 const compiled=compileKoreanUi(read('public/i18n/ko.json'),['audit','official','data','manual','ui','patterns'].map(name=>[name,name==='audit'&&!existsSync(resolve(root,`public/i18n/ko/${name}.json`))?{}:read(`public/i18n/ko/${name}.json`)]));
 writeFileSync(resolve(root,'public/i18n/ko/compiled.json'),JSON.stringify(compiled)+'\n');
 console.log(`Korean UI compiled: ${Object.keys(compiled.messages).length} messages, ${compiled.patterns.length} patterns`);
 return compiled;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))buildKoreanUi();

// Exact source-string dictionary: never change blackboards or the original mechanicText parsed by kits.
import {readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const root=new URL('../../',import.meta.url);
const plain=s=>s.replace(/<[^>]+>/g,'');
const shape=s=>plain(s).replace(/[+\-]?\d+(?:\.\d+)?%?/g,'#');
export async function applyUnreleasedKorean(){
 const read=async p=>JSON.parse(await readFile(new URL(p,root),'utf8'));
 const source=await read('content/i18n/unreleased-ko.json'),dict=await read('public/i18n/ko/data.json');
 const templates=new Map(source.entries.map(x=>[x.source,x.translation]));let added=0;
 const visit=value=>{
  if(!value||typeof value!=='object')return;
  for(const [key,text] of Object.entries(value)){
   if(key==='mechanicText')continue;
   if(typeof text==='string'&&['name','desc','descRaw','description','effectName'].includes(key)){
    const template=templates.get(shape(text));if(!template)continue;
    const nums=plain(text).match(/[+\-]?\d+(?:\.\d+)?%?/g)||[];
    const translated=template.replace(/\{(\d+)\}/g,(_,index)=>{if(!nums[index])throw Error(`Missing numeric value ${index}: ${text}`);return nums[index];});
    if(dict[text]!==translated){dict[text]=translated;added++;}
   }else if(text&&typeof text==='object')visit(text);
  }
 };
 for(const p of ['data/chess.json','data/tokens.json','content/upstream-recruits/backups.json'])visit(await read(p));
 await writeFile(new URL('public/i18n/ko/data.json',root),JSON.stringify(dict,null,0).replace(/","/g,'",\n"')+'\n');
 console.log(`Unreleased Korean dictionary: ${added} source strings updated`);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await applyUnreleasedKorean();

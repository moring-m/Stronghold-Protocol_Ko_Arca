import {readFile,writeFile,mkdir} from 'node:fs/promises';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const rows=await read('.cache/translation-inventory.json'),coverage=await read('.cache/translation-coverage.json'),reuse=await read('.cache/translation-reuse.json');
const quote=s=>'"'+String(s).replaceAll('"','""')+'"';
const csv=[['source','locations','ko','en','ja','zh'],...rows.map(row=>[row.source,row.at.join(' | '),...['ko','en','ja','zh'].map(code=>{
 if((code==='ko'&&/[가-힣]/.test(row.source))||(code==='zh'&&!/[가-힣]/.test(row.source)))return 'native';
 const existing=reuse[code]?.[row.source];return existing!=null&&!((code!=='ko'&&/[가-힣]/.test(existing))||(['ko','en'].includes(code)&&/[一-鿿]/.test(existing.replace(/<[@$][^>]*>/g,''))))?'existing / curated':'supplement';
})])].map(row=>row.map(quote).join(',')).join('\r\n');
await mkdir('docs/languages-2026-10-21',{recursive:true});
await writeFile('docs/languages-2026-10-21/text-inventory.csv','\ufeff'+csv+'\r\n');
await writeFile('docs/languages-2026-10-21/coverage.json',JSON.stringify(coverage,null,2)+'\n');

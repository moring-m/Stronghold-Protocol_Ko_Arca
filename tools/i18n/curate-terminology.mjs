// Keep official Alliance terminology in fork strings; never rewrite proper names such as Exusiai the New Covenant.
import {readFile,writeFile,mkdir}from'node:fs/promises';
const changes=[];
const properNames=[...new Set([...Object.values(JSON.parse(await readFile('public/i18n/en/data.json','utf8')).names),'Exusiai the New Covenant'])].filter(n=>n.length>4).sort((a,b)=>b.length-a.length);
for(const file of ['public/i18n/en.json','public/i18n/en/audit.json','public/i18n/en/fork.json']){
 const data=JSON.parse(await readFile(file,'utf8'));
 for(const[source,value]of Object.entries(data)){
  if(typeof value!=='string'||!/(맹약|盟约|盟約|증강|밴|중첩)/.test(source))continue;
  const protectedNames=[];let prose=value;for(const name of properNames)if(prose.includes(name)){const marker=`__PN${protectedNames.length}__`;protectedNames.push([marker,name]);prose=prose.split(name).join(marker);}
  let next=prose;
  if(/맹약|盟约|盟約/.test(source))next=next.replace(/\b(bonds?|pacts?|covenants?|pledges?|oaths?|agreements?|contracts?|treaties|treaty)\b/gi,word=>word===word.toUpperCase()?(/s$/i.test(word)?'ALLIANCES':'ALLIANCE'):(/s$/i.test(word)?'Alliances':'Alliance')).replace(/\bAlliance van\b/gi,'Alliance ban').replace(/\boverlap\b/gi,'stacks').replace(/\b(?:auxiliary|secondary) (Alliances?)\b/gi,'Add-on $1').replace(/\bprimary (Alliances?)\b/gi,'Core $1').replace(/\bCORE Alliance\b/g,'CORE ALLIANCE').replace(/\bADD-ON Alliance\b/g,'ADD-ON ALLIANCE');
  if(source.includes('증강'))next=next.replace(/\b(augmentations?|enhancements?|reinforcements?)\b/gi,w=>/s$/i.test(w)?'Augments':'Augment');
  if(source.includes('밴'))next=next.replace(/\bvan(s?)\b/gi,'ban$1');
  if(source.includes('중첩'))next=next.replace(/\b(overlap|nested|nesting)\b/gi,'stacks');
  for(const[marker,name]of protectedNames)next=next.split(marker).join(name);
  if(next!==value){data[source]=next;changes.push({file,source,before:value,after:next});}
 }
 await writeFile(file,JSON.stringify(data,null,file.includes('/audit.json')?undefined:2)+'\n');
}
await mkdir('docs/room-creation-2026-10-22',{recursive:true});
let previous=[];try{previous=JSON.parse(await readFile('docs/room-creation-2026-10-22/terminology-changes.json','utf8'));}catch{}
const unique=new Map([...previous,...changes].map(c=>[c.file+'|'+c.source,c]));
await writeFile('docs/room-creation-2026-10-22/terminology-changes.json',JSON.stringify([...unique.values()],null,2)+'\n');
console.log(`Corrected ${changes.length} terminology translations`);

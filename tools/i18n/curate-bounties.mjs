// Bounty descriptions are rewritten to two battles by the server; translate that rendered form as well.
import {readFile,writeFile} from 'node:fs/promises';
import {bountyText} from '../../server/match/choices.js';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const choices=await read('content/production/data/choices.json'),effects=await read('content/production/data/effects.json');
for(const lang of ['ko','en','ja']){
 const path=`public/i18n/${lang}/${lang==='ko'?'manual':'fork'}.json`,dict=await read(path);
 const base=lang==='ko'?(await read('public/i18n/ko/compiled.json')).messages:{...await read(`public/i18n/${lang}/audit.json`),...dict};
 for(const card of choices.cards.bounty)for(const raw of [card.desc,effects[card.effectId]?.descRaw]){
  const rendered=bountyText(raw,card);if(!raw||raw===rendered)continue;
  let value=base[raw];if(!value)throw Error('Missing original bounty '+raw);
  if(lang==='ko')value=value.replace(/이후의 (?:<@ba.vdown>)?모든 전투(?:<\/>)?에서/g,'앞으로 <@ba.vup>두 번의 전투</>에서');
  if(lang==='en')value=value.replace(/every subsequent battle|each subsequent battle|all subsequent battles/gi,'the next two battles');
  if(lang==='ja')value=value.replace(/(?:選択後の|以降の|以後の)(?:<@ba.vdown>)?全ての戦闘(?:<\/>)?/g,'次の<@ba.vup>2回の戦闘</>');
  dict[rendered]=value;
 }
 await writeFile(path,JSON.stringify(dict,null,2)+'\n');
}

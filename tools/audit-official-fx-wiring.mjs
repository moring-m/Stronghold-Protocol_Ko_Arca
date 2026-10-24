// Static resource/dispatch inventory. This does not claim that every effect was visually replayed.
import {readFile,writeFile,readdir,mkdir} from 'node:fs/promises';
import {resolve,relative} from 'node:path';
import {parse} from 'acorn';
import {skillPlan,planKeys,FX_BINDINGS,FX_COVER,bindingKeys} from '../public/js/render/vfx/skills.js';
const root=process.cwd(),read=async p=>JSON.parse(await readFile(resolve(root,p),'utf8'));
const idx=await read('public/assets/local/fx/index.json'),chess=await read('content/production/data/chess.json'),backups=await read('content/production/data/backups.json');
const groups=Map.groupBy(Object.values(chess).filter(c=>c.charId),c=>c.charId),ids=new Set([...groups.keys(),...Object.keys(backups.units||{})]);
const skillRows=[],seen=new Set();
for(const id of ids) {
 const records=[...(groups.get(id)||[]),...Object.values(backups.units?.[id]?.forms||{})];
 for(const c of records)for(const s of c.skills||[c.skill]){
  const sid=s?.skillId||s?.prefabId;if(!sid||seen.has(`${id}:${sid}`))continue;seen.add(`${id}:${sid}`);
  const normalized=sid.toLowerCase().replace(/\[\d+\]$/,'');
  const resolved=(idx.units[id]?.skills?.[sid]||idx.skills[sid])?sid:normalized;
  const p=skillPlan(idx,id,resolved,{rec:s}),keys=[...new Set([...planKeys(p),...bindingKeys(idx,sid)])];
  skillRows.push({charId:id,skillId:sid,resolvedSkillId:resolved,unitPresent:!!idx.units[id],skillPresent:!!(idx.units[id]?.skills?.[resolved]||idx.skills[resolved]),
   plannedKeys:keys,missingPlannedKeys:keys.filter(k=>!idx.prefabs[k]),bindings:Object.keys(FX_BINDINGS[sid]||{}),coveredEvents:FX_COVER[sid]||[],
   excludedRows:p.unmapped});
 }
}
const eventRows=[];
function walk(n,fn){if(!n||typeof n!=='object')return;fn(n);for(const v of Object.values(n))if(Array.isArray(v))for(const x of v)walk(x,fn);else if(v&&typeof v==='object')walk(v,fn);}
const dir=resolve(root,'server/sim/content/kits/ops');
for(const leaf of await readdir(dir)){
 if(!leaf.endsWith('.js'))continue;const file=resolve(dir,leaf),source=await readFile(file,'utf8'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true});
 const owners=new Set();walk(ast,n=>{if(n.type==='Property'){const k=n.key?.name||n.key?.value;if(ids.has(k))owners.add(k);}});
 const declared=owners.size>0;
 if(!declared)for(const id of source.match(/\bchar_\d+_[a-z0-9]+\b/g)||[])if(ids.has(id))owners.add(id);
 walk(ast,n=>{if(n.type!=='CallExpression'||n.callee?.type!=='MemberExpression'||n.callee.property?.name!=='fx')return;
 const kind=n.arguments[0]?.value;if(typeof kind!=='string')return;
 const direct=[...owners].flatMap(id=>skillRows.filter(s=>s.charId===id&&s.bindings.includes(kind)).map(s=>s.skillId));
 eventRows.push({file:relative(root,file),line:n.loc.start.line,operators:[...owners],ownerInference:declared?'export-property':'source-reference',kind,explicitBindings:direct,
  dispatch:direct.length?'explicit-skill-binding':(['char_1039_thorn2','char_4193_lemuen','char_1034_jesca2'].some(id=>owners.has(id))&&['zone','bombardShell','bombard'].includes(kind))?'kit-projectile-manager':'generic-skill/talent/status/procedural-dispatch'});
 });
}
const report={scope:'implemented operators; static inventory, not a full visual playthrough',operators:ids.size,skills:skillRows.length,eventSites:eventRows.length,
 missingUnits:[...ids].filter(id=>!idx.units[id]),missingPlannedKeys:skillRows.filter(s=>s.missingPlannedKeys.length),skillRows,eventRows};
const out=resolve(root,'docs/ui-fx-audit-2026-10-23/wiring-inventory.json');await mkdir(resolve(out,'..'),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({operators:report.operators,skills:report.skills,eventSites:report.eventSites,missingUnits:report.missingUnits,missingPlannedKeys:report.missingPlannedKeys.length}));

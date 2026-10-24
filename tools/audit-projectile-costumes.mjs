// Inventory installed operator projectile graphics, including separately managed orbit/funnel paths.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {funnelPlan,planKeys} from '../public/js/render/vfx/funnels.js';
import {costumeProjectile} from '../public/js/render/vfx/costumes.js';
const read=async path=>JSON.parse(await readFile(path,'utf8'));
const idx=await read('public/assets/local/fx/index.json'),chess=await read('content/production/data/chess.json'),backups=await read('content/production/data/backups.json');
const ids=new Set([...Object.values(chess).map(c=>c.charId).filter(Boolean),...Object.keys(backups.units||{})]);
const rows=[],funnels=[];
for(const id of ids){
 const unit=idx.units[id];if(!unit)continue;
 const refs=[...new Set((JSON.stringify(unit).match(/projectile_[a-z0-9_]+/g)||[]).filter(k=>idx.projectiles[k]))];
 const costumes=Object.entries(idx.costumes||{}).filter(([key,c])=>key.startsWith('skin_')&&c.charId===id);
 for(const [skin,costume]of [['base',null],...costumes]){
  const base=funnelPlan(idx,id),plan=funnelPlan(idx,id,costume);
  if(base&&plan&&costume){const original=new Set(planKeys(base,idx.projectiles)),changed=[...planKeys(plan,idx.projectiles)].filter(k=>!original.has(k));if(changed.length)funnels.push({charId:id,skin,changed});}
  for(const key of refs){const p=costumeProjectile(idx,costume,idx.projectiles[key],key);
   const effects=[...new Set([p.main,...(p.effects||[]),...(p.onHit||[])].filter(Boolean))];
   rows.push({charId:id,skin,projectile:key,movement:p.movement?.class||null,main:p.main||null,effects,missingEffects:effects.filter(k=>!idx.prefabs[k])});
  }
 }
}
const report={scope:'Static reference/resource audit of implemented operators and their installed skins. Does not prove visual correctness of every projectile.',operators:ids.size,rows,changedFunnelSkins:funnels,
 managedOrbitFixes:['char_4134_cetsyr: normal/S1/S2/S3 motes','char_1020_reed2: S2 carrier fireballs','char_1044_hsgma2: S2 orbiting shield'],
 missingGraphics:rows.filter(r=>r.missingEffects.length)};
const dir='docs/projectile-fx-audit-2026-10-24';await mkdir(dir,{recursive:true});await writeFile(dir+'/projectiles.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({operators:ids.size,projectileVariants:rows.length,changedFunnelSkins:funnels.length,missingGraphics:report.missingGraphics.length}));

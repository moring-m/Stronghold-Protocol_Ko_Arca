// Rebuild the compatibility table from existing skin exports; no client files or payloads are changed.
import {readFile,writeFile} from 'node:fs/promises';
import {costumeMountBindings} from './assets/costumeMounts.mjs';
const [indexPath,output,...exports]=process.argv.slice(2);
if(!exports.length)throw Error('Usage: recover-costume-mounts.mjs INDEX OUTPUT_JS SKIN_EFFECTS_JSON...');
const index=JSON.parse(await readFile(indexPath,'utf8')),byId=new Map(Object.values(index.costumes).map(c=>[c.skinId,c])),bindings={};
for(const path of exports){const raw=JSON.parse(await readFile(path,'utf8'));for(const row of raw.skins){if(!row.container.includes('/battle/prefabs/skins/character/'))continue;for(const id of row.skinIds){const c=byId.get(id);if(!c)continue;const result=costumeMountBindings(row);if(Object.keys(result).length)bindings[c.mount]=result;}}}
await writeFile(output,'// Compatibility bindings recovered from serialized animator slots in the KR/CN skin exports.\n// Ambiguous legacy Transform references are omitted; new extracts retain explicit Transform names.\nexport const COSTUME_MOUNT_BINDINGS = '+JSON.stringify(bindings)+';\n');
console.log({skins:Object.keys(bindings).length});

// Global availability controls selection lists only; battle records and existing saved selections stay valid.
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
export async function applyGlobalOperatorList(root,dir){
 const {charIds}=JSON.parse(await readFile(join(root,'content/global-operators.json'),'utf8'));
 const released=new Set(charIds),file=join(dir,'chess.json');
 const chess=JSON.parse(await readFile(file,'utf8'));
 const hidden=new Map();
 for(const c of Object.values(chess))if(c.charId){c.globalReleased=true;if(!c.globalReleased)hidden.set(c.charId,c.name);}
 await writeFile(file,JSON.stringify(chess));
 console.log('Hidden from operator selection lists:',[...hidden.values()].join(', '));
 return hidden;
}

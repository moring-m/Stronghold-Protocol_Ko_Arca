// Prepare a PC checkout like the production image (Dockerfile build steps), so `npm run dev:local` shows the same
// official art, effects and skins: the prepared catalogue, the pinned official v0.3.0 visuals, the hosted resources
// (official effects, costume supplement), the Korean UI and language packs, the resource origin.
// Downloads are cached under .cache/ and reused while the pinned archive / commit stays the same.
//
//   node tools/prepare-local.mjs
import {readFile,writeFile,mkdir,access} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {ARCHIVE_SHA256} from './import-official-v030.mjs';
import {installHostedResources} from './install-hosted-resources.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const exists=p=>access(p).then(()=>true,()=>false);
const step=t=>console.log(`\n== ${t}`);
function node(...args){
 const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit'});
 if(r.status!==0)throw Error(`node ${args.join(' ')} failed (${r.status})`);
}

step('Prepared production catalogue');
node('tools/apply-production.mjs');

step('Official v0.3.0 visuals');
const zip=resolve(root,'.cache/official-v030.zip');
const sha=async p=>createHash('sha256').update(await readFile(p)).digest('hex');
if(!(await exists(zip))||await sha(zip)!==ARCHIVE_SHA256){
 await mkdir(dirname(zip),{recursive:true});
 console.log('downloading the official v0.3.0 archive (once)');
 const r=await fetch('https://github.com/sganggs/Stronghold-Protocol/releases/download/v0.3.0/Stronghold-Protocol-v0.3.0.zip');
 if(!r.ok)throw Error('official archive HTTP '+r.status);
 await writeFile(zip,new Uint8Array(await r.arrayBuffer()));
 if(await sha(zip)!==ARCHIVE_SHA256)throw Error('official archive checksum mismatch');
}
node('tools/import-official-v030.mjs',zip);

step('Costume effect supplement');
node('tools/fx-supplement.mjs','install');

step('Hosted resources (official effects)');
const config=JSON.parse(await readFile(resolve(root,'content/custom/resource-origin.json'),'utf8'));
const stage=resolve(root,'.cache/hosted-resources'),stamp=resolve(stage,'.commit');
const cached=await exists(stamp)&&(await readFile(stamp,'utf8')).trim()===config.commit&&await exists(resolve(stage,'inventory.json'));
if(!cached)console.log(`downloading ${config.repository}@${config.commit.slice(0,8)} (once per pinned commit)`);
const hosted=await installHostedResources(root,undefined,cached?stage:null);
if(!cached)await writeFile(stamp,config.commit);
console.log(`${hosted?.files??0} files`);

step('Korean UI and language packs');
node('tools/build-korean-ui.mjs');
node('tools/build-language-packs.mjs');

step('Resource origin');
node('tools/resource-origin.mjs','apply');
console.log('\nReady: npm run dev:local');

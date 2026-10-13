// Limit automatic discovery to the repository's test suites. Development launchers under scripts/ are not tests.
import {readdirSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {dirname,join,relative} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
function suites(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?suites(join(dir,e.name)):e.name.endsWith('.test.js')?[relative(root,join(dir,e.name))]:[]);}
const child=spawn(process.execPath,['--test',...process.argv.slice(2),...suites(join(root,'test')).sort()],{cwd:root,stdio:'inherit'});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??1;if(signal)console.error(`Tests stopped: ${signal}`);});

// Limit automatic discovery to the repository's test suites. Development launchers under scripts/ are not tests.
import {spawn} from 'node:child_process';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=join(dirname(fileURLToPath(import.meta.url)),'..');
// Node 22+ expands this glob itself, on Windows too. Passing every discovered
// absolute/relative filename can exceed Windows' process command-line limit.
const child=spawn(process.execPath,['--test',...process.argv.slice(2),'test/**/*.test.js'],{cwd:root,stdio:'inherit'});
child.on('error',e=>{console.error(e.message);process.exitCode=1;});
child.on('exit',(code,signal)=>{process.exitCode=code??1;if(signal)console.error(`Tests stopped: ${signal}`);});

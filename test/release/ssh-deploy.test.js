import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,chmodSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
const release='a'.repeat(40),image='ghcr.io/moring-m/stronghold-protocol_ko_arca:'+release;
test('forced SSH endpoint retains the original command allowlist and routes only validated releases to bootstrap',()=>{
 const dir=mkdtempSync(join(tmpdir(),'ssh-deploy-'));try{
 writeFileSync(join(dir,'sudo'),'#!/bin/bash\nprintf "%s\\n" "$@"\n');chmodSync(join(dir,'sudo'),0o755);
 const run=command=>spawnSync('bash',['deploy/ec2/ssh-deploy-command.sh'],{encoding:'utf8',env:{...process.env,PATH:dir+':'+process.env.PATH,SSH_ORIGINAL_COMMAND:command}});
 const good=run(`sudo -n bash /opt/stronghold/rolling/update.sh '${release}' '${image}'`);assert.equal(good.status,0,good.stderr);assert.match(good.stdout,/rolling\/deploy.sh/);assert.ok(good.stdout.includes(image));
 for(const command of ['mkdir -p /tmp/example','scp -t /tmp/example',`sudo -n bash /tmp/script.sh '${release}' '${image}'`,`sudo -n bash /opt/stronghold/rolling/update.sh '${release}' 'another-image'`,`sudo -n bash /opt/stronghold/rolling/update.sh '${release}' '${image}'; touch /tmp/bad`])assert.notEqual(run(command).status,0,command);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('automatic deployment uses the permitted updater command without file-transfer SSH commands',()=>{
 const workflow=readFileSync('.github/workflows/rolling-deploy.yml','utf8').split('  deploy:')[1];assert.match(workflow,/sudo -n bash \/opt\/stronghold\/rolling\/update.sh/);assert.doesNotMatch(workflow,/\bscp\b|mkdir -p|stage_dir/);
});

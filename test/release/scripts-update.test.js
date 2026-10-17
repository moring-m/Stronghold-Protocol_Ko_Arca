import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
for(const busy of [false,true])test(`script-only update ${busy?'waits for old maintenance before replacing':'replaces tools without restarting game processes'}`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'script-refresh-'));try{
 const root=join(dir,'rolling'),src=join(dir,'src'),bin=join(dir,'bin'),calls=join(dir,'calls'),counter=join(dir,'counter');
 for(const p of [join(root,'state'),src,bin])mkdirSync(p,{recursive:true});writeFileSync(join(root,'state/state.json'),'{}');writeFileSync(join(root,'update.sh'),'old');
 for(const file of ['update','maintain','retire-old'])writeFileSync(join(src,`rolling-${file}.sh`),'#!/bin/bash\n# new '+file+'\n');
 const body=readFileSync('deploy/ec2/rolling-scripts-update.sh','utf8').replaceAll('/opt/stronghold/rolling',root).replaceAll('/var/lock/stronghold-rolling.lock',join(dir,'lock'));
 writeFileSync(join(src,'rolling-scripts-update.sh'),body);
 const mocks={id:'echo 0',systemctl:`echo "$*" >> '${calls}'\nif [[ "$*" == *is-active* && "$*" == *timer* ]];then exit 0;fi\nif [[ "$*" == *is-active* && "$*" == *service* ]];then ${busy?`if [[ ! -f '${counter}' ]];then touch '${counter}';exit 0;fi`:''};exit 3;fi`,sleep:`[[ $(cat '${root}/update.sh') == old ]] || exit 80\necho waited >> '${calls}'`,docker:'exit 99'};
 // Keep the optional service branch syntactically valid in both fixtures.
 mocks.systemctl=mocks.systemctl.replace('then ;exit','then exit');
 for(const [name,code]of Object.entries(mocks)){writeFileSync(join(bin,name),'#!/bin/bash\n'+code+'\n');chmodSync(join(bin,name),0o755);}
 const r=spawnSync('bash',[join(src,'rolling-scripts-update.sh')],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH}});
 assert.equal(r.status,0,r.stderr);for(const file of ['update','maintain','retire-old']){assert.match(readFileSync(join(root,file+'.sh'),'utf8'),/new/);assert.ok(!existsSync(join(root,file+'.sh.next')));}
 const log=readFileSync(calls,'utf8');assert.match(log,/stop stronghold-release-maintain.timer/);assert.match(log,/start stronghold-release-maintain.timer/);assert.doesNotMatch(log,/restart|stop stronghold-router|stop stronghold-game/);if(busy)assert.match(log,/waited/);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

import{test}from'node:test';import assert from'node:assert/strict';import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,rmSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';import{spawnSync}from'node:child_process';
const old='1111111111111111111111111111111111111111',current='2222222222222222222222222222222222222222';
for(const retained of[true,false])test(`manual retained-release cleanup protects the current worker (${retained?'old games present':'none retained'})`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'retire-old-script-'));try{
  const root=join(dir,'rolling'),bin=join(dir,'bin'),calls=join(dir,'calls');mkdirSync(join(root,'state'),{recursive:true});mkdirSync(bin);writeFileSync(join(root,'state','token'),'fixture-token');
  writeFileSync(join(root,'maintain.sh'),'#!/bin/bash\necho maintain >> "$MOCK_LOG"\n');
  const script=join(dir,'retire.sh');writeFileSync(script,readFileSync('deploy/ec2/rolling-retire-old.sh','utf8').replaceAll('/opt/stronghold/rolling',root).replaceAll('/var/lock/stronghold-rolling.lock',join(dir,'lock')));
  const status=JSON.stringify({current,workers:{...(retained?{[old]:{rooms:1,matches:1}}:{}),[current]:{rooms:4,matches:4}}});
  const mock=`#!/bin/bash\necho "\${0##*/} $*" >> "$MOCK_LOG"\ncase "\${0##*/}" in\nid)echo 0;;\ncurl)if [[ "$*" == *'/status'* ]];then printf '%s' '${status}';else [[ "$*" != *'${current}'* ]] || exit 9;echo '{}';fi;;\nesac\n`;
  for(const command of['id','docker','curl']){const p=join(bin,command);writeFileSync(p,mock);chmodSync(p,0o755);}
  const result=spawnSync('bash',[script],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH,MOCK_LOG:calls}});assert.equal(result.status,0,result.stderr);const log=readFileSync(calls,'utf8');assert.ok(!log.includes('docker stop stronghold-release-'+current));assert.ok(!log.includes('docker rm stronghold-release-'+current));assert.ok(log.includes('maintain'));if(retained)assert.ok(log.includes('docker stop stronghold-release-'+old));else assert.ok(!log.includes('docker stop'));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

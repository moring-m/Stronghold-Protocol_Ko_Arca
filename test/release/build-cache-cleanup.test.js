import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const release='1'.repeat(40);
for(const scenario of ['enough','reclaimed','still-low','cleanup-failed','low-memory','queued','already-current'])test(`deployment build cache preflight: ${scenario}`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'build-cache-check-'));
 try{
  const bin=join(dir,'bin'),root=join(dir,'rolling'),log=join(dir,'calls');mkdirSync(bin);mkdirSync(join(root,'state'),{recursive:true});writeFileSync(join(root,'state','token'),'fixture');
  const mem=join(dir,'meminfo');writeFileSync(mem,`MemAvailable: ${scenario==='low-memory'?100000:1000000} kB\n`);
  let source=readFileSync('deploy/ec2/rolling-update.sh','utf8');
  source=source.slice(0,source.indexOf('\nprefix='))+"\necho RESOURCE_CHECK_OK\n";
  source=source.replaceAll('/opt/stronghold/rolling',root).replaceAll('/var/lock/stronghold-rolling.lock',join(dir,'lock')).replace('/proc/meminfo',mem);
  const script=join(dir,'update.sh');writeFileSync(script,source);
  const status=scenario==='queued'?{current:'2'.repeat(40),workers:{['2'.repeat(40)]:{rooms:1},['3'.repeat(40)]:{rooms:1}}}:{current:scenario==='already-current'?release:null,workers:{}};
  const mock=`#!/usr/bin/env bash
printf '%s %s\\n' "\${0##*/}" "$*" >> "$MOCK_LOG"
case "\${0##*/}" in
id) echo 0;;
curl) printf '%s' "$MOCK_STATUS";;
df) echo 'Filesystem 1024-blocks Used Available Capacity Mounted'; if [[ "$SCENARIO" == enough || ( "$SCENARIO" == reclaimed && -f "$PRUNED" ) ]];then echo 'disk 10000000 0 3000000 70% /';else echo 'disk 10000000 0 1000000 90% /';fi;;
docker) [[ "$*" == 'builder prune --force' ]] || exit 90; [[ "$SCENARIO" != cleanup-failed ]] || exit 1; touch "$PRUNED";;
esac
`;
  for(const cmd of ['id','curl','df','docker']){const file=join(bin,cmd);writeFileSync(file,mock);chmodSync(file,0o755);}
  const result=spawnSync('bash',[script,release,`ghcr.io/moring-m/stronghold-protocol_ko_arca:${release}`],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH,MOCK_LOG:log,MOCK_STATUS:JSON.stringify(status),SCENARIO:scenario,PRUNED:join(dir,'pruned')}});
  const calls=readFileSync(log,'utf8'),prunes=calls.split('\n').filter(x=>x==='docker builder prune --force');
  assert.equal(prunes.length,['reclaimed','still-low','cleanup-failed'].includes(scenario)?1:0,calls);
  assert.ok(!/docker (image|container|volume|system|stop|rm|pull)/.test(calls),calls);
  if(['enough','reclaimed'].includes(scenario)){assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/RESOURCE_CHECK_OK/);}
  else if(['queued','already-current'].includes(scenario)){assert.equal(result.status,0,result.stderr);assert.ok(!result.stdout.includes('RESOURCE_CHECK_OK'));}
  else{assert.notEqual(result.status,0);assert.match(result.stderr,/current games were not changed/);assert.ok(!result.stdout.includes('RESOURCE_CHECK_OK'));}
 }finally{rmSync(dir,{recursive:true,force:true});}
});

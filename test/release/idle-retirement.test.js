import{test}from'node:test';import assert from'node:assert/strict';import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,rmSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';import{spawnSync}from'node:child_process';
const current='1'.repeat(40),old='2'.repeat(40);
for(const row of [{sockets:0},{sockets:1},{},{sockets:0,unavailable:true}])test(`retained worker sockets ${JSON.stringify(row)}: only confirmed zero closes abandoned games`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'idle-release-'));try{
 const root=join(dir,'rolling'),bin=join(dir,'bin'),state=join(dir,'status'),log=join(dir,'log');mkdirSync(join(root,'state'),{recursive:true});mkdirSync(bin);writeFileSync(join(root,'state','token'),'fixture');
 writeFileSync(state,JSON.stringify({current,workers:{[current]:{sockets:0,rooms:4,matches:3},[old]:{rooms:2,matches:2,...row}}}));
 const source=readFileSync('deploy/ec2/rolling-update.sh','utf8').replaceAll('/opt/stronghold/rolling',root).replaceAll('/var/lock/stronghold-rolling.lock',join(dir,'lock'));writeFileSync(join(dir,'run.sh'),source);
 const mock=`#!/usr/bin/env bash
printf '%s %s\\n' "\${0##*/}" "$*" >> "$MOCK_LOG"
case "\${0##*/}" in
id)echo 0;;
curl)if [[ "$*" == *'/status'* ]];then cat "$MOCK_STATE";elif [[ "$*" == *'/force-retire'* ]];then python3 -c 'import json,sys;p=sys.argv[1];s=json.load(open(p));s["workers"].pop("${old}");json.dump(s,open(p,"w"))' "$MOCK_STATE";echo '{}';else echo '{}';fi;;
esac
`;
 for(const cmd of ['id','curl','docker']){const file=join(bin,cmd);writeFileSync(file,mock);chmodSync(file,0o755);}
 const result=spawnSync('bash',[join(dir,'run.sh'),current,`ghcr.io/moring-m/stronghold-protocol_ko_arca:${current}`],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH,MOCK_LOG:log,MOCK_STATE:state}});assert.equal(result.status,0,result.stderr);
 const calls=readFileSync(log,'utf8');assert.ok(!calls.includes('docker stop stronghold-release-'+current));
 assert.equal(calls.includes('docker stop stronghold-release-'+old),row.sockets===0&&!row.unavailable);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

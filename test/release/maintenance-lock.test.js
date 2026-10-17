import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,chmodSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {spawnSync} from 'node:child_process';
const before='1'.repeat(40),after='2'.repeat(40);
for(const pending of [false,true])test(`maintenance resolves ${pending?'pending':'current'} after deployment lock, never reactivating a stale release`,()=>{
 const dir=mkdtempSync(join(tmpdir(),'maintenance-lock-'));try{
 const root=join(dir,'rolling'),bin=join(dir,'bin'),calls=join(dir,'calls');mkdirSync(join(root,'state'),{recursive:true});mkdirSync(bin);writeFileSync(join(root,'state/token'),'fixture-token');writeFileSync(join(root,'state/state.json'),JSON.stringify({current:before}));
 if(pending)writeFileSync(join(root,'pending.json'),JSON.stringify({release:before,image:'ghcr.io/moring-m/stronghold-protocol_ko_arca:'+before}));
 // Simulate a deployment completing while maintenance waits for its lock.
 const commands={id:'echo 0',flock:`echo '{"current":"${after}"}' > "$MOCK_ROOT/state/state.json"\nrm -f "$MOCK_ROOT/pending.json"`,curl:`echo "$*" >> "$MOCK_CALLS"\nif [[ "$*" == *'/status'* ]];then echo '{"current":"${after}","workers":{"${after}":{}}}';else echo '{}';fi`,docker:'echo unexpected-docker >&2; exit 99'};
 for(const [name,body]of Object.entries(commands)){const p=join(bin,name);writeFileSync(p,'#!/bin/bash\n'+body+'\n');chmodSync(p,0o755);}
 for(const [src,dst]of [['rolling-update.sh','update.sh'],['rolling-maintain.sh','maintain.sh']])writeFileSync(join(root,dst),readFileSync('deploy/ec2/'+src,'utf8').replaceAll('/opt/stronghold/rolling',root).replaceAll('/var/lock/stronghold-rolling.lock',join(dir,'lock')));
 const r=spawnSync('bash',[join(root,'maintain.sh')],{encoding:'utf8',env:{...process.env,PATH:bin+':'+process.env.PATH,MOCK_ROOT:root,MOCK_CALLS:calls}});
 assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/already current/);const log=readFileSync(calls,'utf8');assert.ok(log.includes(after));assert.ok(!log.includes(before));
 }finally{rmSync(dir,{recursive:true,force:true});}
});

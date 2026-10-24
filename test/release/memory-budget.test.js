import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
const updater=readFileSync('deploy/ec2/rolling-update.sh','utf8');
const code=updater.split("<<'PYMEM'\n")[1].split('\nPYMEM')[0];
function check(body){
 const r=spawnSync('python3',['-c',code.replace("if __name__ == '__main__':","if False:")+'\n'+body],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr||r.stdout);
}

test('a single pooled release may use all of the page-aligned 1.4 GiB budget',()=>check(`
assert BUDGET <= 1.4 * 1024**3 < BUDGET+4096
p=plan_memory({'new': {'parent':POOL,'limit':BUDGET}}, 'new')
assert p['pool']==p['limit']==BUDGET
`));
test('two versions share ONE parent limit, with more protection for the latest',()=>check(`
rows={k:{'parent':POOL,'limit':BUDGET} for k in ['old','new']}
p=plan_memory(rows,'new')
assert p['pool']==BUDGET
assert p['reservations']['new'] > p['reservations']['old']
assert sum(p['reservations'].values()) < BUDGET
# Neither momentary usage nor lack of individual headroom can defer a deployment.
rows['old']['used']=BUDGET
assert plan_memory(rows,'new')==p
`));
test('legacy 700 MiB workers remain untouched, and retirement releases their entire reservation',()=>check(`
rows={'old':{'parent':'','limit':700*MIB},'new':{'parent':POOL,'limit':BUDGET}}
p=plan_memory(rows,'new')
assert p['pool']+700*MIB==BUDGET
assert 'old' not in p['reservations']
del rows['old']
assert plan_memory(rows,'new')['pool']==BUDGET
`));
test('live memory limits are never lowered; only soft reservations change between pooled versions',()=>check(`
rows={k:{'parent':POOL,'limit':BUDGET,'swap':BUDGET,'reservation':0} for k in ['old','new']}
p=plan_memory(rows,'new');calls=[]
apply_reservations(rows,p,lambda *args:calls.append(args))
assert len(calls)==2
for args in calls:
    assert args[:2]==('docker','update')
    assert '--memory' not in args and '--memory-swap' not in args
    assert '--memory-reservation' in args
for key,row in rows.items(): row['reservation']=p['reservations'][key]
calls.clear();apply_reservations(rows,p,lambda *args:calls.append(args));assert calls==[]
`));
test('shared slice is persistent, swap-free, and configured without restarting any game',()=>check(`
import tempfile
with tempfile.TemporaryDirectory() as directory:
    calls=[]
    def command(*args):
        calls.append(args)
        if args[:2]==('docker','info'): return '2 systemd'
        if '--property=MemoryMax' in args: return '0'
        if '--property=MemorySwapMax' in args: return '0'
        return ''
    ensure_pool(BUDGET,directory,command)
    text=(pathlib.Path(directory)/POOL).read_text()
    assert 'MemoryMax='+str(BUDGET) in text and 'MemorySwapMax=0' in text
    assert ('systemctl','set-property',POOL,'MemoryMax='+str(BUDGET),'MemorySwapMax=0') in calls
    assert not any('restart' in call or 'stop' in call for call in calls)
`));
test('an unchanged pool performs no property writes',()=>check(`
import tempfile
with tempfile.TemporaryDirectory() as directory:
    (pathlib.Path(directory)/POOL).write_text('fixture')
    calls=[]
    def command(*args):
        calls.append(args)
        if args[:2]==('docker','info'): return '2 systemd'
        if '--property=MemoryMax' in args: return str(BUDGET)
        if '--property=MemorySwapMax' in args: return '0'
        return ''
    ensure_pool(BUDGET,directory,command)
    assert not any('set-property' in call or 'daemon-reload' in call for call in calls)
`));
test('candidate and maintenance both use the shared pool and no RAM preflight defers deployment',()=>{
 assert.match(updater,/allocation=\$\(rebalance_memory "\$release"\)/);
 assert.match(updater,/--cgroup-parent=stronghold-games.slice/);
 assert.match(updater,/--memory-reservation="\$candidate_reservation"/);
 assert.match(updater,/current=\$release\nrebalance_memory/);
 assert.doesNotMatch(updater,/Need at least 512 MiB|guarded_usage|--memory=700m/);
});

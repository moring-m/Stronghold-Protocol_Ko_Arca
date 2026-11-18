#!/usr/bin/env bash
# Installed at /opt/stronghold/rolling/update.sh. Public images, immutable commit tags.
set -Eeuo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
root=/opt/stronghold/rolling
exec 9>/var/lock/stronghold-rolling.lock
flock -w 30 9 || { echo 'Another deployment is running.' >&2; exit 1; }
if [[ ${1:-} == --maintain ]]; then
 # The deployment lock is already held. Never carry a stale release choice
 # across a concurrent deployment or retirement.
 read -r release image < <(python3 - "$root" <<'PYSTATE'
import json,sys
from pathlib import Path
root=Path(sys.argv[1]); pending=root/'pending.json'
if pending.exists():
 s=json.loads(pending.read_text()); print(s['release'],s['image'])
else:
 r=json.loads((root/'state/state.json').read_text())['current']
 print(r,'ghcr.io/moring-m/stronghold-protocol_ko_arca:'+r)
PYSTATE
 )
else
 release=${1:-};image=${2:-}
fi
[[ $release =~ ^[a-f0-9]{40}$ && $image == "ghcr.io/moring-m/stronghold-protocol_ko_arca:$release" ]] || { echo 'Expected immutable repository image and full commit ID.' >&2; exit 1; }
api() { curl --fail-with-body -sS --max-time 10 -H "Authorization: Bearer $(cat "$root/state/token")" -H 'Content-Type: application/json' "http://127.0.0.1:3000/__roll/admin/$1" "${@:2}"; }
status=$(api status)
current=$(python3 -c 'import json,sys;print(json.load(sys.stdin)["current"] or "")' <<<"$status")
# Share a 1.4 GiB game-worker budget. The caller already holds the deployment lock.
rebalance_memory() {
 python3 - "$current" "${1:-}" <<'PYMEM'
# Embedded in the locked updater: one shared cgroup, no additional monitor process.
import json
import pathlib
import re
import subprocess
import sys

MIB = 1024 * 1024
BUDGET = (14 * 1024**3 // 10 // 4096) * 4096
POOL = 'stronghold-games.slice'


def run(*args):
    return subprocess.check_output(args, text=True).strip()


def plan_memory(rows, current):
    if len(rows) > 2:
        raise RuntimeError('Expected at most two game releases')
    # During migration, old 700 MiB containers remain untouched outside the pool.
    # Reserve their full hard limit, not their momentary usage. After retirement,
    # the shared group automatically receives the entire budget.
    legacy = [r for r in rows.values() if r['parent'] != POOL]
    if any(not r['limit'] or r['limit'] > BUDGET for r in legacy):
        raise RuntimeError('Legacy worker has an unknown/unbounded memory limit')
    available = BUDGET - sum(r['limit'] for r in legacy)
    if available <= 0:
        raise RuntimeError('Legacy limits require migration before enabling the shared pool')
    reservations = {key: available * (6 if key == current else 2) // 10
                    for key, row in rows.items() if row['parent'] == POOL}
    return {'pool': available, 'limit': BUDGET, 'reservations': reservations}


def read_rows():
    names = run('docker', 'ps', '--filter', 'name=stronghold-release-', '--format', '{{.Names}}').splitlines()
    names = [n for n in names if re.fullmatch(r'stronghold-release-[a-f0-9]{12,40}', n)]
    if not names:
        return {}
    rows = {}
    for info in json.loads(run('docker', 'inspect', *names)):
        if not info['State']['Running']:
            raise RuntimeError('A container changed during inspection; retry next maintenance')
        host = info['HostConfig']
        rows[info['Name'].lstrip('/').removeprefix('stronghold-release-')] = {
            'parent': host.get('CgroupParent', ''), 'limit': host['Memory'],
            'swap': host['MemorySwap'], 'reservation': host.get('MemoryReservation', 0)}
    return rows


def ensure_pool(budget, unit_dir='/etc/systemd/system', command=run):
    if command('docker', 'info', '--format', '{{.CgroupVersion}} {{.CgroupDriver}}') != '2 systemd':
        raise RuntimeError('Shared game memory requires Docker cgroup v2 with the systemd driver')
    unit = pathlib.Path(unit_dir) / POOL
    if not unit.exists():
        unit.write_text('[Unit]\nDescription=Stronghold shared game memory budget\n'
                        '[Slice]\nMemoryAccounting=yes\nMemoryMax=' + str(budget) + '\nMemorySwapMax=0\n')
        command('systemctl', 'daemon-reload')
    # set-property persists the limit across reboots and applies it without restarting games.
    command('systemctl', 'start', POOL)
    actual = command('systemctl', 'show', POOL, '--property=MemoryMax', '--value')
    swap = command('systemctl', 'show', POOL, '--property=MemorySwapMax', '--value')
    if actual != str(budget) or swap != '0':
        command('systemctl', 'set-property', POOL, 'MemoryMax=' + str(budget), 'MemorySwapMax=0')
        print('Shared game memory: ' + str(budget // MIB) + ' MiB', file=sys.stderr)


def apply_reservations(rows, plan, command=run):
    for key, reservation in plan['reservations'].items():
        row = rows[key]
        args = ['docker', 'update']
        # Children may each use the entire pool. The PARENT bounds their actual sum.
        # Never shrink a live worker to make room for a deployment.
        if row['limit'] < plan['limit'] or row['swap'] != plan['limit']:
            args += ['--memory', str(plan['limit']), '--memory-swap', str(plan['limit'])]
        if row['reservation'] != reservation:
            args += ['--memory-reservation', str(reservation)]
        if len(args) > 2:
            command(*args, 'stronghold-release-' + key)


def main():
    current, candidate = sys.argv[1:3]
    if not re.fullmatch(r'[a-f0-9]{12,40}', candidate or current):
        raise RuntimeError('Invalid current/candidate release')
    rows = read_rows()
    if candidate and (candidate in rows or len(rows) >= 2):
        raise RuntimeError('Candidate already exists or both release slots are occupied')
    plan = plan_memory(rows, candidate or current)
    ensure_pool(plan['pool'])
    apply_reservations(rows, plan)
    print(json.dumps(plan))


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('Memory configuration: ' + str(error), file=sys.stderr)
        sys.exit(1)
PYMEM
}
retired=0
cache_cleaned=0
clean_build_cache() {
 docker builder prune --force || echo 'Build cache cleanup failed; continuing with disk checks.' >&2
 cache_cleaned=1
}
# Expired, disconnected or player-free retained releases may be removed even if rooms remain.
while read -r old;do
 [[ -n $old ]] || continue
 api force-retire -X POST --data "{\"id\":\"$old\"}" >/dev/null
 docker stop "stronghold-release-$old" >/dev/null
 docker rm "stronghold-release-$old" >/dev/null
 docker image rm "ghcr.io/moring-m/stronghold-protocol_ko_arca:$old" >/dev/null 2>&1 || true
 retired=1
 echo "Retired expired, disconnected or player-free release $old"
done < <(python3 -c 'import json,sys,time;s=json.load(sys.stdin);print("\n".join(k for k,v in s["workers"].items() if k!=s["current"] and (isinstance(v.get("expiresAt"),(int,float)) and v["expiresAt"]<=time.time()*1000 or not v.get("unavailable") and (type(v.get("sockets")) in (int,float) and v["sockets"]==0 or type(v.get("humans")) in (int,float) and v["humans"]==0))))' <<<"$status")
status=$(api status)
# Retire only workers explicitly drained and reporting no remaining rooms/matches.
while read -r old; do
 [[ -n $old ]] || continue
 api retire -X POST --data "{\"id\":\"$old\"}" >/dev/null
 docker stop "stronghold-release-$old" >/dev/null
 docker rm "stronghold-release-$old" >/dev/null
 oldimage="ghcr.io/moring-m/stronghold-protocol_ko_arca:$old"
 docker image rm "$oldimage" >/dev/null 2>&1 || true
 retired=1
 echo "Retired empty release $old"
done < <(python3 -c 'import json,sys;s=json.load(sys.stdin);print("\n".join(k for k,v in s["workers"].items() if k!=s["current"] and v.get("draining") and not v.get("rooms",1) and not v.get("matches",1)))' <<<"$status")
if (( retired )); then
 echo 'Retired release removed; pruning unused build cache.'
 clean_build_cache
fi
status=$(api status)
if [[ $current == "$release" ]]; then
 rebalance_memory >/dev/null || echo 'Shared memory configuration failed; running games retained.' >&2
 api activate -X POST --data "{\"id\":\"$release\"}" >/dev/null; rm -f "$root/pending.json"; echo 'Requested release is already current.'; exit 0; fi
count=$(python3 -c 'import json,sys;print(len(json.load(sys.stdin)["workers"]))' <<<"$status")
if (( count >= 2 )); then
 rebalance_memory >/dev/null || echo 'Shared memory configuration failed; running games retained.' >&2
 printf '{"release":"%s","image":"%s"}\n' "$release" "$image" > "$root/pending.json.tmp"
 mv "$root/pending.json.tmp" "$root/pending.json"
 echo 'Deployment queued: a previous release still owns rooms. No extra image/container downloaded.'
 exit 0
fi
free_kb=$(df -Pk /var/lib/docker | awk 'NR==2 {print $4}')
if (( free_kb < 2097152 && !cache_cleaned )); then
 echo 'Docker disk is below 2 GiB free; pruning unused build cache only.'
 # No image/container/volume prune: retained game releases must remain available.
 clean_build_cache
 free_kb=$(df -Pk /var/lib/docker | awk 'NR==2 {print $4}')
fi
(( free_kb >= 2097152 )) || { echo 'Need at least 2 GiB free Docker disk after build cache cleanup; current games were not changed.' >&2; exit 1; }
prefix=$(python3 -c 'import json,sys;s=json.load(sys.stdin);used={v["prefix"] for v in s["workers"].values()};print(next(p for p in "AB" if p not in used))' <<<"$status")
port=3010;[[ $prefix == B ]] && port=3011
name="stronghold-release-$release"
[[ -z $(docker ps -aq --filter "name=^/$name$") ]] || { echo 'Candidate already exists; inspect it before retrying.' >&2; exit 1; }
docker pull "$image"
candidate_started=0;registered=0;activated=0
cleanup(){ local result=$?;trap - EXIT;if (( result != 0 && candidate_started && !activated ));then
 # Only remove a failed candidate after the gateway confirms it is no longer registered.
 if (( registered ));then api retire -X POST --data "{\"id\":\"$release\"}" >/dev/null || { echo 'Candidate retained for inspection.' >&2;exit "$result";};fi
 docker rm -f "$name" >/dev/null 2>&1 || true
 rebalance_memory >/dev/null || true
 fi;exit "$result"; }
trap cleanup EXIT
# Both versions share the parent budget; no low-memory deployment queue or live-worker shrink.
allocation=$(rebalance_memory "$release")
candidate_memory=$(python3 -c 'import json,sys;print(json.load(sys.stdin)["limit"])' <<<"$allocation")
candidate_reservation=$(python3 -c 'import json,sys;print(json.load(sys.stdin)["pool"]*6//10)' <<<"$allocation")
docker run -d --name "$name" --restart unless-stopped --cgroup-parent=stronghold-games.slice \
 --memory="$candidate_memory" --memory-swap="$candidate_memory" --memory-reservation="$candidate_reservation" \
 -p "127.0.0.1:$port:3000" -v "$root/state/token:/run/stronghold/token:ro" \
 -e SP_COMBAT=client -e SP_RELEASE_ID="$release" -e SP_RELEASE_TOKEN_FILE=/run/stronghold/token -e SP_ROOM_PREFIX="$prefix" "$image" >/dev/null
candidate_started=1
healthy=0
for attempt in {1..30};do
 if curl -fsS --max-time 3 "http://127.0.0.1:$port/healthz" >/dev/null;then healthy=1;break;fi
 sleep 2
done
(( healthy )) || { docker logs --tail 50 "$name";exit 1; }
api register -X POST --data "{\"id\":\"$release\",\"port\":$port,\"prefix\":\"$prefix\"}" >/dev/null
registered=1
# Verify the candidate's bootstrap and transformed ESM before redirecting new players.
curl -fsS --max-time 10 "http://127.0.0.1:3000/r/$release/" | python3 -c 'import sys;assert "__SP_RELEASE" in sys.stdin.read()'
curl -fsS --max-time 10 "http://127.0.0.1:3000/js/data.js?release=$release" | python3 -c 'import sys;assert "?release=" in sys.stdin.read()'
api activate -X POST --data "{\"id\":\"$release\"}" >/dev/null
activated=1
current=$release
rebalance_memory >/dev/null || echo 'Shared memory configuration failed; running games retained.' >&2
rm -f "$root/pending.json"
echo "New rooms now use $release. Existing rooms remain on $current."

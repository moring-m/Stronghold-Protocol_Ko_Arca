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
retired=0
cache_cleaned=0
clean_build_cache() {
 docker builder prune --force || echo 'Build cache cleanup failed; continuing with disk checks.' >&2
 cache_cleaned=1
}
# Expired or disconnected retained releases may be removed even if rooms remain.
while read -r old;do
 [[ -n $old ]] || continue
 api force-retire -X POST --data "{\"id\":\"$old\"}" >/dev/null
 docker stop "stronghold-release-$old" >/dev/null
 docker rm "stronghold-release-$old" >/dev/null
 docker image rm "ghcr.io/moring-m/stronghold-protocol_ko_arca:$old" >/dev/null 2>&1 || true
 retired=1
 echo "Retired expired or disconnected release $old"
done < <(python3 -c 'import json,sys,time;s=json.load(sys.stdin);print("\n".join(k for k,v in s["workers"].items() if k!=s["current"] and (isinstance(v.get("expiresAt"),(int,float)) and v["expiresAt"]<=time.time()*1000 or not v.get("unavailable") and type(v.get("sockets")) in (int,float) and v["sockets"]==0)))' <<<"$status")
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
if [[ $current == "$release" ]]; then api activate -X POST --data "{\"id\":\"$release\"}" >/dev/null; rm -f "$root/pending.json"; echo 'Requested release is already current.'; exit 0; fi
count=$(python3 -c 'import json,sys;print(len(json.load(sys.stdin)["workers"]))' <<<"$status")
if (( count >= 2 )); then
 printf '{"release":"%s","image":"%s"}\n' "$release" "$image" > "$root/pending.json.tmp"
 mv "$root/pending.json.tmp" "$root/pending.json"
 echo 'Deployment queued: a previous release still owns rooms. No extra image/container downloaded.'
 exit 0
fi
available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
(( available >= 524288 )) || { echo 'Need at least 512 MiB available RAM; current games were not changed.' >&2; exit 1; }
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
 fi;exit "$result"; }
trap cleanup EXIT
docker run -d --name "$name" --restart unless-stopped --memory=700m --memory-swap=700m \
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
rm -f "$root/pending.json"
echo "New rooms now use $release. Existing rooms remain on $current."

#!/usr/bin/env bash
# Explicitly terminate only retained workers; the current release is protected twice.
set -Eeuo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run with sudo.' >&2;exit 1; }
root=/opt/stronghold/rolling
exec 9>/var/lock/stronghold-rolling.lock
flock -w 30 9 || { echo 'Another deployment is running.' >&2;exit 1; }
api(){ curl --fail-with-body -sS --max-time 15 -H "Authorization: Bearer $(cat "$root/state/token")" -H 'Content-Type: application/json' "http://127.0.0.1:3000/__roll/admin/$1" "${@:2}"; }
status=$(api status)
while read -r old;do
 [[ -n $old ]] || continue
 [[ $old =~ ^[a-f0-9]{12,40}$ ]] || { echo 'Invalid retained release';exit 1; }
 api force-retire -X POST --data "{\"id\":\"$old\"}" >/dev/null
 docker stop "stronghold-release-$old" >/dev/null
 docker rm "stronghold-release-$old" >/dev/null
 docker image rm "ghcr.io/moring-m/stronghold-protocol_ko_arca:$old" >/dev/null 2>&1 || true
 echo "Closed retained release $old"
done < <(python3 -c 'import json,sys;s=json.load(sys.stdin);print("\n".join(k for k in s["workers"] if k!=s["current"]))' <<<"$status")
flock -u 9
bash "$root/maintain.sh"

#!/usr/bin/env bash
# Manual infrastructure update: worker containers are never stopped.
set -Eeuo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run with sudo.' >&2;exit 1; }
release=${1:-}
[[ $release =~ ^[a-f0-9]{40}$ ]] || { echo 'Expected full reviewed image commit.' >&2;exit 1; }
image="ghcr.io/moring-m/stronghold-protocol_ko_arca:$release"
root=/opt/stronghold/rolling
[[ -f "$root/state/state.json" && -f "$root/state/token" ]] || { echo 'Rolling installation is required.' >&2;exit 1; }
[[ $(docker inspect stronghold-router --format '{{.State.Running}}') == true ]] || { echo 'Current router is not running.' >&2;exit 1; }
exec 9>/var/lock/stronghold-rolling.lock
flock -w 30 9 || { echo 'Another deployment is running.' >&2;exit 1; }
available=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo)
(( available >= 196608 )) || { echo 'Need 192 MiB available RAM before candidate validation.' >&2;exit 1; }
docker pull "$image"
candidate="stronghold-router-candidate-$$"
backup="stronghold-router-backup-$(date +%s)-$$"
candidate_created=0;old_stopped=0;old_renamed=0;new_created=0;completed=0
cleanup(){ local result=$?;trap - EXIT;
 if (( candidate_created ));then docker rm -f "$candidate" >/dev/null 2>&1 || true;fi
 if (( !completed && old_stopped ));then
  if (( new_created ));then docker rm -f stronghold-router >/dev/null 2>&1 || true;fi
  if (( old_renamed ));then docker rename "$backup" stronghold-router;fi
  docker start stronghold-router >/dev/null
  echo 'Previous router restored. Game workers were retained.' >&2
 fi
 exit "$result";
}
trap cleanup EXIT
# Validate on a separate loopback port; the candidate cannot persist state changes.
candidate_created=1
docker run -d --name "$candidate" --network host --memory=128m --memory-swap=128m \
 -v "$root/state:/state:ro" -e PORT=3020 -e SP_RELEASE_TOKEN_FILE=/state/token -e SP_RELEASE_STATE_FILE=/state/state.json \
 --entrypoint node "$image" server/release/gateway.js >/dev/null
ready=0
for attempt in {1..15};do
 if curl -fsS --max-time 2 http://127.0.0.1:3020/__roll/latest >/dev/null;then ready=1;break;fi
 sleep 1
done
(( ready )) || { docker logs --tail 30 "$candidate";exit 1; }
curl -fsS --max-time 5 http://127.0.0.1:3020/ | python3 -c 'import sys;assert "sp.activeRelease" in sys.stdin.read(),"Candidate does not support hidden release URLs"'
docker rm -f "$candidate" >/dev/null
candidate_created=0
docker stop stronghold-router >/dev/null
old_stopped=1
docker rename stronghold-router "$backup"
old_renamed=1
new_created=1
docker run -d --name stronghold-router --network host --restart unless-stopped --memory=128m --memory-swap=128m \
 -v "$root/state:/state" -e PORT=3000 -e SP_RELEASE_TOKEN_FILE=/state/token -e SP_RELEASE_STATE_FILE=/state/state.json \
 --entrypoint node "$image" server/release/gateway.js >/dev/null
ready=0
for attempt in {1..15};do
 if curl -fsS --max-time 2 http://127.0.0.1:3000/__roll/latest >/dev/null;then ready=1;break;fi
 sleep 1
done
(( ready )) || { docker logs --tail 30 stronghold-router;exit 1; }
completed=1
echo "Router updated. Workers and rooms were retained; browsers may reconnect briefly. Previous router: $backup"

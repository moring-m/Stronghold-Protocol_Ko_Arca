#!/usr/bin/env bash
# First installation only. Run manually in an announced quiet maintenance window.
set -Eeuo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run with sudo.' >&2;exit 1; }
release=${1:-};image="ghcr.io/moring-m/stronghold-protocol_ko_arca:$release"
[[ $release =~ ^[a-f0-9]{40}$ ]] || { echo 'Usage: sudo bash rolling-install.sh FULL_COMMIT_ID';exit 1; }
root=/opt/stronghold/rolling
[[ ! -e "$root/state/state.json" && -z $(docker ps -aq --filter 'name=^/stronghold-router$') ]] || { echo 'Rolling installation already exists; do not reinstall.';exit 1; }
[[ $(docker inspect stronghold-https --format '{{.HostConfig.NetworkMode}}') == host ]] || { echo 'Expected Caddy host network.';exit 1; }
command -v python3 >/dev/null
healthy=$(curl -fsS --max-time 5 http://127.0.0.1:3000/healthz)
python3 -c 'import json,sys;s=json.load(sys.stdin);assert not s["rooms"] and not s["matches"],"Wait until all rooms are closed"' <<<"$healthy"
# Prepare all files/images while the old process is still running.
(( $(df -Pk /var/lib/docker | awk 'NR==2 {print $4}') >= 2097152 )) || { echo 'Need 2 GiB free Docker disk.';exit 1; }
docker pull "$image"
install -d -m 750 "$root" "$root/state"
chown 1000:1000 "$root/state"
if [[ ! -f "$root/state/token" ]];then openssl rand -hex 32 > "$root/state/token";chmod 600 "$root/state/token";chown 1000:1000 "$root/state/token";fi
for file in rolling-update.sh rolling-maintain.sh rolling-retire-old.sh;do docker run --rm --entrypoint cat "$image" "/app/deploy/ec2/$file" > "$root/${file#rolling-}";chmod 700 "$root/${file#rolling-}";done
docker run --rm --entrypoint cat "$image" /app/deploy/ec2/ssh-deploy-command.sh > /usr/local/bin/stronghold-deploy-ssh
chmod 755 /usr/local/bin/stronghold-deploy-ssh
# Use Caddy's adapted config for temporary maintenance; leave its source file and cert volumes intact.
docker exec stronghold-https caddy adapt --config /etc/caddy/Caddyfile --adapter caddyfile > "$root/caddy-original.json"
python3 - "$root" <<'PY'
import json,sys
root=sys.argv[1];value=json.load(open(root+'/caddy-original.json'));changed=0
def walk(v):
 global changed
 if isinstance(v,dict):
  if v.get('handler')=='reverse_proxy' and any(x.get('dial') in ['127.0.0.1:3000','localhost:3000'] for x in v.get('upstreams',[])):
   v.clear();v.update(handler='static_response',status_code=503,body='Initial upgrade in progress. Please retry shortly.',headers={'Retry-After':['60']});changed+=1
  else:
   for x in v.values():walk(x)
 elif isinstance(v,list):
  for x in v:walk(x)
walk(value)
assert changed==1,'Expected exactly one game reverse_proxy; original Caddy config was not changed'
json.dump(value,open(root+'/caddy-maintenance.json','w'))
PY
maintenance=0;old_stopped=0;completed=0
restore(){ local result=$?;trap - EXIT;
 if (( !completed && old_stopped ));then docker rm -f stronghold-router >/dev/null 2>&1 || true;docker start stronghold-game >/dev/null;fi
 if (( maintenance ));then if ! docker exec stronghold-https caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null;then echo 'Caddy restore failed: reload /etc/caddy/Caddyfile manually.' >&2;result=1;fi;fi
 exit "$result"; }
trap restore EXIT
docker cp "$root/caddy-maintenance.json" stronghold-https:/tmp/stronghold-maintenance.json
docker exec stronghold-https caddy reload --config /tmp/stronghold-maintenance.json >/dev/null
maintenance=1
# Reload closes idle sockets. If any room appeared just before maintenance, abort and restore the original server.
quiet=0
for attempt in {1..15};do
 status=$(curl -fsS --max-time 5 http://127.0.0.1:3000/healthz)
 python3 -c 'import json,sys;s=json.load(sys.stdin);assert not s["rooms"] and not s["matches"],"A room is active; original server retained"' <<<"$status"
 sockets=$(python3 -c 'import json,sys;print(json.load(sys.stdin)["sockets"])' <<<"$status")
 if (( sockets==0 ));then quiet=1;break;fi
 sleep 1
done
(( quiet )) || { echo 'Old sockets remain; initial installation aborted safely.';exit 1; }
docker stop stronghold-game >/dev/null
old_stopped=1
docker run -d --name stronghold-router --network host --restart unless-stopped --memory=256m --memory-swap=256m \
 -v "$root/state:/state" -e PORT=3000 -e SP_RELEASE_TOKEN_FILE=/state/token -e SP_RELEASE_STATE_FILE=/state/state.json \
 --entrypoint node "$image" server/release/gateway.js >/dev/null
for attempt in {1..15};do if curl -sS --max-time 2 http://127.0.0.1:3000/__roll/latest >/dev/null;then break;fi;sleep 1;done
bash "$root/update.sh" "$release" "$image"
cat > /etc/systemd/system/stronghold-release-maintain.service <<SERVICE
[Unit]
Description=Retire empty Stronghold releases and apply the latest queued deployment
After=docker.service
[Service]
Type=oneshot
ExecStart=/bin/bash $root/maintain.sh
SERVICE
cat > /etc/systemd/system/stronghold-release-maintain.timer <<'TIMER'
[Unit]
Description=Check Stronghold release retirement every minute
[Timer]
OnBootSec=60
OnUnitInactiveSec=60
[Install]
WantedBy=timers.target
TIMER
systemctl daemon-reload
systemctl enable --now stronghold-release-maintain.timer
docker exec stronghold-https caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
maintenance=0
completed=1
echo 'Installed. Caddy config/certificate volumes preserved; old stronghold-game retained stopped for manual recovery.'

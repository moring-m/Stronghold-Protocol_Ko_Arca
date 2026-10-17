#!/usr/bin/env bash
# Refresh deployment tools only. Never restart the router or game workers.
set -Eeuo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
root=/opt/stronghold/rolling
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
[[ -f "$root/update.sh" && -f "$root/state/state.json" ]] || { echo 'Rolling installation is required.' >&2; exit 1; }
for file in rolling-update.sh rolling-maintain.sh rolling-retire-old.sh; do
 bash -n "$source_dir/$file"
done
# An already running old maintenance script may have selected a stale release
# before waiting for the lock. Let it finish before installing either new file.
timer_active=0
if systemctl is-active --quiet stronghold-release-maintain.timer; then
 timer_active=1
 systemctl stop stronghold-release-maintain.timer
fi
cleanup() {
 local result=$?
 rm -f "$root/update.sh.next" "$root/maintain.sh.next" "$root/retire-old.sh.next"
 if (( timer_active )); then systemctl start stronghold-release-maintain.timer; fi
 exit "$result"
}
trap cleanup EXIT
for attempt in {1..60}; do
 if ! systemctl is-active --quiet stronghold-release-maintain.service; then break; fi
 if (( attempt == 60 )); then echo 'Maintenance is still running; scripts were not replaced. Retry later.' >&2; exit 1; fi
 sleep 1
done
exec 9>/var/lock/stronghold-rolling.lock
flock -w 60 9 || { echo 'Another deployment is running; retry later.' >&2; exit 1; }
for file in rolling-update.sh rolling-maintain.sh rolling-retire-old.sh; do
 install -m 700 "$source_dir/$file" "$root/${file#rolling-}.next"
done
# New updater accepts both old explicit calls and new --maintain calls.
for file in update.sh maintain.sh retire-old.sh; do mv "$root/$file.next" "$root/$file"; done
echo 'Deployment scripts updated. Router, workers and rooms were retained.'

#!/usr/bin/env bash
# No registry polling/pulls while an old game is active. The updater owns the lock.
set -Eeuo pipefail
root=/opt/stronghold/rolling
if [[ -f "$root/pending.json" ]];then
 read -r release image < <(python3 -c 'import json;s=json.load(open("/opt/stronghold/rolling/pending.json"));print(s["release"],s["image"])')
else
 read -r release image < <(python3 -c 'import json;s=json.load(open("/opt/stronghold/rolling/state/state.json"));r=s["current"];print(r,"ghcr.io/moring-m/stronghold-protocol_ko_arca:"+r)')
fi
bash "$root/update.sh" "$release" "$image"

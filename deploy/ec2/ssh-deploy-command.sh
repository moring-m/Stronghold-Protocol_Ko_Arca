#!/usr/bin/env bash
# Forced-command endpoint for the GitHub Actions SSH key. Never eval remote text.
set -Eeuo pipefail
read -r release image < <(python3 - <<'PY'
import os,shlex,re
parts=shlex.split(os.environ.get('SSH_ORIGINAL_COMMAND',''))
assert len(parts)==6 and parts[:4]==['sudo','-n','bash','/opt/stronghold/rolling/update.sh'],'Only the rolling updater is permitted'
release,image=parts[4:]
assert re.fullmatch('[a-f0-9]{40}',release) and image=='ghcr.io/moring-m/stronghold-protocol_ko_arca:'+release,'Invalid immutable image'
print(release,image)
PY
)
exec sudo -n /bin/bash /opt/stronghold/rolling/update.sh "$release" "$image"

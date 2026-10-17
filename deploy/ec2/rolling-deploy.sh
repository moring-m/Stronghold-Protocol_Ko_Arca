#!/usr/bin/env bash
# The forced SSH command reaches only this validated, immutable repository release.
set -Eeuo pipefail
[[ $(id -u) == 0 ]] || { echo 'Run with sudo.' >&2; exit 1; }
release=${1:-}; image=${2:-}
[[ $release =~ ^[a-f0-9]{40}$ && $image == "ghcr.io/moring-m/stronghold-protocol_ko_arca:$release" ]] || { echo 'Expected immutable repository image and full commit ID.' >&2; exit 1; }
root=/opt/stronghold/rolling
bundle=$(mktemp -d)
trap 'rm -rf -- "$bundle"' EXIT
for file in rolling-scripts-update.sh rolling-update.sh rolling-maintain.sh rolling-retire-old.sh rolling-deploy.sh ssh-deploy-command.sh; do
 curl -fsSL --retry 3 --connect-timeout 10 --max-time 60 \
  "https://raw.githubusercontent.com/moring-m/Stronghold-Protocol_Ko_Arca/$release/deploy/ec2/$file" -o "$bundle/$file"
 bash -n "$bundle/$file"
done
bash "$bundle/rolling-scripts-update.sh"
bash "$root/update.sh" "$release" "$image"

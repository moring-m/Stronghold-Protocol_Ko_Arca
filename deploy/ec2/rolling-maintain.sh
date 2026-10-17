#!/usr/bin/env bash
# No registry polling/pulls while an old game is active. The updater owns the lock.
set -Eeuo pipefail
root=/opt/stronghold/rolling
# Resolve pending/current only inside update.sh's deployment lock. A snapshot
# taken before waiting could reactivate the old release after a new deployment.
bash "$root/update.sh" --maintain

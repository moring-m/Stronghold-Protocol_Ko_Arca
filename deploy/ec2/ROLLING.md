# Rolling updates on the existing EC2 host

Status: v0.2.6c is the initial migration baseline; implementation and local tests, not yet installed on the production server.
The existing manual `update.sh` still stops active games. **After migration, use the rolling updater only.**

## Architecture

Caddy stays in host network mode and continues proxying to `127.0.0.1:3000`.
A permanent `stronghold-router` container now owns that port. Game workers use loopback ports 3010/3011,
with disjoint room-code prefixes A/B. Each immutable Git commit is its release ID.

The router sends new pages to `/r/<release>/`, pins browser requests and module imports to that release,
and proxies WebSockets to the same worker. Reconnect tokens are scoped by release while ordinary preferences,
loadouts and game history retain their existing same-origin storage. Joining an old-version room moves the
browser to that version; its room code remains prefilled and the user selects Join or Spectate there.

Switching releases blocks creation on the old worker, not existing-room participation, gameplay or reconnects.
Old workers remain registered until **rooms and matches are both zero**. Unknown/unreachable workers are not
silently retired. No live game state is copied between workers. This protects deployments, not machine crashes.

The 2 GiB host is limited to two game workers. Another push queues only the latest requested revision on disk;
it does not download a third image. A one-minute systemd timer retires empty old workers and retries the latest
queued release. Low memory/disk aborts a candidate before redirecting new rooms. Build work happens on GitHub.
The gateway itself is a long-lived infrastructure component; future gateway/control-protocol changes require
separate tested maintenance. Ordinary pushes change game workers, not the running gateway.

## First image — no production change

1. Commit/push the reviewed implementation when authorized. Keep repository variable `ROLLING_DEPLOY_ENABLED`
   unset/false. Pushes do not deploy while this variable is off.
2. In GitHub Actions, run **Rolling production deployment** manually with `build_only=true`.
   It tests the router/browser, builds and smoke-tests the image, then publishes an immutable GHCR tag.
3. Make the resulting package `stronghold-protocol_ko_arca` public in GitHub Packages settings. The source
   repository is public; this avoids giving the EC2 machine a registry PAT. Do not enable automatic deployment yet.
4. Copy the full 40-character commit ID shown by the successful build. The image is
   `ghcr.io/moring-m/stronghold-protocol_ko_arca:<commit>`.

## First installation — short quiet maintenance window

Prerequisites confirmed for this installation: `stronghold-game` maps `127.0.0.1:3000`, Caddy is
`stronghold-https`, host network, config `/opt/stronghold/Caddyfile` and existing certificate volumes.
The installer expects exactly one game upstream to `127.0.0.1:3000` or `localhost:3000` in Caddy's adapted config.
It aborts before maintenance for any other topology. It requires at least 2 GiB free Docker disk.

Announce a short maintenance period. Let games finish and ask users to close remaining waiting rooms.

```bash
curl -fsS http://127.0.0.1:3000/healthz
```

Only proceed when `rooms` and `matches` are zero. Download the **reviewed commit's** installer, not an
unreviewed moving `master` revision:

```bash
# Replace COMMIT with the full successful build ID.
COMMIT=FULL_40_CHARACTER_COMMIT_ID
curl -fL "https://raw.githubusercontent.com/moring-m/Stronghold-Protocol_Ko_Arca/$COMMIT/deploy/ec2/rolling-install.sh" -o /tmp/stronghold-rolling-install.sh
sudo bash /tmp/stronghold-rolling-install.sh "$COMMIT"
```

The installer prepares the image first, then loads a temporary Caddy maintenance response without modifying
its source config or certificate volumes. It checks again that no rooms/matches remain and waits for idle sockets
to close. If a room appeared, it aborts and restores Caddy while retaining the original game process.
Only an empty, disconnected server is stopped. Router/worker health checks precede restoration of HTTPS traffic.
Initial clients can disconnect/reload; subsequent ordinary deployments do not stop existing-game workers.
The stopped `stronghold-game` container is kept for recovery and is never force-deleted by this installer.

Check:

```bash
curl -fsS http://127.0.0.1:3000/__roll/latest
sudo docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Ports}}'
sudo systemctl status stronghold-release-maintain.timer --no-pager
sudo docker stats --no-stream
```

Then verify main page, room creation, joining and gameplay manually before enabling automatic deployment.
If installation fails, its trap restores the original server/Caddy where possible. Inspect the error and retained
candidate/state before retrying; do not delete a worker with an active room or run the old destructive updater.

## GitHub deployment key and secrets

Create a dedicated key, not the existing login key. This can be done on a trusted local computer or the EC2
terminal; never paste the private key/token into chat. The public key's authorized_keys entry on EC2 should be:

```text
restrict,command="/usr/local/bin/stronghold-deploy-ssh" ssh-ed25519 PUBLIC_KEY_DATA stronghold-actions
```

The installer provides that forced-command wrapper. It accepts only the pinned repository image + commit
arguments for `/opt/stronghold/rolling/update.sh`; it does not evaluate arbitrary shell text.
Verify `ubuntu` can run that exact script with `sudo -n` (existing EC2 Ubuntu often already has passwordless sudo).

In GitHub Settings → Environments, create `production`, restrict deployments to `master`, and add:

- `EC2_HOST`: stable public hostname/IP (prefer an Elastic IP)
- `EC2_USER`: `ubuntu`
- `EC2_SSH_KEY`: private key, in GitHub's secret field only
- `EC2_KNOWN_HOSTS`: verified SSH host-key entry for that exact host

Verify the host fingerprint against EC2's `/etc/ssh/ssh_host_ed25519_key.pub` before accepting a scanned host key.
Do not disable SSH host-key verification. Required-reviewer approval on the GitHub environment is optional;
leave it off if the desired behavior is fully automatic.

Only after installation and manual tests, set repository variable `ROLLING_DEPLOY_ENABLED=true`.
Pushes to master now build/test/publish and invoke the constrained EC2 updater. A failed build/smoke test never
invokes deployment. A deferred job says 'queued'; the timer applies the latest pending release after a slot frees.

## Deployment tests to perform before calling it operational

Run a real eight-player game. Push a harmless reviewed update while it is in battle.
Check that the old room keeps its game state, reconnect/refresh returns to the same room, an invite/spectator
joins that version, a new room uses the new version, and presets/history remain visible.
Push another update with both workers in use: it must queue with no third worker/image pull.
Close all old rooms: the timer must retire the old worker and apply the latest queued revision.
These production checks are distinct from local automated tests and must occur before enabling unattended use.

## Read-only operational checks

```bash
sudo journalctl -u stronghold-release-maintain.service -n 50 --no-pager
sudo docker stats --no-stream
sudo cat /opt/stronghold/rolling/pending.json  # absent when nothing is pending
```

Do not print the control token or dump container environments. Do not run `docker system prune` or remove
active release images. The updater removes only an explicitly empty, retired release's container/image tag.

## Public server status page

`/status/` is a lightweight read-only page that refreshes every five seconds. Before rolling migration it uses the existing public `/healthz` counts. With the updated gateway, `/__roll/status.json` reports sanitized per-worker and aggregate room, match, player, bot, spectator and connection counts. No room codes, tokens, worker ports or control actions are published. Unreachable workers are explicitly marked and excluded from totals; their absence must not be taken as permission to retire them.

This endpoint is a gateway change. For an installation that has not started, build and install the reviewed commit containing this feature, rather than the earlier image. On an already migrated host, ordinary worker deployments do not replace the gateway; plan a separate gateway maintenance update. CPU and memory metrics remain available through EC2 Docker tools, not this public page.

## Hidden version URLs

The updated gateway shows the root address in the browser while requests remain pinned to their game release. A per-tab session entry selects the existing version on refresh; newly opened main-page tabs select the current release. Room invites select their owning worker, and a retired version falls back to the current release. The old URL routes remain available internally.

This is a router infrastructure change: ordinary game deployments do not install it. After a reviewed image containing this change is built, run `sudo bash rolling-router-update.sh FULL_COMMIT_ID` using that commit's script. It validates a candidate on loopback port 3020 before replacing the router. The game worker containers and room state are retained. Browser connections may briefly reconnect; on failure the old router is restarted. The maintenance timer and Actions deployment share its lock. Do not rerun the first-installation script.

### Router memory and disconnects

The router uses a 256 MiB container limit and a 16 MiB transformed-module cache.
Concurrent requests for the same module share one transformation. An `oom` Docker
event followed by `die` with exit code 137 confirms a memory kill; `OOMKilled=false`
after restart does not exclude earlier kills. Increase an existing 128 MiB router
without restarting it with:

```bash
sudo docker update --memory 256m --memory-swap 256m stronghold-router
```

The updated installation and router replacement scripts preserve the 256 MiB limit.

### Two-hour retained-release deadline

Activating a new release gives the previous release an absolute two-hour deadline.
It is stored in router state and never extended by reactivating the current release
or restarting the router. Retained clients are warned at activation and with one
hour, 30 minutes, 10 minutes, five minutes and one minute remaining. Workers close
their rooms at the deadline; the router also disconnects and rejects expired-release
connections. The maintenance timer removes the old container and starts the queued
deployment on its next run (within about a minute). The current release is never
force-retired. Older workers without this feature receive browser fallback notices
after a page reload. Existing retained releases without metadata get a two-hour
deadline when the upgraded router first reconciles them.

The router updater installs the new update, maintenance and manual retirement
scripts under `/opt/stronghold/rolling/`. To terminate all retained releases early
while keeping the current release and its rooms, run:

```bash
sudo bash /opt/stronghold/rolling/retire-old.sh
```

This explicitly ends retained rooms and matches and then processes a queued update.
The protected `force-retire` API refuses the current release. The shared deployment
lock prevents the manual command from racing an update.

### Automatic build-cache cleanup

After removing retired workers and their image tags (empty releases or releases
past their deadline), the updater prunes unused build cache once. The manual
`retire-old.sh` command does the same after closing retained workers. Shared cache
records still in use are protected by Docker. Cleanup failure does not prevent
maintenance from continuing.

Before pulling a new worker image, the updater requires 512 MiB available RAM and
2 GiB free Docker disk. If disk space is below that threshold, it runs
`docker builder prune --force` once and checks the free space again. Only unused
build cache is pruned; no game containers, images or volumes are pruned. If space
is still insufficient, deployment stops and existing games continue. If no release was retired, cleanup is skipped when the requested version is
already current or a deployment is queued behind two occupied workers. Install the updated `update.sh` through the reviewed
router updater; pushing game code alone does not replace host deployment scripts.

Retained workers are also force-retired when their live socket count is zero,
even if abandoned rooms or games remain. The current worker is always excluded.
Missing socket counts and failed status requests never count as zero. Older workers
are checked through healthz. The maintenance timer applies this check about once a
minute; install both the updated router and host update script for this policy.

### Existing installations: restricted SSH script refresh

The Actions key continues to permit only `sudo -n bash /opt/stronghold/rolling/update.sh FULL_SHA IMAGE`.
The forced-command wrapper validates that exact command and delegates to `deploy.sh`, which fetches the
reviewed scripts at that immutable repository commit, installs them without restarting router/workers,
and invokes the rolling updater. Do not remove the `restrict,command=...` public-key restriction or enable SCP.

Install the new wrapper/bootstrap once from a trusted console on existing hosts. Download
`rolling-scripts-update.sh`, `rolling-update.sh`, `rolling-maintain.sh`, `rolling-retire-old.sh`,
`rolling-deploy.sh`, and `ssh-deploy-command.sh` from the same full commit into a temporary directory,
then run `sudo bash DIR/rolling-scripts-update.sh`. Future Actions deployments refresh scripts automatically.

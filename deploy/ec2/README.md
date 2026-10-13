> For the new reviewed rolling-update procedure, see [ROLLING.md](ROLLING.md). It is not installed yet. The manual procedure below still replaces the running process and ends active games. Do not use it after rolling migration.

# Manual EC2 updates

GitHub pushes do not deploy automatically. Run the update command on EC2 when you want to publish the latest `master` revision. Replacing the game process ends active rooms and matches.

## Switch the existing installation

The existing Docker installation and Caddy HTTPS container must already work. Ubuntu 24.04 and x86 Docker with Buildx are expected. The script leaves `/opt/stronghold/Caddyfile` and Caddy certificate volumes unchanged.

On the EC2 Ubuntu terminal:

```bash
curl -fL https://raw.githubusercontent.com/moring-m/Stronghold-Protocol_Ko_Arca/master/deploy/ec2/update.sh -o /tmp/stronghold-update.sh
sudo bash /tmp/stronghold-update.sh
```

The script clones the public repository into `/opt/stronghold-git/source`. It downloads source and resource metadata, builds the game image, verifies health and the browser resource index, then replaces `stronghold-game`. Failed startup restores the previous container. Failed builds leave the running game untouched. The previous process's rooms cannot be recovered after replacement or rollback.

## Later updates

After committing and pushing code to GitHub, run manually on EC2:

```bash
sudo bash /opt/stronghold-git/source/deploy/ec2/update.sh
```

The updater pulls `master` with `--ff-only`, refuses local modifications or an unexpected remote, and runs the updater from the new revision. There is no cron, webhook, or GitHub Actions deployment. Root-owned checkout commands should also be run with `sudo`.

Browser resources are prepared at Docker build time with `BROWSER_RESOURCES=1`. Game art stays in the browser cache and is not added to the image. Keeping the same HTTPS domain and resource version preserves the art cache. A game code update alone does not intentionally change the resource version.

## Checks and disk usage

```bash
sudo docker ps
curl -fsS http://127.0.0.1:3000/healthz
sudo docker stats --no-stream
df -h /
```

Older tagged images are retained. On a small disk, review `sudo docker system df` and remove specific obsolete image tags when needed. Do not remove Caddy's data volumes. Building on a 1 GB instance can be slow or fail under memory pressure; health checks protect the running deployment from a failed build but cannot prevent resource contention.

## Prepared local changes (Ursus, recruits, voices, skins and battle/UI fixes)

`content/production/` contains the prepared local game data, the complete browser resource index, and local artwork that has no mirror URL. Docker applies this catalogue with `tools/apply-production.mjs` before starting the regular production server. It does not run the development preview or require `.cache` files/source tables on EC2. Ursus remains gated by the host's custom-faction setting; the full operator configuration catalogue remains available.

After a future local-data change, restart the local test server to regenerate its data, then prepare the catalogue:

```bash
node tools/prepare-production.mjs /tmp/stronghold-production --publish-data
```

Commit and push the source changes **and `content/production/`** to `master`. Then run the same existing manual EC2 update command:

```bash
sudo bash /opt/stronghold-git/source/deploy/ec2/update.sh
```

The updater still builds and checks the image before replacing the game container. The prepared resource index includes voices, skins, skill sounds, custom operators/equipment/strategy, and extracted map/VFX art. The browser reuses cached paths and downloads missing entries; bundled local resources use same-origin downloads. Keep changed artwork on a new path (Kaschey's current portrait uses `kaschey-portrait-v3.png`) so an older cached file cannot hide the update. Domain, Caddy and certificate volumes remain unchanged.

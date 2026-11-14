"""规程 (act3autochess) art the fork is missing, from the locally installed CN client.

Run from the regulation extraction kit (tools/build-regulation-extract-kit.py builds it); client files are never
modified. The kit's regulation-plan.json (made by the repository, tools/audit-regulation-missing.mjs and
tools/assets/versions.mjs filtered against the fork's catalogue) names every target:
  1. scenes   the ten 规程 battlefields: level_<stage>_sub_01..03 piece prefabs → scene/<stageId>/ (regulation_scenes)
  2. art      the version roster's missing presentation art (versions.export with the precomputed jobs): operator
              Spine (front/back) and portraits/avatars, enemy and token Spine, enemy icons, token avatars, skill icons,
              battle SFX, BGM and Korean voices (MP3 through ffmpeg)
  3. fx       the official battle effects of every season unit that has none (fx.export_fx, the `used` crawl over a
              data root that names only those units)
  4. inventory  the act3autochess bundles' prefab trees (what the season ships that no exporter reads yet)
Writes regulation-<stamp>/ and a zip of it (split in 20 MiB parts when larger). PARTIAL is reported, never hidden.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import sys
import time
import traceback

sys.path.insert(0, str(Path(__file__).resolve().parent))
import fx  # noqa: E402
from cn_skins import discover_client, package  # noqa: E402

PLAN_FILE = 'regulation-plan.json'


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def fx_root(kit, plan):
    """A data root whose chess/enemies/tokens name only the units without official effects (fx.game_data reads it)."""
    root = kit / 'work' / 'regulation-fx-root'
    if root.exists():
        shutil.rmtree(root)
    write(root / 'data' / 'chess.json', plan['fx']['chess'])
    write(root / 'data' / 'enemies.json', plan['fx']['enemies'])
    write(root / 'data' / 'tokens.json', plan['fx']['tokens'])
    write(root / 'data' / 'backups.json', {})
    return root


def run(kit, game, output, only):
    import extract
    import regulation_scenes
    import versions

    plan = json.loads((kit / PLAN_FILE).read_text(encoding='utf-8'))
    output.mkdir(parents=True)
    assets = output / 'assets' / 'local'
    log_lines = []
    report = {'format': 'regulation-recovery', 'version': 1, 'season': plan.get('version'),
              'targets': plan.get('counts'), 'ffmpeg': bool(shutil.which('ffmpeg')), 'stages': {}}

    def log(line):
        print(line, flush=True)
        log_lines.append(str(line))

    def stage(name, fn):
        if only and name not in only:
            return
        t = time.time()
        try:
            result = fn()
            report['stages'][name] = {'ok': True, 'seconds': round(time.time() - t, 1), **(result or {})}
        except Exception as e:  # noqa: BLE001 (each stage reports its own failure; the next still runs)
            report['stages'][name] = {'ok': False, 'error': str(e), 'trace': traceback.format_exc()[-4000:]}
            log(f'FAIL {name}: {e}')

    def do_scenes():
        manifest = {}
        ids = plan['stages']
        n = regulation_scenes.export_regulation(game, assets, manifest, log, ids, [game], extract.material_info,
                                                extract.dep_bundles(game, {'Material'}))
        write(output / 'local-assets.scenes.json', manifest)
        done = sorted(g.split('/', 1)[1] for g in manifest if g.startswith('scene/') and g != 'scene/tex')
        return {'files': n, 'stages': done, 'missingStages': sorted(set(ids) - set(done))}

    def do_art():
        groups = {}
        n = versions.export(game, assets, groups, log, kit, jobs=plan['art'])
        write(output / 'local-assets.art.json', groups)
        wanted = [j['path'] for j in plan['art']['sprites']] + [j['path'] for j in plan['art']['audio']]
        missing = [p for p in wanted if not (output / 'assets' / p).is_file()]
        return {'files': n, 'missingFiles': len(missing), 'missingSample': missing[:40]}

    def do_fx():
        root = fx_root(kit, plan)
        manifest = output / 'fx' / 'local-fx.json'
        n = fx.export_fx(game, assets, {}, log, selection='used', root=root, fx_manifest=manifest)
        index = output / 'assets' / 'local' / fx.FX_SUB / 'index.json'
        units = set((json.loads(index.read_text(encoding='utf-8')).get('units') or {})) if index.is_file() else set()
        want = set(plan['fx']['units'])
        return {'files': n, 'units': len(units & want), 'missingUnits': sorted(want - units)}

    def do_inventory():
        from targeted_recovery import inventory
        inv = inventory(game, plan['inventoryNeedles'], log)
        write(output / 'inventory.json', inv)
        return {'bundles': len(inv['bundles']), 'prefabs': len(inv['prefabs']), 'errors': len(inv['errors'])}

    stage('scenes', do_scenes)
    stage('art', do_art)
    stage('fx', do_fx)
    stage('inventory', do_inventory)
    st = report['stages']
    report['complete'] = (bool(st) and all(s.get('ok') for s in st.values())
                          and not st.get('scenes', {}).get('missingStages')
                          and not st.get('fx', {}).get('missingUnits')
                          and not st.get('art', {}).get('missingFiles'))
    write(output / 'regulation-report.json', report)
    (output / 'run.log').write_text('\n'.join(log_lines), encoding='utf-8')
    files = []
    for p in sorted(output.rglob('*')):
        if p.is_file():
            data = p.read_bytes()
            files.append({'path': p.relative_to(output).as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    write(output / 'files.json', files)
    package(output)
    print('COMPLETE' if report['complete'] else 'PARTIAL: upload every file listed after UPLOAD, regulation-report.json and the log.', flush=True)
    return report


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument('--root', help='a prepared client view (work/cn-client-*)')
    p.add_argument('--client', help='the installed CN game folder (a fresh read-only view is prepared)')
    p.add_argument('--out')
    p.add_argument('--only', action='append', default=[], choices=('scenes', 'art', 'fx', 'inventory'))
    a = p.parse_args()
    kit = Path(__file__).resolve().parents[2]
    stamp = time.strftime('%Y%m%d-%H%M%S') + '-' + str(time.time_ns())[-6:]
    if a.root:
        game = Path(a.root)
    elif a.client:
        sys.path.insert(0, str(kit))
        from prepare_client import prepare
        base, updates = discover_client(a.client)
        game = kit / 'work' / ('cn-client-' + stamp)
        prepare(base, updates, game)
    else:
        raise SystemExit('Supply the prepared CN client with --root, or the installed CN game with --client.')
    if not game.is_dir():
        raise SystemExit('CN client folder not found')
    report = run(kit, game, Path(a.out) if a.out else kit / ('regulation-' + stamp), set(a.only))
    if not report['complete']:
        raise SystemExit(2)


if __name__ == '__main__':
    main()

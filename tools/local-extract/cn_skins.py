"""Windows CN client costume delta extraction; existing outputs and client bytes are never modified."""
import argparse
import gc
import hashlib
import json
import shutil
import sys
import time
import urllib.request
import zipfile
from datetime import datetime
from pathlib import Path


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)


def select_catalog(table, known):
    rows = table.get('charSkins', {})
    if not isinstance(rows, dict):
        raise ValueError('Invalid CN skin_table.json: charSkins missing')
    all_skins = [dict(skinId=key, **{k: v for k, v in value.items() if k != 'skinId'})
                 for key, value in rows.items()
                 if isinstance(value, dict) and value.get('charId', '').startswith('char_')
                 and (value.get('displaySkin') or {}).get('skinName')
                 and (value.get('battleSkin') or {}).get('skinOrPrefabId')]
    return all_skins, [s for s in all_skins if s['skinId'] not in set(known)]


def discover_client(folder):
    folder = Path(folder).resolve()
    if folder.name in ('Windows', 'StandaloneWindows64') and any((folder / d).is_dir() for d in ('pkgrps','battle','chararts')):
        base = folder
    else:
        options = [folder / 'StreamingAssets/AB/Windows', folder / 'Arknights_Data/StreamingAssets/AB/Windows']
        options += list(folder.glob('*/Arknights_Data/StreamingAssets/AB/Windows'))
        base = next((p for p in options if p.is_dir()), None)
    if base is None:
        raise ValueError('CN PC client AB/Windows not found. Select the CN game folder or its AB/Windows folder.')
    updates = base.parents[2] / 'PersistentData/Bundles'
    return base, updates


def latest_catalog(kit, local=None):
    if local:
        return read(local), str(Path(local).name)
    errors = []
    for url in ('https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/skin_table.json',
                'https://cdn.jsdelivr.net/gh/Kengxxiao/ArknightsGameData@master/zh_CN/gamedata/excel/skin_table.json'):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'Arknights-CN-Skin-FX-Kit/1'})
            with urllib.request.urlopen(request, timeout=30) as response:
                table = json.load(response)
            select_catalog(table, [])
            write(kit / 'state/latest-cn-skin-table.json', table)
            return table, url
        except Exception as error:
            errors.append(str(error))
    cached = kit / 'state/latest-cn-skin-table.json'
    table = read(cached if cached.exists() else kit / 'cn-skin-table.snapshot.json')
    print('WARNING: catalogue refresh failed; using saved CN catalogue. Newer skins may be missing.', flush=True)
    print('Supply --catalog PATH to use a newer CN skin_table.json. ' + ' / '.join(errors), flush=True)
    return table, 'saved-snapshot'


def validate_payloads(output):
    for manifest in output.rglob('local-fx.json'):
        if manifest.parent.name != 'data':
            continue
        public = manifest.parent.parent / 'public'
        for rows in read(manifest).get('groups', {}).values():
            for value in rows.values():
                for path in (value.get('path'), value.get('half')):
                    if path and not (public / path.lstrip('/')).is_file():
                        raise ValueError('Incomplete export: ' + path)


def update_state(kit, output, report, followup, baseline):
    # A failed bundle must remain eligible on the next run.
    if report.get('diagnostics'):
        print('WARNING: bundle diagnostics found; completion state was NOT advanced.', flush=True)
        return False
    matched = {key for row in report.get('skins', []) for key in row.get('skinIds', [])}
    known_file = kit / 'state/known-skins.json'
    known = set(read(known_file) if known_file.exists() else read(kit / 'known-skins.snapshot.json'))
    known.update(matched)
    for index_file in output.rglob('index.json'):
        if index_file.parent.name != 'fx':
            continue
        index = read(index_file)
        for section in ('prefabs', 'projectiles', 'skills'):
            baseline[section] = sorted(set(baseline.get(section, [])) | set(index.get(section, {})))
    for manifest in output.rglob('local-fx.json'):
        for section, group in [('prefabs', 'fx/prefabs'), ('textures', 'fx/tex'), ('meshes', 'fx/mesh')]:
            baseline[section] = sorted(set(baseline.get(section, [])) | set(read(manifest).get('groups', {}).get(group, {})))
    baseline['projectiles'] = sorted(set(baseline.get('projectiles', [])) | set(followup.get('projectiles', {})))
    baseline['skills'] = sorted(set(baseline.get('skills', [])) | set(followup.get('skills', {})))
    # Baseline first: an interruption may re-export a skin, but never silently omit its missing dependencies.
    write(kit / 'state/baseline.json', baseline)
    write(known_file, sorted(known))
    return True


def package(output):
    archive = output.with_suffix('.zip')
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=3) as z:
        for path in sorted(output.rglob('*')):
            if path.is_file():
                z.write(path, path.relative_to(output.parent))
    parts = []
    if archive.stat().st_size > 20 * 1024 * 1024:
        with archive.open('rb') as stream:
            number = 1
            while chunk := stream.read(20 * 1024 * 1024):
                part = Path(str(archive) + f'.{number:03d}')
                part.write_bytes(chunk)
                parts.append(part.name)
                number += 1
    print('UPLOAD: ' + (', '.join(parts) if parts else archive.name), flush=True)
    return parts or [archive.name]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--client', required=True)
    parser.add_argument('--catalog', help='Optional local CN skin_table.json')
    args = parser.parse_args()
    kit = Path(__file__).resolve().parent
    sys.path.insert(0, str(kit / 'tools/local-extract'))
    import fx
    from skin_fx import export_skins
    from complete_skin_fx import complete
    from prepare_client import prepare
    baseline_file = kit / 'state/baseline.json'
    baseline = read(baseline_file if baseline_file.exists() else kit / 'baseline.snapshot.json')
    known_file = kit / 'state/known-skins.json'
    known = read(known_file if known_file.exists() else kit / 'known-skins.snapshot.json')
    table, source = latest_catalog(kit, args.catalog)
    all_skins, pending = select_catalog(table, known)
    print(f'CN catalogue: {len(all_skins)} skins; already completed: {len(all_skins)-len(pending)}; candidates: {len(pending)}', flush=True)
    if not pending:
        print('DONE: no unprocessed skins in this catalogue. No bundles were extracted.', flush=True)
        return
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S') + '-' + str(time.time_ns())[-6:]
    base, updates = discover_client(args.client)
    stage = kit / 'work' / ('cn-client-' + stamp)
    prepare(base, updates, stage)
    run = kit / 'work' / ('run-' + stamp)
    run.mkdir(parents=True)
    # Every client/run has its own index cache, never a stale KR bundle cache.
    write(run / 'skin-catalog.json', pending)
    write(run / 'skin-baseline.json', baseline)
    cabs = fx.scan_cabs(stage, dirs=fx.CAB_DIRS + ('refs/arts', 'chararts', 'charpack'))
    for number, char in enumerate(sorted({s['charId'] for s in pending}), 1):
        if char in baseline.get('graphics', {}):
            continue
        rel = f'charpack/{char}.ab'
        if not (stage / rel).exists():
            continue
        env = fx.AssetEnv(stage, cabs)
        try:
            unit = fx.parse_unit(env, rel, char, 'char')
            if unit and unit.get('graphic'):
                baseline.setdefault('graphics', {})[char] = unit['graphic']
        except Exception as error:
            print(f'WARNING: mount frame {char}: {error}', flush=True)
        finally:
            del env
            gc.collect()
    write(run / 'skin-baseline.json', baseline)
    output = kit / ('cn-skin-output-' + stamp)
    report = export_skins(stage, run, output, strict_catalog=True)
    followup = complete(stage, run, output, output / 'projectile-wiring')
    validate_payloads(output)
    advanced = update_state(kit, output, report, followup, baseline)
    write(output / 'cn-run-summary.json', {'client':'CN-PC','catalogueSource':source,
          'alreadyCompleted':len(all_skins)-len(pending),'candidates':len(pending),
          'skins':report['summary'],'projectiles':followup['summary'],'completionStateUpdated':advanced,
          'unmatched':len(report.get('unmatchedSkinIds', []))})
    package(output)
    print('DONE. Original client and previous exports were not modified.', flush=True)


if __name__ == '__main__':
    main()

"""Targeted CN recovery (2026-10-26): diagnose and extract the visuals the resource audit found missing.

Run from the existing CN extraction kit folder (.venv, prepare_client.py, work/); client files are never modified.
  1. inventory  every prefab of the bundles naming a target: node tree, active flags, component classes, Spine,
                particle and renderer presence (finds unreferenced assets such as 克莱门莎 S2's cabin and vortex)
  2. models     Spine models of the target operators / tokens (all graphic nodes, Front/Back) and the missing skins
  3. fx         the target units' official effects and mount points (crawled like the used set), then every
                effect prefab of their effect bundles, referenced or not
Writes cn-targeted-<stamp>/ and a zip of it (split in 20 MiB parts when larger).
"""
import argparse
import hashlib
import json
from pathlib import Path
import sys
import time
import traceback
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fx
from cn_skins import latest_catalog, discover_client, package
from recovery_models import export_models

PLAN_FILE = 'targeted-plan.json'


def write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')


def bundle_matches(rel, needles):
    low = rel.lower()
    return any(n.lower() in low for n in needles)


def inventory(game, needles, log):
    """Every prefab of the bundles naming a needle: its nodes with their components."""
    cabs = fx.scan_cabs(game, dirs=fx.CAB_DIRS + ('refs/arts', 'chararts', 'charpack'))
    env = fx.AssetEnv(game, cabs)
    bundles = [p.relative_to(game).as_posix() for p in sorted(game.rglob('*.ab')) if bundle_matches(p.relative_to(game).as_posix(), needles)]
    log(f'inventory: {len(bundles)} bundles')
    out, errors = [], []
    for rel in bundles:
        try:
            prefabs = env.prefabs(rel, full=True)
        except Exception as e:
            errors.append({'bundle': rel, 'error': str(e)})
            continue
        for container, root in prefabs.items():
            nodes, stack, seen = [], [(root, '', True)], set()
            try:
                while stack:
                    go, parent, active = stack.pop()
                    ident = (id(go.assets_file), go.path_id)
                    if ident in seen:
                        continue
                    seen.add(ident)
                    d = env.tt(go)
                    path = parent + d.get('m_Name', '')
                    active = active and bool(d.get('m_IsActive', 1))
                    comps = []
                    for entry in d.get('m_Component') or []:
                        try:
                            f, obj = env.resolve(go.assets_file, entry.get('component'))
                        except Exception:
                            obj = None
                        if obj is None or not hasattr(obj, 'type'):   # unresolved, or Unity's builtin resources
                            continue
                        name = obj.type.name
                        if name == 'MonoBehaviour':
                            ns, cls = env.script(obj)
                            data = env.tt(obj)
                            name = f'{ns}.{cls}' if ns else cls
                            if data.get('skeletonDataAsset') or data.get('_skeletonDataAsset'):
                                name += '[spine]'
                        comps.append(name)
                    nodes.append({'path': path, 'active': active, 'self': bool(d.get('m_IsActive', 1)), 'components': comps})
                    stack.extend((c, path + '/', active) for c in fx.go_children(env, go))
            except Exception as e:
                errors.append({'bundle': rel, 'container': container, 'error': str(e)})
            out.append({'bundle': rel, 'container': container, 'nodes': nodes})
    return {'bundles': bundles, 'prefabs': out, 'errors': errors}


def fx_root(kit, plan):
    """A minimal data root whose game data names only the target units (fx.game_data reads data/*.json)."""
    root = kit / 'work' / 'targeted-fx-root'
    write(root / 'data' / 'chess.json', plan['chessRecords'])
    write(root / 'data' / 'tokens.json', plan['tokenRecords'])
    write(root / 'data' / 'backups.json', {})
    return root


def run(kit, game, output, table, catalog_source):
    plan = json.loads((kit / PLAN_FILE).read_text(encoding='utf-8'))
    output.mkdir(parents=True)
    log_lines, report = [], {'format': 'cn-targeted-recovery', 'version': 1, 'catalogueSource': catalog_source,
                              'plan': {k: v for k, v in plan.items() if k not in ('chessRecords', 'tokenRecords')},
                              'stages': {}}

    def log(line):
        print(line, flush=True)
        log_lines.append(str(line))

    def stage(name, fn):
        t = time.time()
        try:
            result = fn()
            report['stages'][name] = {'ok': True, 'seconds': round(time.time() - t, 1), **(result or {})}
        except Exception as e:
            report['stages'][name] = {'ok': False, 'error': str(e), 'trace': traceback.format_exc()[-4000:]}
            log(f'FAIL {name}: {e}')

    def do_inventory():
        inv = inventory(game, plan['inventoryNeedles'], log)
        write(output / 'inventory.json', inv)
        return {'bundles': len(inv['bundles']), 'prefabs': len(inv['prefabs']), 'errors': len(inv['errors'])}

    def do_models():
        rows = [dict(skinId=k, **{a: b for a, b in v.items() if a != 'skinId'}) for k, v in (table.get('charSkins') or {}).items()
                if k in set(plan['skinIds'])]
        res = export_models(game, output / 'models', rows, plan['modelIds'], log)
        return {'models': len(res.get('models', [])), 'missingSkinModels': res.get('missingSkinModels', []),
                'errors': len(res.get('errors', []))}

    def do_fx():
        root = fx_root(kit, plan)
        manifest = output / 'fx' / 'local-fx.json'
        n = fx.export_fx(game, output / 'fx-out', {}, log, selection='used', root=root, fx_manifest=manifest)
        eff = fx.container_index(game, fx.EFFECT_GLOBS, root / '.cache/fx/effects.json', 4, log)
        # effect bundles are named by codename, or packed (pkgrps/btl_pfb_fx_*): match the prefab key's codename too
        codes = [c.lower() for c in plan['effectBundles']]
        keys = sorted(k for k, rel in eff.items() if bundle_matches(rel, codes) or k.lower().split('_')[0] in codes)
        write(output / 'fx-bundle-keys.json', keys)
        m = fx.export_fx(game, output / 'fx-out', {}, log, keys=keys, root=root, fx_manifest=manifest) if keys else 0
        return {'filesUsedUnits': n, 'bundleKeys': len(keys), 'filesBundleKeys': m}

    stage('inventory', do_inventory)
    stage('models', do_models)
    stage('fx', do_fx)
    # a stage that ran but found nothing (no target bundle, a requested skin absent) is not complete either
    st = report['stages']
    report['complete'] = (all(s.get('ok') for s in st.values()) and st['inventory'].get('bundles', 0) > 0
                          and not st['models'].get('missingSkinModels'))
    write(output / 'targeted-report.json', report)
    (output / 'run.log').write_text('\n'.join(log_lines), encoding='utf-8')
    files = []
    for p in sorted(output.rglob('*')):
        if p.is_file():
            data = p.read_bytes()
            files.append({'path': p.relative_to(output).as_posix(), 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
    write(output / 'files.json', files)
    package(output)
    print('COMPLETE' if report['complete'] else 'PARTIAL: upload every file listed after UPLOAD and targeted-report.json.', flush=True)
    return report


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--root'); p.add_argument('--client'); p.add_argument('--catalog'); p.add_argument('--out')
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
    table, source = latest_catalog(kit, a.catalog)
    report = run(kit, game, Path(a.out) if a.out else kit / ('cn-targeted-' + stamp), table, source)
    if not report['complete']:
        raise SystemExit(2)


if __name__ == '__main__':
    main()

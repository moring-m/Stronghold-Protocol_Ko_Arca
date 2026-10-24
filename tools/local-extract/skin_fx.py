"""Export costume-only FX and serialized skin overrides; never edit client bundles or base FX.
Run from the existing Windows extraction kit with its .venv Python.
"""
import argparse
import gc
import json
import re
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fx


def normalized(value):
    return re.sub(r'[^a-z0-9]', '', str(value).lower())


def matching_skins(container, bundle, catalog):
    """Match declared prefab ids, or char id + outfit stem; defaultskin is never a costume."""
    leaf = container.rsplit('/', 1)[-1].removesuffix('.prefab')
    path = normalized(container)
    bundle_key = normalized(bundle)
    found = []
    for skin in catalog:
        char = skin['charId']
        prefab = skin['battleSkin']['skinOrPrefabId']
        # DefaultSkin is shared by every operator: bind it to its declared character only.
        if normalized(prefab) == 'defaultskin':
            variant_match = any(s['charId'] == char and normalized(s['battleSkin']['skinOrPrefabId']) != 'defaultskin'
                                and normalized(s['battleSkin']['skinOrPrefabId']) in path + bundle_key for s in catalog)
            base_bundle = normalized(bundle.rsplit('/', 1)[-1].removesuffix('.ab')) == normalized(char)
            base_container = container.lower().endswith('/' + char.lower() + '/defaultskin.prefab')
            if not variant_match and (base_bundle or base_container) and normalized(leaf) == 'defaultskin':
                found.append(skin)
            continue
        if normalized(prefab) in path or normalized(prefab) in bundle_key:
            found.append(skin)
            continue
        suffix = prefab[len(char):].lstrip('_') if prefab.startswith(char) else ''
        if normalized(char) in path + bundle_key and suffix and normalized(suffix) == normalized(leaf):
            found.append(skin)
    return found


def skin_components(env, root, known_effects):
    """Keep every component's override fields and named PPtr targets for later schema-aware wiring."""
    components, references = [], set()
    visited = set()
    stack = [(root, '')]
    while stack:
        go, parent = stack.pop()
        identity = (id(go.assets_file), go.path_id)
        if identity in visited:
            continue
        visited.add(identity)
        data = env.tt(go)
        node = parent + data.get('m_Name', '')
        for component in data.get('m_Component', []):
            source, obj = env.resolve(go.assets_file, component.get('component'))
            if obj is None or source == 'builtin' or obj.type.name != 'MonoBehaviour':
                continue
            def pointer(ptr, sf=obj.assets_file):
                target_file, target = env.resolve(sf, ptr)
                if target is None or target_file == 'builtin':
                    return None
                record = env.tt(target)
                name = record.get('m_Name') or record.get('name')
                # Transform records have no name; preserve the referenced GameObject's identity for animator slots.
                if not name and target.type.name == 'Transform':
                    go_file, go = env.resolve(target.assets_file, record.get('m_GameObject'))
                    if go is not None and go_file != 'builtin':
                        name = env.tt(go).get('m_Name')
                if isinstance(name, str) and name.lower() in known_effects:
                    references.add(name.lower())
                return {'reference': name, 'type': target.type.name}
            raw = {k: v for k, v in env.tt(obj).items() if k not in fx.SKIP_FIELDS}
            fields = fx.enc_value(raw, pointer)
            fx.all_strings(raw, references)
            components.append({'node': node, 'class': env.script(obj)[1], 'fields': fields})
        stack.extend((child, node + '/') for child in fx.go_children(env, go))
    return components, {str(key).lower() for key in references if str(key).lower() in known_effects}


def prune_base(output, baseline):
    """Drop recursively exported dependencies already in the previously uploaded base pack."""
    data = output / 'data/local-fx.json'
    index_path = output / 'public/assets/local/fx/index.json'
    tex_path = output / 'public/assets/local/fx/textures.json'
    manifest = json.loads(data.read_text(encoding='utf-8'))
    index = json.loads(index_path.read_text(encoding='utf-8'))
    textures = json.loads(tex_path.read_text(encoding='utf-8'))
    for group, section in [('fx/prefabs', 'prefabs'), ('fx/tex', 'textures'), ('fx/mesh', 'meshes')]:
        old = set(baseline.get(section, []))
        manifest['groups'][group] = {k: v for k, v in manifest['groups'].get(group, {}).items() if k not in old}
    index['prefabs'] = {k: v for k, v in index['prefabs'].items() if k in manifest['groups']['fx/prefabs']}
    textures['textures'] = {k: v for k, v in textures['textures'].items() if k in manifest['groups']['fx/tex']}
    manifest['groups']['fx']['index']['prefabs'] = len(index['prefabs'])
    manifest['groups']['fx']['textures']['count'] = len(textures['textures'])
    keep = {'index.json', 'textures.json'}
    for group in ['fx/prefabs', 'fx/tex', 'fx/mesh']:
        for entry in manifest['groups'][group].values():
            for field in ['path', 'half']:
                if entry.get(field):
                    keep.add(entry[field].removeprefix('/assets/local/fx/'))
    fx_root = output / 'public/assets/local/fx'
    for directory in ['prefabs', 'tex', 'mesh']:
        for file in (fx_root / directory).rglob('*'):
            if file.is_file() and file.relative_to(fx_root).as_posix() not in keep:
                file.unlink()
    manifest['count'] = sum(len(v) for v in manifest['groups'].values())
    fx.write_atomic(data, json.dumps(manifest, separators=(',', ':')).encode())
    fx.write_atomic(index_path, json.dumps(index, separators=(',', ':')).encode())
    fx.write_atomic(tex_path, json.dumps(textures, separators=(',', ':')).encode())


def export_skins(game, kit, output, log=print, strict_catalog=False, jobs=2):
    game, kit, output = map(Path, (game, kit, output))
    if output.exists():
        raise RuntimeError('Use a new output folder; existing base results are never replaced.')
    catalog = json.loads((kit / 'skin-catalog.json').read_text(encoding='utf-8'))
    baseline = json.loads((kit / 'skin-baseline.json').read_text(encoding='utf-8'))
    output.mkdir(parents=True)
    cache = kit / '.cache/skin-fx'
    cache.mkdir(parents=True, exist_ok=True)
    cabs = fx.scan_cabs(game, dirs=fx.CAB_DIRS + ('refs/arts', 'chararts', 'charpack'))
    effects = fx.container_index(game, fx.EFFECT_GLOBS, cache / 'effects.json', 2, log)
    char_ids = {skin['charId'] for skin in catalog}
    def is_skin_bundle(path):
        rel = path.relative_to(game).as_posix().lower()
        return (rel.startswith(('chararts/', 'charpack/')) or 'skin' in rel) and any(char in rel for char in char_ids)
    bundles = sorted(p for p in game.rglob('*.ab') if is_skin_bundle(p))
    rows, diagnostics, references = [], [], set()
    for number, path in enumerate(bundles, 1):
        rel = path.relative_to(game).as_posix()
        env = fx.AssetEnv(game, cabs)
        try:
            for container, root in env.prefabs(rel, full=True).items():
                leaf = container.rsplit('/', 1)[-1].lower()
                matches = matching_skins(container, rel, catalog)
                if strict_catalog and not matches:
                    continue
                if leaf == 'defaultskin.prefab' and not matches:
                    continue
                # Base charpack prefabs are not alternative costumes.
                if not matches and 'chararts' not in path.parts and 'skin' not in rel.lower():
                    continue
                components, keys = skin_components(env, root, effects)
                record = {'bundle': rel, 'container': container, 'skinIds': [s['skinId'] for s in matches],
                          'charIds': sorted({s['charId'] for s in matches}), 'components': components,
                          'effects': sorted(keys), 'pointsFrame': 'unitGraphic',
                          'graphic': baseline.get('graphics', {}).get(matches[0]['charId']) if matches else None,
                          'points': fx.skin_points(env, rel, '', baseline.get('graphics', {}).get(matches[0]['charId']) if matches else None, container=container)}
                rows.append(record)
                references.update(keys)
        except Exception as error:
            diagnostics.append({'bundle': rel, 'error': str(error)})
        finally:
            del env
            gc.collect()
        if number % 10 == 0:
            log(f'Skin bundles inspected: {number}/{len(bundles)}; prefab records: {len(rows)}')
    new_keys = sorted(references - set(baseline['prefabs']))
    if new_keys:
        (output / 'data').mkdir(parents=True, exist_ok=True)
        fx.export_fx(game, output / 'public/assets/local', {}, log, selection='keys', keys=new_keys, jobs=jobs,
                     root=kit, fx_manifest=output / 'data/local-fx.json')
        prune_base(output, baseline)
    matched = {skin for row in rows for skin in row['skinIds']}
    report = {'format': 'costume-fx-extraction', 'version': 1, 'catalog': catalog, 'skins': rows,
              'baseFxExcluded': True, 'newEffectKeys': new_keys, 'diagnostics': diagnostics,
              'unmatchedSkinIds': [s['skinId'] for s in catalog if s['skinId'] not in matched],
              'summary': {'bundles': len(bundles), 'prefabRecords': len(rows), 'matchedSkins': len(matched),
                          'effectsReferenced': len(references), 'newEffects': len(new_keys)}}
    fx.write_atomic(output / 'skin-effects.json', json.dumps(report, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
    (output / 'summary.txt').write_text(json.dumps(report['summary'], indent=2) + '\nUnmatched entries and diagnostics are included in skin-effects.json.\n', encoding='utf-8')
    log(json.dumps(report['summary'], indent=2))
    if not rows:
        log('No costume prefabs were matched. Upload skin-effects.json and the log; do not repeat the base export.')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--game', required=True)
    parser.add_argument('--kit', default=str(Path.cwd()))
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    export_skins(args.game, args.kit, args.out)

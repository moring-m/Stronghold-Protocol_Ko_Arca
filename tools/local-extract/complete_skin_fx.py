"""Complete a previous skin extraction with projectile/skill wiring and only missing visual dependencies."""
import argparse
import json
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
import fx
from skin_fx import prune_base


def text_refs(value):
    refs = set()
    fx.all_strings(value, refs)
    return {key.lower() for key in refs if isinstance(key, str)}


def complete(game, kit, source, output, log=print):
    game, kit, source, output = map(Path, (game, kit, source, output))
    if output.exists():
        raise RuntimeError('Use a new follow-up folder. The original extraction must remain unchanged.')
    raw = json.loads((source / 'skin-effects.json').read_text(encoding='utf-8'))
    baseline = json.loads((kit / 'skin-baseline.json').read_text(encoding='utf-8'))
    output.mkdir(parents=True)
    cabs = fx.scan_cabs(game, dirs=fx.CAB_DIRS + ('refs/arts', 'chararts', 'charpack'))
    effects = fx.container_index(game, fx.EFFECT_GLOBS, kit / '.cache/skin-fx/effects.json', 2, log)
    env = fx.AssetEnv(game, cabs)
    roots = env.prefabs(fx.PROJECTILES)
    skill_roots = env.prefabs(fx.SKILLS)
    refs = text_refs(raw.get('skins', []))
    projectile_keys = sorted(refs & set(roots))
    parsed_projectiles = fx.projectile_entries(env, roots, effects, projectile_keys)
    projectiles = {k: v for k, v in parsed_projectiles.items() if k not in baseline.get('projectiles', [])}
    skill_keys = sorted(refs & set(skill_roots))
    wanted_skills = [key for key in skill_keys if key not in baseline.get('skills', [])]
    ek = lambda key: key.lower() if isinstance(key, str) and key.lower() in effects else None
    pk = lambda key: key.lower() if isinstance(key, str) and key.lower() in roots else None
    effect_refs = lambda values: sorted({key.lower() for key in values if isinstance(key, str) and key.lower() in effects})
    templates = fx.buff_templates(env, ek) if wanted_skills else {}
    skills = {key: fx.skill_entry(env, skill_roots[key], ek, pk, effect_refs, templates) for key in wanted_skills}
    for entry in skills.values():
        for key, value in fx.projectile_entries(env, roots, effects, entry.get('projectiles', [])).items():
            if key not in baseline.get('projectiles', []):
                projectiles[key] = value
    bindings = []
    for row in raw.get('skins', []):
        values = text_refs(row.get('components', []))
        ps, ss = sorted(values & set(roots)), sorted(values & set(skill_roots))
        if ps or ss:
            bindings.append({'skinIds': row.get('skinIds', []), 'bundle': row.get('bundle'),
                             'container': row.get('container'), 'projectileReferences': ps, 'skillReferences': ss})
    known = {key: set(baseline.get(key, [])) for key in ['prefabs', 'textures', 'meshes']}
    manifest_file = source / 'data/local-fx.json'
    if manifest_file.exists():
        manifest = json.loads(manifest_file.read_text(encoding='utf-8'))
        for section, group in [('prefabs', 'fx/prefabs'), ('textures', 'fx/tex'), ('meshes', 'fx/mesh')]:
            known[section].update(manifest.get('groups', {}).get(group, {}))
    needed = {key for value in [*projectiles.values(), *skills.values()] for key in value.get('effects', [])}
    new_effects = sorted(needed - known['prefabs'])
    if new_effects:
        (output / 'data').mkdir(parents=True, exist_ok=True)
        fx.export_fx(game, output / 'public/assets/local', {}, log, selection='keys', keys=new_effects, jobs=2,
                     root=kit, fx_manifest=output / 'data/local-fx.json')
        prune_base(output, {key: sorted(value) for key, value in known.items()})
    result = {'format': 'costume-fx-wiring', 'version': 1, 'sourceFolder': source.name, 'bindings': bindings,
              'projectiles': projectiles, 'skills': skills,
              'summary': {'projectileReferences': len(projectile_keys), 'projectileRecords': len(projectiles),
                          'skillReferences': len(skill_keys), 'skillRecords': len(skills),
                          'additionalVisualEffects': len(new_effects)}}
    fx.write_atomic(output / 'skin-projectiles.json', json.dumps(result, ensure_ascii=False, separators=(',', ':')).encode('utf-8'))
    (output / 'summary.txt').write_text(json.dumps(result['summary'], indent=2) + '\nUpload this folder together with the original skin output. Original files were not modified.\n', encoding='utf-8')
    log(json.dumps(result['summary'], indent=2))
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--game', required=True)
    parser.add_argument('--kit', required=True)
    parser.add_argument('--source', required=True)
    parser.add_argument('--out', required=True)
    args = parser.parse_args()
    complete(args.game, args.kit, args.source, args.out)

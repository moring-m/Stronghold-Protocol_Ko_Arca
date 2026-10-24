"""CN prepared-client supplement: all missing visual prefabs, complete wiring, and requested SFX."""
import argparse
import json
from pathlib import Path
import subprocess
import sys
import zipfile
import fx
from cn_skins import validate_payloads


def missing_keys(effects, baseline, referenced):
    scoped = set(effects) & set(referenced)
    return sorted((scoped - set(baseline.get('prefabs', [])))
                  | {key for key in scoped if 'clemnt' in key.lower()})


def referenced_keys(wiring, effects):
    values = set()
    fx.all_strings(wiring, values)
    return {v.lower() for v in values if isinstance(v, str) and v.lower() in effects}


def run(client, kit, output, log=print):
    client, kit, output = map(Path, (client, kit, output))
    if not client.is_dir() or output.exists():
        raise ValueError('Client view must exist; output must be a new folder.')
    baseline = json.loads((kit / 'missing-fx-baseline.json').read_text(encoding='utf-8'))
    effects = fx.container_index(client, fx.EFFECT_GLOBS, kit / '.cache/fx/effects.json', 2, log)
    output.mkdir(parents=True)
    cabs = fx.scan_cabs(client)
    gd = fx.game_data(kit)
    allowed = set(json.loads((kit / 'implemented-operators.json').read_text(encoding='utf-8')))
    gd['chars'] = [cid for cid in gd['chars'] if cid in allowed]
    # Production chess/backups define supported operators; do not crawl all CN units.
    unit_ids = gd['chars'] + gd['tokens']
    enemies = fx.container_index(client, (fx.ENEMY_GLOB,), kit / '.cache/fx/enemies.json', 2, log)
    tokens = fx.container_index(client, (fx.TOKEN_GLOB,), kit / '.cache/fx/tokens.json', 2, log)
    units, ps, ss, skins, referenced = fx.crawl_units(client, cabs, unit_ids, gd, effects, enemies, tokens, log)
    wiring = {'units': units, 'skins': skins, 'projectiles': ps, 'skills': ss}
    referenced |= referenced_keys(wiring, effects)
    wanted = missing_keys(effects, baseline, referenced)
    # Keep ALL dependencies of new prefabs, even if their names already exist in the baseline:
    # CN textures/materials may differ from the previously extracted KR version.
    if wanted:
        fx.export_fx(client, output / 'public/assets/local', {}, log, selection='keys', keys=wanted,
                     jobs=2, root=kit, fx_manifest=output / 'data/local-fx.json')
    (output / 'cn-skill-projectiles.json').write_text(json.dumps(wiring, ensure_ascii=False), encoding='utf-8')
    validate_payloads(output)
    index_file = output / 'public/assets/local/fx/index.json'
    exported = json.loads(index_file.read_text(encoding='utf-8')).get('prefabs', {}) if wanted else {}
    missing = sorted(set(wanted) - set(exported))
    unresolved = sorted({ref for entry in exported.values() for ref in entry.get('refs', [])
                         if ref in effects and ref not in exported and ref not in baseline.get('prefabs', [])})
    # Continue audio even if a visual prefab failed; retain a useful diagnostic package.
    audio = subprocess.run([sys.executable, '-u', str(Path(__file__).with_name('skin_audio.py')),
                            '--root', str(client), '--out', str(output / 'sfx'),
                            '--banks', str(kit / 'skin-audio-banks.json')], check=False)
    report = {'mode': 'implemented-operators-only', 'operatorIds': gd['chars'], 'requested': len(wanted), 'exported': len(exported),
              'missing': missing, 'unresolvedEffectReferences': unresolved, 'projectiles': len(wiring['projectiles']), 'skills': len(wiring['skills']),
              'audioExitCode': audio.returncode,
              'note': 'Extracted assets require renderer compatibility checks and game-event wiring before release.'}
    (output / 'supplement-report.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    archive = output.with_suffix('.zip')
    with zipfile.ZipFile(archive, 'w', zipfile.ZIP_DEFLATED) as z:
        for file in sorted(output.rglob('*')):
            if file.is_file(): z.write(file, file.relative_to(output))
    log('Output: ' + str(archive))
    if missing or unresolved or audio.returncode:
        raise RuntimeError('Partial extraction; keep the ZIP and supplement-report.json for diagnosis.')
    return report


if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--root', required=True); p.add_argument('--kit', required=True); p.add_argument('--out', required=True)
    a = p.parse_args()
    run(a.root, a.kit, a.out)

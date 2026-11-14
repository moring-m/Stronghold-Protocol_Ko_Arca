"""Build the Windows extraction kit for the 规程 (act3autochess) art the fork is missing.

Usage: python3 -I tools/build-regulation-extract-kit.py [OUT.zip] [--version act3autochess-v3_1]
Needs Node in this repository (it runs tools/audit-regulation-missing.mjs and tools/assets/versions.mjs); the client PC
needs neither Node nor a checkout. The kit's regulation-plan.json lists exactly the missing files, so the client run
extracts only those (tools/local-extract/regulation_recovery.py).
"""
import json
from pathlib import Path
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LX = ROOT / 'tools/local-extract'
sys.path.insert(0, str(LX))
import regulation_scenes  # noqa: E402  (REGULATION_IDS; no UnityPy at import)

MODULES = ['regulation_recovery.py', 'extract.py', 'targeted_recovery.py', 'aklz4.py', 'autochess_themes.py', 'bundles.py',
           'cn_skins.py', 'complete_skin_fx.py', 'fx.py', 'operators.py', 'recovery_models.py', 'regulation_scenes.py',
           'scenes.py', 'skin_fx.py', 'ui_components.py', 'versions.py', 'client-candidates.json', 'requirements.txt',
           'LICENSE-Ark-Unpacker.txt']


def read(rel):
    return json.loads((ROOT / rel).read_text(encoding='utf-8'))


def values(obj):
    return [v for v in (obj if isinstance(obj, list) else (obj or {}).values()) if isinstance(v, dict)]


def plan(version):
    cache = ROOT / '.cache'
    cache.mkdir(exist_ok=True)
    audit_path = cache / 'regulation-missing.json'
    subprocess.check_call(['node', str(ROOT / 'tools/audit-regulation-missing.mjs'), '--version', version, '--out', str(audit_path), '--quiet'])
    audit = json.loads(audit_path.read_text(encoding='utf-8'))
    jobs = json.loads(subprocess.check_output(['node', str(ROOT / 'tools/assets/versions.mjs'), str(ROOT)], timeout=120))

    vdir = f'data/versions/{version}/'
    chess, enemies, tokens = read(vdir + 'chess.json'), read(vdir + 'enemies.json'), read(vdir + 'tokens.json')
    season_chars = {c['charId'] for c in values(chess) if c.get('charId')}
    season_enemies = {e['key'] for e in values(enemies) if e.get('key')}
    season_tokens = {t['tokenId'] for t in values(tokens) if t.get('tokenId')}

    resources = read('content/production/resources.json')
    have = {f['path'].lower() for f in resources['files']}
    have_names = {p.rsplit('/', 1)[-1] for p in have}
    local = read('content/production/data/local-assets.json')
    for group, files in (local.get('groups') or {}).items():
        for name in files:
            have.add(f'/assets/local/{group}/{name}'.lower())

    def fork_url(path):   # versions.mjs paths are relative to public/assets; the fork stores voices as voice_<lang>
        parts = path.split('/')
        if parts[:2] == ['audio', 'voice'] and len(parts) > 3:
            parts[2] = 'voice_' + parts[2]
        return '/assets/' + '/'.join(parts)

    def missing(path):
        return fork_url(path).lower() not in have

    def need(kind, ident, what):
        return any(x['id'] == ident and (set(x['miss']) & what) for x in audit[kind])

    art = {
        'operators': [c for c in jobs['operators'] if c in season_chars and need('operators', c, {'all', 'avatar', 'portrait', 'spineFront', 'spineBack'})],
        'enemies': [e for e in jobs['enemies'] if e in season_enemies and need('enemies', e, {'all', 'spine'})],
        # every season token drawn without a model (versions.mjs lists only some; export_token_spines takes any id)
        'tokens': sorted(x['id'] for x in audit['tokens'] if x['id'].startswith('token_') and set(x['miss']) & {'all', 'spine'}),
        'sprites': [s for s in jobs['sprites'] if missing(s['path'])],
        'audio': [],
    }
    for a in jobs['audio']:
        if not missing(a['path']):
            continue
        parts = a['path'].split('/')
        if parts[:2] == ['audio', 'voice']:
            # The fork ships Korean voices only, and only for season operators.
            if parts[2] == 'kr' and len(parts) > 3 and parts[3] in season_chars:
                art['audio'].append(a)
        elif parts[-1].lower() not in have_names:   # same clip already shipped under another folder
            art['audio'].append(a)
    known = {s['path'] for s in art['sprites']}
    for sid in audit['skills']:
        path = f'skill/{sid}.png'
        if path not in known:
            art['sprites'].append({'bundles': ['spritepack/skill_icons_*.ab'], 'name': f'skill_icon_{sid}', 'path': path})

    fx_ops = {x['id'] for x in audit['operators'] if 'fx' in x['miss']}
    fx_enemies = {x['id'] for x in audit['enemies'] if 'fx' in x['miss']}
    fx_tokens = {x['id'] for x in audit['tokens'] if 'fx' in x['miss']}
    chess_map = chess if isinstance(chess, dict) else {c['chessId']: c for c in values(chess)}
    enemy_map = enemies if isinstance(enemies, dict) else {e['key']: e for e in values(enemies)}
    token_map = tokens if isinstance(tokens, dict) else {t['tokenId']: t for t in values(tokens)}
    fx_plan = {
        'units': sorted(fx_ops | fx_enemies | fx_tokens),
        'chess': {k: v for k, v in chess_map.items() if isinstance(v, dict) and v.get('charId') in fx_ops},
        'enemies': {k: v for k, v in enemy_map.items() if isinstance(v, dict) and v.get('key') in fx_enemies},
        'tokens': {k: v for k, v in token_map.items() if isinstance(v, dict) and v.get('tokenId') in fx_tokens},
    }
    stages = [s for s in regulation_scenes.REGULATION_IDS if s in set(audit['stages'])]
    counts = {'stages': len(stages), 'operatorArt': len(art['operators']), 'enemySpines': len(art['enemies']),
              'tokenSpines': len(art['tokens']), 'sprites': len(art['sprites']),
              'audio': len(art['audio']), 'voices': sum(a['path'].startswith('audio/voice/') for a in art['audio']),
              'fxUnits': len(fx_plan['units']), 'fxOperators': len(fx_ops), 'fxEnemies': len(fx_enemies), 'fxTokens': len(fx_tokens)}
    return {'version': version, 'counts': counts, 'stages': stages, 'art': art, 'fx': fx_plan,
            'inventoryNeedles': ['act3autochess']}


README = """규정(act3autochess) 누락 리소스 추출 도구

준비
- 중국판 명일방주 PC 클라이언트를 최신 버전으로 업데이트합니다(규정 시즌 데이터가 있는 버전).
  게임 안에서 추가 리소스(음성 포함)를 모두 다운로드해 둡니다.
- 이 ZIP을 클라이언트와 같은 NTFS 드라이브의 새 폴더에 풉니다. 예: D:\\ak-regulation
  (클라이언트 파일을 복사하지 않고 하드링크로 읽기 때문에 같은 드라이브여야 합니다. 게임 폴더 안에는 넣지 마세요.)
- 음성·BGM·SFX를 MP3로 변환하려면 ffmpeg가 필요합니다. 없으면 PowerShell에서 한 번 설치합니다.
    winget install --id Gyan.FFmpeg -e
  ffmpeg가 없으면 오디오만 건너뛰고 PARTIAL로 보고합니다.

실행 (PowerShell)
  cd D:\\ak-regulation
  powershell -ExecutionPolicy Bypass -File .\\EXTRACT-REGULATION.ps1

- 처음에는 64비트 Python 3.12와 필요한 패키지를 설치합니다(관리자 권한·C++ 빌드 도구 불필요).
- 중국 클라이언트 게임 폴더를 고르는 창이 뜹니다. 선택한 경로는 client-path.txt 에 저장됩니다.
- 이미 준비된 work\\cn-client-* 폴더가 있으면 가장 최근 것을 씁니다. 게임을 업데이트했다면 -ClientPath 로 다시 지정하세요.
    powershell -ExecutionPolicy Bypass -File .\\EXTRACT-REGULATION.ps1 -ClientPath 'D:\\중국게임설치폴더'
- 일부만 다시 실행: -Only scenes / art / fx / inventory (여러 번 지정 가능)

추출 대상 (regulation-plan.json 에 정확한 목록이 있습니다)
{counts}

결과
- UPLOAD 뒤에 표시된 파일을 모두 올려 주세요. 20MiB를 넘으면 .zip.001, .zip.002 ... 로 나뉩니다.
- PARTIAL이면 regulation-report.json과 regulation-*.log 도 함께 올려 주세요. 누락을 성공으로 숨기지 않습니다.
- 원본 클라이언트와 이전 추출 결과는 수정하지 않습니다. 게임 데이터 수집은 로컬에서만 합니다.
"""

COUNT_LINES = [
    ('stages', '공식 전장(맵) 프리팹'), ('fxUnits', '공식 이펙트가 없는 유닛 (오퍼레이터 {fxOperators} · 적 {fxEnemies} · 소환물 {fxTokens})'),
    ('operatorArt', '오퍼레이터 Spine(앞/뒤)·초상화·아바타'), ('enemySpines', '적 Spine 모델'), ('tokenSpines', '소환물 Spine 모델'),
    ('sprites', '아이콘(적 아이콘·소환물 아바타·스킬 아이콘)'), ('audio', '오디오 파일 (그중 한국어 음성 {voices})'),
]


def build(output, version):
    p = plan(version)
    c = p['counts']
    lines = '\n'.join(f'- {label.format(**c)}: {c[key]}' for key, label in COUNT_LINES)
    start = (LX / 'targeted-START.ps1').read_text(encoding='utf-8-sig')
    start = start.replace('param([string]$ClientView,[string]$ClientPath)', 'param([string]$ClientView,[string]$ClientPath,[string[]]$Only)')
    start = start.replace("'tools/local-extract/targeted_recovery.py')", "'tools/local-extract/regulation_recovery.py')")
    start = start.replace("""    $catalog = Join-Path $PSScriptRoot 'skin_table.json'
    if (Test-Path -LiteralPath $catalog) { $argsForPython += @('--catalog',$catalog) }
""", """    foreach ($o in $Only) { $argsForPython += @('--only',$o) }
""")
    start = start.replace("'targeted-'", "'regulation-'").replace('targeted-report.json', 'regulation-report.json')
    assert 'regulation_recovery.py' in start and '--only' in start and 'targeted' not in start.replace('targeted_recovery', ''), 'START script template changed'
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for name in MODULES:
            z.write(LX / name, 'tools/local-extract/' + name)
        for path in sorted((LX / 'cn-schemas').iterdir()):
            if path.suffix in ('.fbs', '.json'):
                z.write(path, 'tools/local-extract/cn-schemas/' + path.name)
        z.writestr('tools/local-extract/plugin-fx.mjs', 'process.stdout.write("[]");\n')
        z.write(LX / 'prepare_client.py', 'prepare_client.py')
        z.writestr('EXTRACT-REGULATION.ps1', b'\xef\xbb\xbf' + start.encode('utf-8'))
        z.writestr('README-ko.txt', b'\xef\xbb\xbf' + README.format(counts=lines).replace('\n', '\r\n').encode('utf-8'))
        z.writestr('regulation-plan.json', json.dumps(p, ensure_ascii=False, indent=1))
    return output, p


if __name__ == '__main__':
    args = [a for a in sys.argv[1:]]
    version = 'act3autochess-v3_1'
    if '--version' in args:
        i = args.index('--version'); version = args[i + 1]; del args[i:i + 2]
    out, p = build(args[0] if args else ROOT / '.cache/regulation-extract-kit.zip', version)
    print(out, out.stat().st_size, json.dumps(p['counts'], ensure_ascii=False))

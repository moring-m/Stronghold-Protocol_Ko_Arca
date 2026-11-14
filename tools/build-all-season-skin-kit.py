"""Build the Windows kit that extracts every official costume the fork cannot show yet, for the operators of every season
(맹약 content/production + 규정 act3autochess), with skin_recovery.py (models, portraits/avatars, costume FX, SFX).

Usage: python3 -I tools/build-all-season-skin-kit.py [OUT.zip] [--tables DIR]
  --tables  folder with the CN gamedata excel tables (default .cache/skin-audit): skin_table, character_table,
            skill_table, audio_data, range_table, battle_equip_table, uniequip_table (Kengxxiao/ArknightsGameData zh_CN).
The client PC needs neither Node nor a checkout; the START script installs Python 3.12 and the packages by itself.
"""
import json
from pathlib import Path
import re
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
LX = ROOT / 'tools/local-extract'
SEASONS = {'covenant': 'content/production/data', 'regulation': 'data/versions/act3autochess-v3_1'}
MODULES = ['skin_recovery.py', 'recovery_models.py', 'skin_fx.py', 'complete_skin_fx.py', 'cn_skins.py', 'skin_audio.py',
           'fx.py', 'aklz4.py', 'extract.py', 'operators.py', 'scenes.py', 'regulation_scenes.py', 'autochess_themes.py',
           'bundles.py', 'ui_components.py', 'versions.py', 'client-candidates.json', 'requirements.txt', 'LICENSE-Ark-Unpacker.txt']
LOCAL = None   # filled in build(): every kit module that another kit module imports must be in the kit
TABLES = ('audio_data', 'range_table', 'battle_equip_table', 'uniequip_table')


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def values(obj):
    return [v for v in (obj.values() if isinstance(obj, dict) else obj or []) if isinstance(v, dict)]


def mount(prefab):
    return 'skin_' + re.sub(r'[^A-Za-z0-9_]', '_', prefab)


def plan(tables):
    per_season = {}
    for season, folder in SEASONS.items():
        ids = {c['charId'] for c in values(read(ROOT / folder / 'chess.json')) if c.get('charId')}
        backups = ROOT / folder / 'backups.json'
        if backups.exists():
            ids |= set((read(backups).get('units') or {}))
        per_season[season] = ids
    ids = sorted(set().union(*per_season.values()))
    assets = read(ROOT / 'content/production/data/assets.json').get('chars', {})
    fx_index = read(ROOT / 'public/assets/local/fx/index.json')
    bound = sorted({c['skinId'] for c in fx_index.get('costumes', {}).values() if c.get('skinId')})
    table = read(tables / 'skin_table.json')
    models, missing = [], []
    for s in table['charSkins'].values():
        cid = s.get('charId')
        if cid not in per_season['covenant'] and cid not in per_season['regulation']:
            continue
        if not (s.get('displaySkin') or {}).get('skinName'):
            continue
        prefab = (s.get('battleSkin') or {}).get('skinOrPrefabId') or ''
        has_model = bool(assets.get(mount(prefab), {}).get('spine', {}).get('front'))
        if has_model:
            models.append(s['skinId'])
        if not has_model or s['skinId'] not in bound:
            missing.append({'skinId': s['skinId'], 'charId': cid, 'name': s['displaySkin']['skinName'],
                            'model': not has_model, 'fx': s['skinId'] not in bound,
                            'seasons': [k for k, v in per_season.items() if cid in v]})
    counts = {'operators': len(ids), 'skins': len(missing), 'models': sum(m['model'] for m in missing),
              'fxOnly': sum(not m['model'] for m in missing)}
    return {'version': 1, 'implementedOperators': ids, 'modelSkinIds': sorted(models), 'fxSkinIds': bound,
            'explicitAdditionalOperator': 'char_4217_makoto', 'diagnosticBaseOperator': 'char_4231_clemnt',
            'missing': missing, 'counts': counts}, table


def baseline():
    idx = read(ROOT / 'public/assets/local/fx/index.json')
    out = {k: sorted(idx.get(k, {})) for k in ('prefabs', 'projectiles', 'skills')}
    out['textures'] = sorted(read(ROOT / 'public/assets/local/fx/textures.json').get('textures', {}))
    out['meshes'] = sorted(p.stem for p in (ROOT / 'public/assets/local/fx/mesh').glob('*.json'))
    out['graphics'] = {k: v['graphic'] for k, v in idx.get('units', {}).items() if v.get('graphic')}
    return out


README = """전 시즌 누락 스킨 추출 도구 (맹약 · 규정)

추출 대상: 오퍼레이터 {operators}명의 공식 스킨 중 이 포크에 없는 {skins}개
- 모델(Spine)·초상화·아바타까지 없는 스킨: {models}
- 모델은 있고 스킨 전용 이펙트 연결만 없는 스킨: {fxOnly}
정확한 목록은 recovery-plan.json 의 missing 에 있습니다.

준비
- 중국판 명일방주 PC 클라이언트를 최신으로 업데이트하고, 게임 안에서 추가 리소스를 모두 내려받습니다.
- 이 ZIP을 클라이언트와 같은 NTFS 드라이브의 새 폴더에 풉니다(예: D:\\ak-skins). 게임 폴더 안에는 넣지 마세요.
  이미 규정 추출 도구 폴더가 있다면 거기에 풀어도 됩니다(준비된 work\\cn-client-* 와 .venv 를 다시 씁니다).

실행 (PowerShell)
  cd D:\\ak-skins
  powershell -ExecutionPolicy Bypass -File .\\EXTRACT-SKINS.ps1

- 처음에는 64비트 Python 3.12와 패키지를 설치합니다(관리자 권한·C++ 빌드 도구 불필요).
- 중국 클라이언트 게임 폴더를 고르는 창이 뜹니다. 게임을 업데이트했다면 -ClientPath 로 다시 지정하세요.
    powershell -ExecutionPolicy Bypass -File .\\EXTRACT-SKINS.ps1 -ClientPath 'D:\\중국게임설치폴더'
- 키트에 든 스킨 목록(cn-skin-table.snapshot.json)보다 새 스킨이 나왔으면 최신 skin_table.json 을
  이 폴더에 두면 그것을 씁니다(없으면 실행 시 인터넷에서 최신 목록을 받아 봅니다).

결과
- UPLOAD 뒤에 표시된 파일을 모두 올려 주세요. 20MiB를 넘으면 .zip.001, .zip.002 ... 로 나뉩니다.
- PARTIAL이면 recovery-report.json 과 skins-*.log 도 함께 올려 주세요. 누락을 성공으로 숨기지 않습니다.
- 원본 클라이언트와 이전 추출 결과는 수정하지 않습니다.
"""


def build(output, tables):
    p, table = plan(tables)
    start = (LX / 'targeted-START.ps1').read_text(encoding='utf-8-sig')
    start = start.replace("'tools/local-extract/targeted_recovery.py')", "'tools/local-extract/skin_recovery.py')")
    start = start.replace('param([string]$ClientView,[string]$ClientPath)', 'param([string]$ClientView,[string]$ClientPath,[switch]$ModelsOnly)')
    start = start.replace("$argsForPython = @('-X','utf8','-u','tools/local-extract/skin_recovery.py')", "$argsForPython = @('-X','utf8','-u','tools/local-extract/skin_recovery.py')\n    if ($ModelsOnly) { $argsForPython += '--models-only' }")
    assert '--models-only' in start, 'START script template changed'
    start = start.replace("'targeted-'", "'skins-'").replace('targeted-report.json', 'recovery-report.json')
    assert 'skin_recovery.py' in start and 'targeted' not in start.replace('targeted_recovery', ''), 'START script template changed'
    character = read(tables / 'character_table.json')
    allowed = set(p['implementedOperators']) | {'char_4217_makoto', 'char_4231_clemnt'}
    character = {k: v for k, v in character.items() if k in allowed}
    skill_ids = {s['skillId'] for c in character.values() for s in c.get('skills', []) if s and s.get('skillId')}
    skills = {k: v for k, v in read(tables / 'skill_table.json').items() if k in skill_ids}
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for name in MODULES:
            z.write(LX / name, 'tools/local-extract/' + name)
        z.writestr('tools/local-extract/plugin-fx.mjs', 'process.stdout.write("[]");\n')
        z.write(LX / 'prepare_client.py', 'prepare_client.py')
        z.writestr('EXTRACT-SKINS.ps1', b'\xef\xbb\xbf' + start.encode('utf-8'))
        z.writestr('README-ko.txt', b'\xef\xbb\xbf' + README.format(**p['counts']).replace('\n', '\r\n').encode('utf-8'))
        dumps = lambda v: json.dumps(v, ensure_ascii=False, separators=(',', ':'))
        z.writestr('recovery-plan.json', json.dumps(p, ensure_ascii=False, indent=1))
        z.writestr('baseline.snapshot.json', dumps(baseline()))
        z.writestr('cn-skin-table.snapshot.json', dumps(table))
        z.writestr('tables/character_table.json', dumps(character))
        z.writestr('tables/skill_table.json', dumps(skills))
        for name in TABLES:
            z.write(tables / f'{name}.json', f'tables/{name}.json')
        # fx.game_data(kit) merges data/ (규정) and content/production/data (맹약)
        for name in ('chess', 'tokens', 'backups'):
            for folder, target in ((SEASONS['covenant'], 'content/production/data'), (SEASONS['regulation'], 'data')):
                src = ROOT / folder / f'{name}.json'
                if src.exists():
                    z.write(src, f'{target}/{name}.json')
    # a kit module importing another local module that the kit lacks fails only on the client (regulation_scenes, 2026-11-15)
    local = {p.stem for p in LX.glob('*.py')}
    shipped = {Path(n).stem for n in MODULES if n.endswith('.py')} | {'prepare_client'}
    for name in MODULES:
        if name.endswith('.py'):
            imports = set(re.findall(r'^\s*(?:from|import) ([a-z_0-9]+)', (LX / name).read_text(encoding='utf-8'), re.M))
            lacking = (imports & local) - shipped
            assert not lacking, f'{name} imports {sorted(lacking)}, not in the kit'
    with zipfile.ZipFile(output) as z:
        assert z.testzip() is None
        for name in MODULES:
            if name.endswith('.py'):
                compile(z.read('tools/local-extract/' + name), name, 'exec')
    return output, p


if __name__ == '__main__':
    args = sys.argv[1:]
    tables = ROOT / '.cache/skin-audit'
    if '--tables' in args:
        i = args.index('--tables'); tables = Path(args[i + 1]); del args[i:i + 2]
    out, p = build(args[0] if args else ROOT / '.cache/all-season-skin-kit.zip', tables)
    print(out, out.stat().st_size, json.dumps(p['counts'], ensure_ascii=False))

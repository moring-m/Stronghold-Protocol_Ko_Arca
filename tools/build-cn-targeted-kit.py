"""Build the targeted CN recovery add-on (tools/local-extract/targeted_recovery.py) for the existing Windows CN kit.

Usage: python3 -I tools/build-cn-targeted-kit.py OUT.zip
No Node or repository checkout is needed on the client PC: the kit installs its Python 3.12 environment (or reuses an
existing CN kit's .venv) and prepares a hard-linked, read-only view of the client (prepare_client.py).
"""
import json
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
read = lambda p: json.loads((ROOT / p).read_text(encoding='utf-8'))  # noqa: E731

# The 2026-10-26 resource audit: skins absent from every catalogue, summons drawn as a diamond, 克莱门莎 S2's cabin and
# vortex, 结城理's missing mount points, operators with a Front model only.
SKINS = ['char_2025_shu@nlc#1', 'char_1040_blaze2@nlc#1', 'char_1033_swire2@nlc#1']
OPERATORS = ['char_4231_clemnt', 'char_4217_makoto', 'char_1015_aglna2', 'char_291_aglina', 'char_1012_skadi2', 'char_4134_cetsyr',
             'char_4145_ulpia', 'char_1042_phatm2', 'char_4037_demetr']
TOKENS = ['token_10071_aglna2_agairp', 'token_10039_ulpia_block', 'token_10055_phatm2_mndclv', 'token_10065_demetr_dmtpos']
CODES = ['clemnt', 'makoto', 'aglna2', 'agairp', 'ulpia', 'phatm2', 'demetr']
MODULES = ['targeted_recovery.py', 'recovery_models.py', 'cn_skins.py', 'skin_fx.py', 'fx.py', 'aklz4.py', 'extract.py',
           'operators.py', 'scenes.py', 'requirements.txt', 'LICENSE-Ark-Unpacker.txt']


def plan():
    chess = read('content/production/data/chess.json')
    tokens = {**read('content/production/data/backups.json').get('tokens', {}), **read('content/production/data/tokens.json')}
    records = {k: {'charId': v['charId'], 'skill': v.get('skill'), 'skills': v.get('skills')}
               for k, v in chess.items() if isinstance(v, dict) and v.get('charId') in OPERATORS}
    missing = sorted(set(OPERATORS) - {v['charId'] for v in records.values()})
    for cid in missing:   # not a chess record of the fork (e.g. a stand-in only): the crawl still needs the id
        records['targeted_' + cid] = {'charId': cid}
    return {
        'skinIds': SKINS,
        'modelIds': OPERATORS + TOKENS,
        'inventoryNeedles': ['char_2025_shu', 'blaze2', 'swire2', 'aglina', 'skadi2', 'cetsyr'] + CODES,
        'effectBundles': CODES,
        'chessRecords': records,
        'tokenRecords': {t: tokens.get(t, {'tokenId': t}) for t in TOKENS},
    }


README = """중국판 클라이언트 대상 추출 (2026-10-26)

준비
- 중국판 명일방주 PC 클라이언트를 설치하고 최신 버전으로 업데이트해 둡니다(한국판 클라이언트가 아닙니다).
- 이 ZIP을 중국 클라이언트와 같은 드라이브(NTFS)의 새 폴더에 풀어 주세요. 예: D:\\ak-extract
  (클라이언트 파일을 복사하지 않고 하드링크로 읽기 때문에 같은 드라이브여야 합니다.)
- 예전 추출 도구 폴더(.venv, work 가 있는 곳)가 있다면 그 폴더에 덮어써도 됩니다. Python 환경을 다시 설치하지 않습니다.

실행 (PowerShell)

  cd D:\\ak-extract
  powershell -ExecutionPolicy Bypass -File .\\EXTRACT-TARGETED.ps1

- 처음에는 64비트 Python 3.12와 필요한 패키지를 설치합니다(관리자 권한·C++ 빌드 도구 불필요).
- 중국 클라이언트 게임 폴더를 고르는 창이 뜹니다. 선택한 경로는 client-path.txt 에 저장됩니다.
- 이미 준비된 work\\cn-client-* 폴더가 있으면 가장 최근 것을 씁니다. 게임을 업데이트했다면 설치 폴더를 지정하세요:

  powershell -ExecutionPolicy Bypass -File .\\EXTRACT-TARGETED.ps1 -ClientPath '중국 클라이언트 설치 폴더'

대상
- 스킨 3종(슈 源远流长, 烛煌 夜行烛火, 琳琅诗怀雅 盛世之象): 모델·이펙트·초상화
- 클레멘티아 S2의 부유 추방 포드·소용돌이: 캐릭터·이펙트 번들 전체 목록과, 참조되지 않은 이펙트까지 추출
- 마름모로 표시되는 소환물(예원 안젤리나 S3 표식, 울피아누스·트라고디아·벨로네 표식)의 모델·이펙트
- 유키 마코토의 이펙트 부착 위치
- 안젤리나·浊心斯卡蒂·魔王의 뒷면 모델 확인

결과
- 마지막 줄의 UPLOAD: 뒤에 나온 파일을 모두 올려 주세요. 20MiB를 넘으면 .zip.001, .zip.002 … 로 나뉩니다.
- PARTIAL로 끝나도 만들어진 파일과 targeted-report.json, run.log를 함께 올려 주세요.
- 원본 클라이언트와 이전 추출 결과는 변경하지 않습니다.
"""


def build(out):
    out = Path(out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        for name in MODULES:
            z.write(ROOT / 'tools/local-extract' / name, 'tools/local-extract/' + name)
        z.writestr('tools/local-extract/plugin-fx.mjs', 'process.stdout.write("[]");\n')
        z.write(ROOT / 'tools/local-extract/targeted-START.ps1', 'EXTRACT-TARGETED.ps1')
        z.write(ROOT / 'tools/local-extract/prepare_client.py', 'prepare_client.py')
        z.writestr('targeted-plan.json', json.dumps(plan(), ensure_ascii=False, indent=2))
        z.writestr('README-targeted-ko.txt', README.replace('\n', '\r\n'))
    return out


if __name__ == '__main__':
    print(build(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'public/assets/local/dev-tools/arknights-cn-targeted-20261026.zip'))

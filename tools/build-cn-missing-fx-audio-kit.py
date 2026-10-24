import json,zipfile,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
idx=json.loads((root/'public/assets/local/fx/index.json').read_text())
# Include supplemental FX already present locally, not just the original base pack.
for p in [root/'.cache/local-production/public/assets/local/fx/index.json']:
 if p.exists():
  extra=json.loads(p.read_text())
  for section in ('prefabs','projectiles','skills'):idx.setdefault(section,{}).update(extra.get(section,{}))
baseline={k:sorted(idx.get(k,{})) for k in ('prefabs','projectiles','skills')}
audio=json.loads((root/'.cache/gamedata/excel/audio_data.json').read_text())
chess=json.loads((root/'content/production/data/chess.json').read_text())
backups=json.loads((root/'content/production/data/backups.json').read_text())
ids={v['charId'] for v in chess.values() if isinstance(v,dict) and v.get('charId')} | set(backups.get('units',{}))
# Match complete official IDs/codenames, never arbitrary substring fragments.
codes={i.split('_',2)[2] for i in ids if len(i.split('_',2))==3}
pattern=re.compile(r'(?<![a-z0-9])(?:'+ '|'.join(re.escape(x) for x in sorted(ids|codes,key=len,reverse=True))+r')(?![a-z0-9])',re.I)
banks=[b for b in audio['soundFXBanks'] if b.get('name','').startswith('battle.') and pattern.search(b['name'])]

readme='''중국 PC 클라이언트: 누락 FX + 전투 SFX 추가 추출

기존 중국 클라이언트 추출 도구 폴더(.venv, work, START.ps1이 있는 곳)에 압축을 풀고 덮어쓰세요.
PowerShell에서 다음을 실행하세요:
.\\EXPORT-AUDIO.ps1

기본으로 work/cn-client-* 중 가장 최근에 준비한 클라이언트(구형 client-*도 지원)를 사용합니다.
다른 클라이언트라면 .\\EXPORT-AUDIO.ps1 -ClientView 'C:\\실제경로\\work\\cn-client-...'
한국판 client 폴더를 선택하지 마세요. 원본 게임 폴더를 직접 넘기는 옵션이 아닙니다.

현재 게임에 구현된 오퍼레이터와 소환물의 참조를 따라 누락 FX만 추출합니다. 미구현 오퍼레이터는 제외합니다.
텍스처/메시/재질/하위 연쇄 효과와 해당 오퍼레이터의 스킬·투사체 기록, 게임 내 유닛의 연결·마운트 정보를 함께 보존합니다.
클레멘타인(clemnt)은 기존 보유 여부와 관계없이 모든 FX 구성요소를 다시 추출합니다.\n그 외 기존 프리팹 내부가 중국판에서 변경된 경우까지 비교하는 도구는 아닙니다.
구현된 오퍼레이터 ID/코드명에 연결된 전투 SFX 뱅크의 클립만 추출합니다. BGM/음성은 대상이 아닙니다.
이전보다 용량·시간이 크게 늘어날 수 있습니다. CN 전용 클립은 현재 뱅크 자료에 없으면 누락될 수 있습니다.
원본 클라이언트와 이전 추출 결과를 변경하지 않습니다.

완료 후 cn-missing-fx-audio-날짜-식별자.zip 전체를 전달하세요.
32MiB를 넘으면 7-Zip에서 20M 분할 압축을 사용하세요.
부분 실패도 ZIP과 supplement-report.json/audio-report.json을 보존합니다.
리소스 확보와 게임 연결은 별개이며, 추출 후 렌더러 지원·실제 게임 이벤트 연결 검증이 필요합니다.
'''
out=root/'public/assets/local/dev-tools/arknights-cn-implemented-fx-audio-addon.zip'
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED) as z:
 for name in ('fx.py','aklz4.py','cn_skins.py','skin_audio.py','missing_fx_audio.py','LICENSE-Ark-Unpacker.txt'):
  z.write(root/'tools/local-extract'/name,'tools/local-extract/'+name)
 z.writestr('tools/local-extract/plugin-fx.mjs', 'process.stdout.write("[]");\n')
 z.write(root/'tools/local-extract/skin-audio-EXPORT.ps1','EXPORT-AUDIO.ps1')
 for name in ('chess.json','backups.json','enemies.json','tokens.json'):
  p=root/'content/production/data'/name
  if p.exists():z.write(p,'content/production/data/'+name)
 z.writestr('implemented-operators.json',json.dumps(sorted(ids)))
 z.writestr('missing-fx-baseline.json',json.dumps(baseline))
 z.writestr('skin-audio-banks.json',json.dumps([{'banks':banks}]))
 z.writestr('README-ko.txt',readme)
# Keep the previously provided URL safe as well: it must no longer export unimplemented operators.
(root/'public/assets/local/dev-tools/arknights-cn-missing-fx-audio-addon.zip').write_bytes(out.read_bytes())
(root/'docs/ui-fx-audit-2026-10-23/CN-SUPPLEMENT-EXTRACTION.md').write_text(readme)
print(out, out.stat().st_size, 'baseline',len(baseline['prefabs']),'audio banks',len(banks))

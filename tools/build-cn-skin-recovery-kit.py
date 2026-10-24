"""Build a dependency-complete Windows add-on; no Node or repository checkout is needed on the client PC."""
import hashlib
import json
from pathlib import Path
import re
import zipfile
ROOT=Path(__file__).resolve().parents[1]
read=lambda p:json.loads((ROOT/p).read_text(encoding='utf-8'))
chess=read('content/production/data/chess.json');assets=read('content/production/data/assets.json')
idx=read('.cache/local-production/public/assets/local/fx/index.json');table=read('.cache/skin-audit/skin_table.json')
ids=sorted({c['charId'] for c in chess.values() if c.get('charId')}|set(read('content/production/data/backups.json').get('units',{})))
models=[]
for s in table['charSkins'].values():
    if s.get('charId') not in ids:continue
    prefab=s.get('battleSkin',{}).get('skinOrPrefabId','')
    mount='skin_'+re.sub(r'[^A-Za-z0-9_]','_',prefab)
    if assets.get('chars',{}).get(mount,{}).get('spine',{}).get('front'):models.append(s['skinId'])
plan={'version':1,'implementedOperators':ids,'modelSkinIds':models,
      'fxSkinIds':sorted({c['skinId'] for c in idx.get('costumes',{}).values()}),
      'explicitAdditionalOperator':'char_4217_makoto','diagnosticBaseOperator':'char_4231_clemnt'}
baseline={k:sorted(idx.get(k,{})) for k in ('prefabs','projectiles','skills')}
baseline['textures']=sorted(read('public/assets/local/fx/textures.json').get('textures',{}))
baseline['meshes']=sorted({p.stem for folder in ('public/assets/local/fx/mesh','.cache/local-production/public/assets/local/fx/mesh') for p in (ROOT/folder).glob('*.json')})
baseline['graphics']={k:v['graphic'] for k,v in idx['units'].items() if v.get('graphic')}
character=read('.cache/skin-audit/character_table.json');allowed=set(ids)|{'char_4217_makoto'}
character={k:v for k,v in character.items() if k in allowed}
skill_ids={s['skillId'] for c in character.values() for s in c.get('skills',[]) if s}
skills={k:v for k,v in read('.cache/skin-audit/skill_table.json').items() if k in skill_ids}
references={'prts':{'url':'https://prts.wiki/w/结城理','retrieved':'2026-10-23','sha256':hashlib.sha256((ROOT/'.cache/skin-audit/makoto-prts.html').read_bytes()).hexdigest()},
            'video':{'url':'https://youtu.be/mHbHqnQvE9w','providedBy':'user','playbackVerified':False,'accessResult':'HTTP 403'},
            'scope':'Do not claim visual/frame parity until the reference video has been reviewed.'}
out=ROOT/'public/assets/local/dev-tools/arknights-cn-skin-recovery-makoto-kit.zip'
modules=['skin_recovery.py','recovery_models.py','skin_fx.py','complete_skin_fx.py','cn_skins.py',
         'skin_audio.py','fx.py','aklz4.py','extract.py','operators.py','scenes.py','requirements.txt','LICENSE-Ark-Unpacker.txt']
with zipfile.ZipFile(out,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for name in modules:z.write(ROOT/'tools/local-extract'/name,'tools/local-extract/'+name)
    # The generic reader is not applicable to this explicitly bounded operator plan.
    z.writestr('tools/local-extract/plugin-fx.mjs','process.stdout.write("[]");\n')
    z.write(ROOT/'tools/local-extract/skin-recovery-START.ps1','EXTRACT-RECOVERY.ps1')
    z.write(ROOT/'docs/skin-recovery-2026-10-23/README.md','README-ko.md')
    z.write(ROOT/'docs/skin-recovery-2026-10-23/MAKOTO-REFERENCE.md','references/MAKOTO-REFERENCE.md')
    z.write(ROOT/'.cache/skin-audit/makoto-prts.html','references/makoto-prts.html')
    z.writestr('references/sources.json',json.dumps(references,ensure_ascii=False,indent=2))
    with zipfile.ZipFile(ROOT/'public/assets/local/dev-tools/arknights-cn-skin-fx-kit-python312.zip') as old:
        z.writestr('prepare_client.py',old.read('arknights-cn-skin-fx-kit/prepare_client.py'))
    for name,value in [('recovery-plan.json',plan),('baseline.snapshot.json',baseline),('cn-skin-table.snapshot.json',table),
                       ('tables/character_table.json',character),('tables/skill_table.json',skills)]:
        z.writestr(name,json.dumps(value,ensure_ascii=False,separators=(',',':')))
    for name in ('audio_data','range_table','battle_equip_table','uniequip_table'):
        z.write(ROOT/'.cache/skin-audit'/f'{name}.json',f'tables/{name}.json')
    for name in ('chess','tokens','backups'):
        p=ROOT/'content/production/data'/f'{name}.json'
        if p.exists():z.write(p,f'content/production/data/{name}.json')
with zipfile.ZipFile(out) as z:
    assert z.testzip() is None
    for name in modules:
        if name.endswith('.py'):compile(z.read('tools/local-extract/'+name),name,'exec')
    assert z.read('EXTRACT-RECOVERY.ps1').startswith(b'\xef\xbb\xbf')
print(out, out.stat().st_size,'bytes; roster',len(ids))

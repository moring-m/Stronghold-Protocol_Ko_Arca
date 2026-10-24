"""Compare official costume declarations to selectable models and installed FX mappings."""
import json
from pathlib import Path

def missing_skins(table, chess, assets, fx_index):
    ids={c['charId'] for c in chess.values() if c.get('charId')}
    mapped={c.get('skinId') for c in fx_index.get('costumes',{}).values()}
    result=[]
    for row in table['charSkins'].values():
        cid=row.get('charId')
        if cid not in ids or not (row.get('displaySkin') or {}).get('skinName'):continue
        model=row.get('battleSkin',{}).get('skinOrPrefabId','')
        mount='skin_'+''.join(c if c.isalnum() or c=='_' else '_' for c in model)
        selectable=any(e.get('id')==mount for c in chess.values() if c.get('charId')==cid for e in c.get('skins',[]))
        missing=[]
        if not selectable:missing.append('selection')
        if not assets.get('chars',{}).get(mount,{}).get('spine',{}).get('front'):missing.append('model')
        if row['skinId'] not in mapped:missing.append('fx-binding')
        if missing:result.append({'charId':cid,'skinId':row['skinId'],'name':row['displaySkin']['skinName'],'missing':missing})
    return result

if __name__=='__main__':
    root=Path(__file__).resolve().parents[1]
    read=lambda p:json.loads((root/p).read_text())
    rows=missing_skins(read('.cache/skin-audit/skin_table.json'),read('content/production/data/chess.json'),read('content/production/data/assets.json'),read('.cache/local-production/public/assets/local/fx/index.json'))
    out=root/'docs/skin-recovery-2026-10-23/missing-skins.json';out.write_text(json.dumps(rows,ensure_ascii=False,indent=2)+'\n');print('Missing/incomplete costumes:',len(rows))

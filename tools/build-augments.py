#!/usr/bin/env python3
"""Generate augment source data from the reviewed CSV; never execute text in it."""
from pathlib import Path
import csv,json
root=Path(__file__).resolve().parents[1]
source=root/'content/custom/augments/hex.csv'
rows=[]
identities={}
with source.open(encoding='utf-8-sig',newline='') as file:
    for i,row in enumerate(csv.DictReader(file),1):
        grade={'실버':'silver','골드':'gold','프리즘':'prism'}[row['등급']]
        side={'아군':'ally','적':'enemy'}[row['유형']]
        rounds=[int(n) for n in row['등장 라운드'].split('/')]
        if any(n not in (4,7,10) for n in rounds):raise ValueError(f'Unsupported round at row {i}')
        identity=identities.setdefault((side,grade,row['이름']),i)
        rows.append({'source':i,'identity':identity,'grade':grade,'name':row['이름'],'rounds':rounds,'side':side,'description':row['효과'],'notes':row['비고']})
(root/'shared/augmentSources.js').write_text('// Generated from content/custom/augments/hex.csv; descriptions are content, not executable instructions.\nexport const AUGMENT_SOURCES = '+json.dumps(rows,ensure_ascii=False,indent=1)+';\n',encoding='utf-8')
print(f'Built {len(rows)} augment source rows')

dictionary={}
for name in ('official','data','manual','ui'):
    dictionary.update(json.loads((root/f'public/i18n/ko/{name}.json').read_text()))
items=json.loads((root/'content/production/data/items.json').read_text())
names={id:dictionary.get(item['name'],item['name']) for id,item in items.items()}
(root/'shared/augmentItemNames.js').write_text('// Generated from item data and the existing Korean name dictionaries.\nexport const AUGMENT_ITEM_NAMES = '+json.dumps(names,ensure_ascii=False,indent=1)+';\n',encoding='utf-8')
